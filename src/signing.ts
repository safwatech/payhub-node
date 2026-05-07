/**
 * Webhook signature verification.
 *
 * Algorithmic reference: `app/core/signing.py`. Header is
 * `Hub-Signature: t=<unix>,v1=<hex_hmac_sha256>`; signed bytes are
 * `f"{t}.".encode() + raw_body`. Default tolerance ±300 s.
 *
 * `WebhookEvent.verify` is the merchant-facing primitive. It throws on
 * any failure mode so a forgotten branch can't silently accept bad
 * signatures (boolean returns are an anti-pattern here).
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export class WebhookSignatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}
export class MalformedHeader extends WebhookSignatureError {}
export class TimestampOutOfTolerance extends WebhookSignatureError {
  readonly skewSeconds: number;
  constructor(skew: number) {
    super(`webhook timestamp out of tolerance: ${skew}s skew`);
    this.skewSeconds = skew;
  }
}
export class InvalidSignature extends WebhookSignatureError {}

export interface WebhookEvent {
  id: string;
  type: string; // payment.succeeded | payment.failed | payment.expired | payment.refunded | future
  payment_id: string;
  prev_status: string | null;
  new_status: string;
  source: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface VerifyOptions {
  toleranceSeconds?: number;
  /** Override the wall clock — for tests / replay analysis. Seconds since epoch. */
  now?: number;
}

const DEFAULT_TOLERANCE = 300;

function parseHeader(header: string): { t: number; v1: string } {
  const parts: Record<string, string> = {};
  for (const seg of header.split(",")) {
    const idx = seg.indexOf("=");
    if (idx <= 0) continue;
    const k = seg.slice(0, idx).trim();
    const v = seg.slice(idx + 1).trim();
    parts[k] = v;
  }
  const tRaw = parts["t"];
  const v1 = parts["v1"];
  if (!tRaw || !v1) {
    throw new MalformedHeader(`Hub-Signature missing t or v1: ${header}`);
  }
  const t = Number.parseInt(tRaw, 10);
  if (!Number.isFinite(t)) {
    throw new MalformedHeader(`Hub-Signature t is not an integer: ${tRaw}`);
  }
  return { t, v1 };
}

function toBytes(secret: string | Uint8Array | Buffer): Buffer {
  if (typeof secret === "string") return Buffer.from(secret, "utf8");
  return Buffer.from(secret);
}

function bodyToBuffer(body: string | Uint8Array | Buffer): Buffer {
  if (typeof body === "string") return Buffer.from(body, "utf8");
  return Buffer.from(body);
}

export const WebhookEvent = {
  verify(
    secret: string | Uint8Array | Buffer,
    body: string | Uint8Array | Buffer,
    header: string,
    options: VerifyOptions = {},
  ): WebhookEvent {
    const tolerance = options.toleranceSeconds ?? DEFAULT_TOLERANCE;
    const now = options.now ?? Math.floor(Date.now() / 1000);
    const { t, v1 } = parseHeader(header);

    const skew = Math.abs(now - t);
    if (skew > tolerance) throw new TimestampOutOfTolerance(skew);

    const secretBuf = toBytes(secret);
    const bodyBuf = bodyToBuffer(body);
    const signed = Buffer.concat([Buffer.from(`${t}.`, "utf8"), bodyBuf]);
    const expected = createHmac("sha256", secretBuf).update(signed).digest("hex");

    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(v1, "utf8");
    // timingSafeEqual requires equal length — pad to avoid leaking length.
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new InvalidSignature("Hub-Signature v1 does not match");
    }

    // The body is JSON; safe to parse now that we have authenticated it.
    let event: WebhookEvent;
    try {
      event = JSON.parse(bodyBuf.toString("utf8")) as WebhookEvent;
    } catch (e) {
      throw new InvalidSignature(`webhook body is not JSON: ${(e as Error).message}`);
    }
    return event;
  },
};
