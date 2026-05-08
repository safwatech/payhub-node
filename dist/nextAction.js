/**
 * Discriminated `NextAction` returned in `Payment.next_action`.
 *
 * Encoded over the wire with a `type` discriminator; the SDK exposes a
 * tagged union with `kind` so merchants can `switch (na.kind)`
 * exhaustively.
 */
export function decodeNextAction(raw) {
    if (raw === null || raw === undefined)
        return null;
    if (typeof raw !== "object") {
        throw new Error("next_action must be an object or null");
    }
    const r = raw;
    switch (r.type) {
        case "otp_required":
            return {
                kind: "OtpRequired",
                psp_ref: String(r["psp_ref"] ?? ""),
                masked_destination: String(r["masked_destination"] ?? ""),
                expires_at: r["expires_at"] ?? null,
            };
        case "redirect":
            return {
                kind: "Redirect",
                url: String(r["url"] ?? ""),
                method: (r["method"] ?? "GET").toUpperCase(),
                fields: r["fields"] ?? {},
                expires_at: r["expires_at"] ?? null,
            };
        case "qr":
            return {
                kind: "QR",
                reference: String(r["reference"] ?? ""),
                qr_payload: String(r["qr_payload"] ?? ""),
                expires_at: r["expires_at"] ?? null,
            };
        case "lightbox": {
            const params = r["params"] ?? {};
            const scriptUrl = params["lightbox_js_url"] ?? null;
            return {
                kind: "Lightbox",
                params,
                script_url: scriptUrl,
            };
        }
        default:
            throw new Error(`unknown next_action.type: ${String(r.type)}`);
    }
}
//# sourceMappingURL=nextAction.js.map