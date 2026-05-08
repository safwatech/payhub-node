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
import type { CreatePaymentRequest, Health, Payment, Refund, RefundRequest } from "./types.js";
export declare const VERSION = "1.0.0";
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
export declare class Payhub {
    private readonly apiKey;
    private readonly baseUrl;
    private readonly timeoutMs;
    private readonly maxRetries;
    private readonly fetchImpl;
    private readonly ua;
    readonly payments: PaymentsResource;
    readonly health: HealthResource;
    constructor(opts: ClientOptions);
    /** @internal */
    _request<T>(opts: RequestOptions): Promise<T>;
    /** @internal */
    _decodePayment(raw: unknown): Payment;
}
declare class PaymentsResource {
    private readonly client;
    constructor(client: Payhub);
    create(req: CreatePaymentRequest, options?: {
        idempotencyKey?: string;
    }): Promise<Payment>;
    confirmOtp(paymentId: string, code: string, options?: {
        idempotencyKey?: string;
    }): Promise<Payment>;
    refund(paymentId: string, req?: RefundRequest, options?: {
        idempotencyKey?: string;
    }): Promise<Refund>;
    retrieve(paymentId: string): Promise<Payment>;
}
declare class HealthResource {
    private readonly client;
    constructor(client: Payhub);
    check(): Promise<Health>;
}
export {};
//# sourceMappingURL=client.d.ts.map