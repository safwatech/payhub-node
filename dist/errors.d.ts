/**
 * PayHub error hierarchy.
 *
 * Every HTTP failure that comes back with a parseable
 * `{error: {code, message, details, request_id}}` envelope becomes a
 * subclass of `PayhubAPIError`. Network/transport problems become
 * subclasses of `PayhubTransportError`. Both share `PayhubError` as base
 * so callers can catch broadly.
 *
 * The `code` strings come from the server (`hub.*`, `gateway.<psp>.*`).
 * Subclass selection is driven by HTTP status with a small dictionary
 * for special-cased dot-paths — keep it in sync with `app/core/errors.py`.
 */
export declare class PayhubError extends Error {
    constructor(message: string);
}
export declare class PayhubAPIError extends PayhubError {
    readonly code: string;
    readonly httpStatus: number;
    readonly details: Record<string, unknown>;
    readonly requestId: string | null;
    constructor(opts: {
        message: string;
        code: string;
        httpStatus: number;
        details?: Record<string, unknown>;
        requestId?: string | null;
    });
}
export declare class AuthenticationError extends PayhubAPIError {
}
export declare class PermissionError extends PayhubAPIError {
}
export declare class NotFoundError extends PayhubAPIError {
}
export declare class ValidationError extends PayhubAPIError {
}
export declare class IdempotencyConflict extends PayhubAPIError {
}
export declare class RateLimited extends PayhubAPIError {
    readonly retryAfter: number | null;
    constructor(opts: ConstructorParameters<typeof PayhubAPIError>[0] & {
        retryAfter?: number | null;
    });
}
export declare class GatewayError extends PayhubAPIError {
}
export declare class ServerError extends PayhubAPIError {
}
export declare class PayhubTransportError extends PayhubError {
}
export declare class TimeoutError extends PayhubTransportError {
}
export declare class ConnectionError extends PayhubTransportError {
}
export declare class DecodeError extends PayhubTransportError {
}
export interface ApiErrorEnvelope {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
        request_id?: string | null;
    };
}
export declare function fromEnvelope(envelope: ApiErrorEnvelope, httpStatus: number, retryAfter?: number | null): PayhubAPIError;
//# sourceMappingURL=errors.d.ts.map