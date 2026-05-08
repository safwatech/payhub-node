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
export class PayhubError extends Error {
    constructor(message) {
        super(message);
        this.name = new.target.name;
    }
}
export class PayhubAPIError extends PayhubError {
    code;
    httpStatus;
    details;
    requestId;
    constructor(opts) {
        super(opts.message);
        this.code = opts.code;
        this.httpStatus = opts.httpStatus;
        this.details = opts.details ?? {};
        this.requestId = opts.requestId ?? null;
    }
}
export class AuthenticationError extends PayhubAPIError {
}
export class PermissionError extends PayhubAPIError {
}
export class NotFoundError extends PayhubAPIError {
}
export class ValidationError extends PayhubAPIError {
}
export class IdempotencyConflict extends PayhubAPIError {
}
export class RateLimited extends PayhubAPIError {
    retryAfter;
    constructor(opts) {
        super(opts);
        this.retryAfter = opts.retryAfter ?? null;
    }
}
export class GatewayError extends PayhubAPIError {
}
export class ServerError extends PayhubAPIError {
}
export class PayhubTransportError extends PayhubError {
}
export class TimeoutError extends PayhubTransportError {
}
export class ConnectionError extends PayhubTransportError {
}
export class DecodeError extends PayhubTransportError {
}
export function fromEnvelope(envelope, httpStatus, retryAfter = null) {
    const { code, message, details = {}, request_id = null } = envelope.error;
    const opts = { message, code, httpStatus, details, requestId: request_id };
    if (httpStatus === 401)
        return new AuthenticationError(opts);
    if (httpStatus === 403)
        return new PermissionError(opts);
    if (httpStatus === 404)
        return new NotFoundError(opts);
    if (httpStatus === 409)
        return new IdempotencyConflict(opts);
    if (httpStatus === 422)
        return new ValidationError(opts);
    if (httpStatus === 429)
        return new RateLimited({ ...opts, retryAfter });
    if (httpStatus >= 500 && httpStatus < 600) {
        if (code.startsWith("gateway."))
            return new GatewayError(opts);
        return new ServerError(opts);
    }
    return new PayhubAPIError(opts);
}
//# sourceMappingURL=errors.js.map