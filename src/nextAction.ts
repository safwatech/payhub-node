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

interface RawNextAction {
  type: string;
  [k: string]: unknown;
}

export function decodeNextAction(raw: unknown): NextAction | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") {
    throw new Error("next_action must be an object or null");
  }
  const r = raw as RawNextAction;
  switch (r.type) {
    case "otp_required":
      return {
        kind: "OtpRequired",
        psp_ref: String(r["psp_ref"] ?? ""),
        masked_destination: String(r["masked_destination"] ?? ""),
        expires_at: (r["expires_at"] as string | null | undefined) ?? null,
      };
    case "redirect":
      return {
        kind: "Redirect",
        url: String(r["url"] ?? ""),
        method: ((r["method"] as string) ?? "GET").toUpperCase() as "GET" | "POST",
        fields: (r["fields"] as Record<string, string>) ?? {},
        expires_at: (r["expires_at"] as string | null | undefined) ?? null,
      };
    case "qr":
      return {
        kind: "QR",
        reference: String(r["reference"] ?? ""),
        qr_payload: String(r["qr_payload"] ?? ""),
        expires_at: (r["expires_at"] as string | null | undefined) ?? null,
      };
    case "lightbox": {
      const params = (r["params"] as Record<string, string>) ?? {};
      const scriptUrl = (params["lightbox_js_url"] as string | undefined) ?? null;
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
