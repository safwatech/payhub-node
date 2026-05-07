/**
 * Public types mirroring the v1 API.
 *
 * Snake-case field names are kept verbatim from the server response so
 * merchants pasting `console.log(payment)` see the same keys as in
 * `/v1/openapi.json`. JS-idiomatic methods (camelCase) live on the
 * client surface.
 */

import type { NextAction } from "./nextAction.js";

export interface CreatePaymentRequest {
  psp: "sadad" | "moamalat" | "mobicash" | "tlync" | "adfali";
  merchant_order_ref: string;
  amount_minor: number;
  currency?: string;
  customer: {
    msisdn?: string;
    birth_year?: number;
    email?: string;
    [k: string]: unknown;
  };
  return_urls?: {
    success_url?: string;
    cancel_url?: string;
    callback_url?: string;
  };
  metadata?: Record<string, unknown>;
  hosted_checkout?: boolean;
}

export interface Payment {
  id: string;
  status: string;
  psp: string;
  psp_ref: string | null;
  next_action: NextAction | null;
  amount_minor: number;
  currency: string;
  merchant_order_ref: string;
  hosted_checkout_url?: string | null;
}

export interface RefundRequest {
  amount_minor?: number;
  reason?: string;
}

export interface Refund extends Payment {}

export interface Health {
  status: string;
  psps: string[];
}
