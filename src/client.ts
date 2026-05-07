/**
 * `Payhub` — namespaced HTTP client over the v1 API.
 *
 * Mirrors the layout of `web/src/api/client.ts` (the React admin client)
 * so cross-referencing JS and the SDK reads the same. The public methods
 * live under namespaces (`client.payments.create(...)`,
 * `client.health.check(...)`) — flat methods are not exposed.
 *
 * Retries: idempotent calls (or any call carrying an `Idempotency-Key`)
 * are retried on 5xx + transport errors, honoring `Retry-After`. Other
 * 4xx are never retried. Default budget is 2 (so up to 3 attempts).
 */

import { randomUUID } from "node:crypto";
import {
  ConnectionError,
  DecodeError,
  PayhubError,
  TimeoutError,
  fromEnvelope,
  type ApiErrorEnvelope,
} from "./errors.js";
import { decodeNextAction } from "./nextAction.js";
import type {
  CreatePaymentRequest,
  Health,
  Payment,
  Refund,
  RefundRequest,
} from "./types.js";

export const VERSION = "1.0.0";
const DEFAULT_BASE_URL = "https://app.payhub.ly";
const DEFAULT_TIMEOUT_MS = 30_000;

export interface ClientOptions {
  apiKey: string;
  baseUrl?: string;
  timeoutMs?: number;
  maxRetries?: number;
  /** Inject a custom fetch (for tests or proxying); must match WHATWG fetch. */
  fetch?: typeof fetch;
  userAgentSuffix?: string;
}

interface RequestOptions {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  idempotencyKey?: string;
  /** Whether the call is safe to retry on transport / 5xx. GETs and any call
   * carrying an Idempotency-Key are safe; non-keyed POSTs are not. */
  retriable: boolean;
}

