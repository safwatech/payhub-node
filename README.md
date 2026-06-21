# @payhub-ly/node

Official PayHub SDK for Node.js / TypeScript. ESM + CJS, types included,
zero runtime dependencies.

```
npm install @payhub-ly/node
```

> **PayHub API:** v1 · **Node:** ≥18 · **License:** MIT

## 1. Authenticate

```ts
import { Payhub } from "@payhub-ly/node";

const client = new Payhub({
  apiKey: process.env.PAYHUB_API_KEY!, // "phk_<id>.<secret>"
  baseUrl: "https://app.payhub.ly",     // omit on prod
});
```

## 2. Your first payment — Sadad OTP, end to end

```ts
// Step 1: initiate. SDK auto-mints an Idempotency-Key; pass your own to make
// retries safe across process restarts.
const payment = await client.payments.create({
  psp: "sadad",
  merchant_order_ref: "ord-42",
  amount_minor: 5,                  // 5 LYD
  customer: {
    msisdn: "218910000001",            // mandatory for Sadad
    birth_year: 1990,                  // mandatory for Sadad
  },
});

// Step 2: pattern-match the next_action. The SDK returns a discriminated
// union — switching on `kind` is exhaustive in TS.
if (payment.next_action?.kind === "OtpRequired") {
  console.log("Tell the customer to enter the OTP we just SMS'd to",
              payment.next_action.masked_destination);
}

// Step 3: customer types the OTP into your form; you POST it back.
const settled = await client.payments.confirm_otp(payment.id, "123456");
console.log(settled.status); // "succeeded" or "failed"
```

## 3. Webhook receiver (Express)

> ⚠️ **Pass the raw body bytes, not a parsed object.** Re-serializing a JSON
> body changes whitespace and breaks the HMAC. Use `express.raw()`, NOT
> `express.json()`, on the webhook route.

```ts
import express from "express";
import { WebhookEvent, WebhookSignatureError } from "@payhub-ly/node";

const app = express();

app.post(
  "/webhooks/payhub",
  express.raw({ type: "application/json" }),
  (req, res) => {
    const signature = req.header("Hub-Signature");
    if (!signature) return res.status(400).send("missing signature");
    try {
      const event = WebhookEvent.verify(
        process.env.PAYHUB_WEBHOOK_SECRET!,
        req.body,           // Buffer of raw bytes
        signature,
      );
      switch (event.type) {
        case "payment.succeeded":
          /* mark order paid */
          break;
        case "payment.failed":
        case "payment.expired":
          /* notify customer / unlock cart */
          break;
        case "payment.refunded":
          /* update accounting */
          break;
      }
      res.status(200).end();
    } catch (e) {
      if (e instanceof WebhookSignatureError) return res.status(401).end();
      throw e;
    }
  },
);
```

Default replay tolerance is 300 s. Override via
`WebhookEvent.verify(..., { toleranceSeconds: 60 })`.

## 4. Errors

| Exception | Fires on |
| --- | --- |
| `AuthenticationError` | 401 — bad API key, IP not allowlisted |
| `PermissionError` | 403 |
| `NotFoundError` | 404 — payment doesn't belong to this merchant |
| `ValidationError` | 422 — `customer.msisdn` missing for Sadad, `amount_minor` ≤ 0, etc. |
| `IdempotencyConflict` | 409 — same `Idempotency-Key` reused with a different body |
| `RateLimited` | 429 — exposes `.retryAfter` |
| `GatewayError` | 502 — upstream PSP rejected (Moamalat, Sadad, …) |
| `ServerError` | 500 |
| `TimeoutError`, `ConnectionError`, `DecodeError` | network / serialization |
| `WebhookSignatureError` (subclasses below) | webhook verification |
| → `MalformedHeader` | `Hub-Signature` missing `t=` or `v1=` |
| → `TimestampOutOfTolerance` | `\|now - t\| > tolerance` (carries `.skewSeconds`) |
| → `InvalidSignature` | HMAC mismatch / non-JSON body |

All API errors carry `.code`, `.httpStatus`, `.details`, `.requestId` — log
`requestId` to support tickets, it's the same ID you'll see server-side.

## Configuration

```ts
new Payhub({
  apiKey: "phk_…",
  baseUrl: "https://app.payhub.ly",
  timeoutMs: 30_000,
  maxRetries: 2,             // idempotent calls only; never on a non-keyed POST
  fetch: customFetch,        // injection seam (proxies, tests)
  userAgentSuffix: "Acme/1.2",
});
```

## Versioning

Independent semver. Compatible with PayHub API v1. The SDK never emits
`X-API-Key` (server accepts it but `Authorization: Bearer` is unambiguous).

## Development

```
npm install
npm test          # vitest, includes the cross-language webhook vectors
npm run build     # tsc → dist/
```

The webhook vector tests load
`../shared/test-vectors/webhook-signing.json` — that file is the canonical
spec; the same file is consumed by every other PayHub SDK and by the
server's own `tests/unit/test_webhook_signing_vectors.py`.
