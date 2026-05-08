/**
 * Discriminated `NextAction` returned in `Payment.next_action`.
 *
 * Encoded over the wire with a `type` discriminator; the SDK exposes a
 * tagged union with `kind` so merchants can `switch (na.kind)`
 * exhaustively.
 */
export interface OtpRequired {
    readonly kind: "OtpRequired";
    readonly psp_ref: string;
    readonly masked_destination: string;
    readonly expires_at?: string | null;
}
export interface Redirect {
    readonly kind: "Redirect";
    readonly url: string;
    readonly method: "GET" | "POST";
    readonly fields: Record<string, string>;
    readonly expires_at?: string | null;
}
export interface QR {
    readonly kind: "QR";
    readonly reference: string;
    readonly qr_payload: string;
    readonly expires_at?: string | null;
}
export interface Lightbox {
    readonly kind: "Lightbox";
    readonly params: Record<string, string>;
    readonly script_url?: string | null;
}
export type NextAction = OtpRequired | Redirect | QR | Lightbox;
export declare function decodeNextAction(raw: unknown): NextAction | null;
//# sourceMappingURL=nextAction.d.ts.map