function platformUserAgent(suffix?: string): string {
  const base = `payhub-node/${VERSION} (node ${process.version})`;
  return suffix ? `${base} ${suffix}` : base;
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function expBackoff(attempt: number): number {
  // 0.5s, 1.0s, 2.0s, 4.0s, ...
  const base = 500 * 2 ** attempt;
  // ±20% jitter
  return Math.floor(base * (0.8 + Math.random() * 0.4));
}

export class Payhub {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly fetchImpl: typeof fetch;
  private readonly ua: string;

  readonly payments: PaymentsResource;
  readonly health: HealthResource;

  constructor(opts: ClientOptions) {
    if (!opts.apiKey || !opts.apiKey.startsWith("phk_")) {
      throw new Error('PayHub API key must start with "phk_"');
    }
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? 2;
    this.fetchImpl = opts.fetch ?? globalThis.fetch;
    this.ua = platformUserAgent(opts.userAgentSuffix);
    this.payments = new PaymentsResource(this);
    this.health = new HealthResource(this);
  }

  /** @internal */
  async _request<T>(opts: RequestOptions): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json",
      "User-Agent": this.ua,
    };
    let bodyStr: string | undefined;
    if (opts.body !== undefined) {
      bodyStr = JSON.stringify(opts.body);
      headers["Content-Type"] = "application/json";
    }
    if (opts.idempotencyKey) {
      headers["Idempotency-Key"] = opts.idempotencyKey;
    }

    let lastErr: unknown;
    const totalAttempts = (opts.retriable ? this.maxRetries : 0) + 1;
    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${opts.path}`, {
          method: opts.method,
          headers,
          body: bodyStr,
          signal: ctl.signal,
        });
        clearTimeout(tm);
        if (res.status >= 200 && res.status < 300) {
          if (res.status === 204) return undefined as T;
          const text = await res.text();
          if (!text) return undefined as T;
          try {
            return JSON.parse(text) as T;
          } catch (e) {
            throw new DecodeError(`failed to decode JSON response: ${(e as Error).message}`);
          }
        }
        // Non-2xx — try to read the error envelope.
        const text = await res.text().catch(() => "");
        let envelope: ApiErrorEnvelope | null = null;
        try {
          envelope = text ? (JSON.parse(text) as ApiErrorEnvelope) : null;
        } catch {
          envelope = null;
        }
        if (!envelope || !envelope.error) {
          envelope = {
            error: {
              code: "hub.unknown",
              message: text || `HTTP ${res.status}`,
            },
          };
        }
        const retryAfterHeader = res.headers.get("retry-after");
        const retryAfter = retryAfterHeader ? Number(retryAfterHeader) : null;
        const apiErr = fromEnvelope(envelope, res.status, retryAfter);
        // Retry only on 5xx + 429 if call is retriable.
        if (
          opts.retriable &&
          attempt + 1 < totalAttempts &&
          (res.status >= 500 || res.status === 429)
        ) {
          const wait = retryAfter ? retryAfter * 1000 : expBackoff(attempt);
          await delay(wait);
          lastErr = apiErr;
          continue;
        }
        throw apiErr;
      } catch (e) {
        clearTimeout(tm);
        // Typed PayhubError (incl. PayhubAPIError subclasses) raised from
        // the success/error path above — propagate without retry attempts
        // beyond what was already decided inline.
        if (e instanceof PayhubError) throw e;
        if ((e as { name?: string }).name === "AbortError") {
          lastErr = new TimeoutError(`request timed out after ${this.timeoutMs}ms`);
        } else {
          lastErr = new ConnectionError(`transport error: ${(e as Error).message}`);
        }
        if (opts.retriable && attempt + 1 < totalAttempts) {
          await delay(expBackoff(attempt));
          continue;
        }
        throw lastErr;
      }
    }
    throw lastErr ?? new Error("payhub: unreachable");
  }

  /** @internal */
  _decodePayment(raw: unknown): Payment {
    const r = raw as Record<string, unknown>;
    return {
      id: String(r["id"]),
      status: String(r["status"]),
      psp: String(r["psp"]),
      psp_ref: (r["psp_ref"] as string | null) ?? null,
      next_action: decodeNextAction(r["next_action"]),
      amount_minor: Number(r["amount_minor"]),
      currency: String(r["currency"]),
      merchant_order_ref: String(r["merchant_order_ref"]),
      hosted_checkout_url: (r["hosted_checkout_url"] as string | null | undefined) ?? null,
    };
  }
}

class PaymentsResource {
  constructor(private readonly client: Payhub) {}

  async create(req: CreatePaymentRequest, options?: { idempotencyKey?: string }): Promise<Payment> {
    const key = options?.idempotencyKey ?? randomUUID();
    const raw = await this.client._request<unknown>({
      method: "POST",
      path: "/v1/payments",
      body: req,
      idempotencyKey: key,
      retriable: true,
    });
    return this.client._decodePayment(raw);
  }

  async confirmOtp(
    paymentId: string,
    code: string,
    options?: { idempotencyKey?: string },
  ): Promise<Payment> {
    const key = options?.idempotencyKey ?? randomUUID();
    const raw = await this.client._request<unknown>({
      method: "POST",
      path: `/v1/payments/${encodeURIComponent(paymentId)}/otp`,
      body: { code },
      idempotencyKey: key,
      retriable: true,
    });
    return this.client._decodePayment(raw);
  }

  async refund(
    paymentId: string,
    req: RefundRequest = {},
    options?: { idempotencyKey?: string },
  ): Promise<Refund> {
    const key = options?.idempotencyKey ?? randomUUID();
    const raw = await this.client._request<unknown>({
      method: "POST",
      path: `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
      body: req,
      idempotencyKey: key,
      retriable: true,
    });
    return this.client._decodePayment(raw);
  }

  async retrieve(paymentId: string): Promise<Payment> {
    const raw = await this.client._request<unknown>({
      method: "GET",
      path: `/v1/payments/${encodeURIComponent(paymentId)}`,
      retriable: true,
    });
    return this.client._decodePayment(raw);
  }
}

class HealthResource {
  constructor(private readonly client: Payhub) {}
  check(): Promise<Health> {
    return this.client._request<Health>({
      method: "GET",
      path: "/v1/health",
      retriable: true,
    });
  }
}
