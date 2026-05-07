import { describe, expect, it } from "vitest";
import { Payhub, AuthenticationError, ValidationError, IdempotencyConflict } from "../src/index.js";

interface Recorded {
  url: string;
  init: RequestInit;
}

function mockFetch(responses: Array<{ status: number; body: unknown; headers?: Record<string, string> }>): {
  fetch: typeof fetch;
  recorded: Recorded[];
} {
  const recorded: Recorded[] = [];
  let i = 0;
  const fetchImpl: typeof fetch = async (input, init) => {
    recorded.push({ url: String(input), init: init ?? {} });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  };
  return { fetch: fetchImpl, recorded };
}

describe("Payhub client", () => {
  it("payments.create sends the right method/headers/body and decodes Payment", async () => {
    const { fetch, recorded } = mockFetch([
      {
        status: 201,
        body: {
          id: "pay_1",
          status: "requires_action",
          psp: "sadad",
          psp_ref: "TXN_1",
          next_action: { type: "otp_required", psp_ref: "TXN_1", masked_destination: "2189...12" },
          amount_minor: 4500,
          currency: "LYD",
          merchant_order_ref: "ord-1",
        },
      },
    ]);
    const c = new Payhub({ apiKey: "phk_aaa.bbb", fetch });
    const p = await c.payments.create({
      psp: "sadad",
      merchant_order_ref: "ord-1",
      amount_minor: 4500,
      customer: { msisdn: "218910000001", birth_year: 1990 },
    });
    expect(p.status).toBe("requires_action");
    expect(p.next_action?.kind).toBe("OtpRequired");
    expect(recorded[0]!.url.endsWith("/v1/payments")).toBe(true);
    const headers = recorded[0]!.init.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer phk_aaa.bbb");
    expect(headers["Idempotency-Key"]).toBeTruthy();
  });

  it("rejects API key without phk_ prefix", () => {
    expect(() => new Payhub({ apiKey: "wrong" })).toThrow(/phk_/);
  });

  it("maps 401 -> AuthenticationError", async () => {
    const { fetch } = mockFetch([
      { status: 401, body: { error: { code: "hub.unauthenticated", message: "no" } } },
    ]);
    const c = new Payhub({ apiKey: "phk_a.b", fetch, maxRetries: 0 });
    await expect(c.health.check()).rejects.toBeInstanceOf(AuthenticationError);
  });

  it("maps 422 -> ValidationError", async () => {
    const { fetch } = mockFetch([
      { status: 422, body: { error: { code: "hub.invalid_amount", message: "bad" } } },
    ]);
    const c = new Payhub({ apiKey: "phk_a.b", fetch, maxRetries: 0 });
    await expect(c.health.check()).rejects.toBeInstanceOf(ValidationError);
  });

  it("maps 409 -> IdempotencyConflict", async () => {
    const { fetch } = mockFetch([
      { status: 409, body: { error: { code: "hub.idempotency_conflict", message: "dup" } } },
    ]);
    const c = new Payhub({ apiKey: "phk_a.b", fetch, maxRetries: 0 });
    await expect(
      c.payments.create({
        psp: "sadad",
        merchant_order_ref: "x",
        amount_minor: 100,
        customer: { msisdn: "218910000001", birth_year: 1990 },
      }),
    ).rejects.toBeInstanceOf(IdempotencyConflict);
  });

  it("retries on 503 then succeeds", async () => {
    const { fetch, recorded } = mockFetch([
      { status: 503, body: { error: { code: "hub.unavailable", message: "x" } } },
      { status: 200, body: { status: "ok", psps: ["sadad"] } },
    ]);
    const c = new Payhub({ apiKey: "phk_a.b", fetch, maxRetries: 2 });
    const h = await c.health.check();
    expect(h.status).toBe("ok");
    expect(recorded.length).toBe(2);
  });
});
