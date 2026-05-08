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
export declare class WebhookSignatureError extends Error {
    constructor(message: string);
}
export declare class MalformedHeader extends WebhookSignatureError {
}
export declare class TimestampOutOfTolerance extends WebhookSignatureError {
    readonly skewSeconds: number;
    constructor(skew: number);
}
export declare class InvalidSignature extends WebhookSignatureError {
}
export interface WebhookEvent {
    id: string;
    type: string;
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
export declare const WebhookEvent: {
    verify(secret: string | Uint8Array | Buffer, body: string | Uint8Array | Buffer, header: string, options?: VerifyOptions): WebhookEvent;
};
//# sourceMappingURL=signing.d.ts.map