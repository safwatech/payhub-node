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
import { ConnectionError, DecodeError, PayhubError, TimeoutError, fromEnvelope, } from "./errors.js";
import { decodeNextAction } from "./nextAction.js";
export const VERSION = "1.0.0";
const DEFAULT_BASE_URL = "https://app.payhub.ly";
const DEFAULT_TIMEOUT_MS = 30_000;
function platformUserAgent(suffix) {
    const base = `payhub-node/${VERSION} (node ${process.version})`;
    return suffix ? `${base} ${suffix}` : base;
}
function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function expBackoff(attempt) {
    // 0.5s, 1.0s, 2.0s, 4.0s, ...
    const base = 500 * 2 ** attempt;
    // ±20% jitter
    return Math.floor(base * (0.8 + Math.random() * 0.4));
}
export class Payhub {
    apiKey;
    baseUrl;
    timeoutMs;
    maxRetries;
    fetchImpl;
    ua;
    payments;
    health;
    constructor(opts) {
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
    async _request(opts) {
        const headers = {
            Authorization: `Bearer ${this.apiKey}`,
            Accept: "application/json",
            "User-Agent": this.ua,
        };
        let bodyStr;
        if (opts.body !== undefined) {
            bodyStr = JSON.stringify(opts.body);
            headers["Content-Type"] = "application/json";
        }
        if (opts.idempotencyKey) {
            headers["Idempotency-Key"] = opts.idempotencyKey;
        }
        let lastErr;
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
                    if (res.status === 204)
                        return undefined;
                    const text = await res.text();
                    if (!text)
                        return undefined;
                    try {
                        return JSON.parse(text);
                    }
                    catch (e) {
                        throw new DecodeError(`failed to decode JSON response: ${e.message}`);
                    }
                }
                // Non-2xx — try to read the error envelope.
                const text = await res.text().catch(() => "");
                let envelope = null;
                try {
                    envelope = text ? JSON.parse(text) : null;
                }
                catch {
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
                if (opts.retriable &&
                    attempt + 1 < totalAttempts &&
                    (res.status >= 500 || res.status === 429)) {
                    const wait = retryAfter ? retryAfter * 1000 : expBackoff(attempt);
                    await delay(wait);
                    lastErr = apiErr;
                    continue;
                }
                throw apiErr;
            }
            catch (e) {
                clearTimeout(tm);
                // Typed PayhubError (incl. PayhubAPIError subclasses) raised from
                // the success/error path above — propagate without retry attempts
                // beyond what was already decided inline.
                if (e instanceof PayhubError)
                    throw e;
                if (e.name === "AbortError") {
                    lastErr = new TimeoutError(`request timed out after ${this.timeoutMs}ms`);
                }
                else {
                    lastErr = new ConnectionError(`transport error: ${e.message}`);
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
    _decodePayment(raw) {
        const r = raw;
        return {
            id: String(r["id"]),
            status: String(r["status"]),
            psp: String(r["psp"]),
            psp_ref: r["psp_ref"] ?? null,
            next_action: decodeNextAction(r["next_action"]),
            amount_minor: Number(r["amount_minor"]),
            currency: String(r["currency"]),
            merchant_order_ref: String(r["merchant_order_ref"]),
            hosted_checkout_url: r["hosted_checkout_url"] ?? null,
        };
    }
}
class PaymentsResource {
    client;
    constructor(client) {
        this.client = client;
    }
    async create(req, options) {
        const key = options?.idempotencyKey ?? randomUUID();
        const raw = await this.client._request({
            method: "POST",
            path: "/v1/payments",
            body: req,
            idempotencyKey: key,
            retriable: true,
        });
        return this.client._decodePayment(raw);
    }
    async confirmOtp(paymentId, code, options) {
        const key = options?.idempotencyKey ?? randomUUID();
        const raw = await this.client._request({
            method: "POST",
            path: `/v1/payments/${encodeURIComponent(paymentId)}/otp`,
            body: { code },
            idempotencyKey: key,
            retriable: true,
        });
        return this.client._decodePayment(raw);
    }
    async refund(paymentId, req = {}, options) {
        const key = options?.idempotencyKey ?? randomUUID();
        const raw = await this.client._request({
            method: "POST",
            path: `/v1/payments/${encodeURIComponent(paymentId)}/refund`,
            body: req,
            idempotencyKey: key,
            retriable: true,
        });
        return this.client._decodePayment(raw);
    }
    async retrieve(paymentId) {
        const raw = await this.client._request({
            method: "GET",
            path: `/v1/payments/${encodeURIComponent(paymentId)}`,
            retriable: true,
        });
        return this.client._decodePayment(raw);
    }
}
class HealthResource {
    client;
    constructor(client) {
        this.client = client;
    }
    check() {
        return this.client._request({
            method: "GET",
            path: "/v1/health",
            retriable: true,
        });
    }
}
//# sourceMappingURL=client.js.map