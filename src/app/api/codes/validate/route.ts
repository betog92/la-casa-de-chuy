import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";
import { validateCheckoutCode } from "@/lib/payments/validate-checkout-code";

/**
 * Valida un único campo "Código" en checkout.
 * El servidor decide si es cupón de marketing o código de referido.
 *
 * Respuesta:
 *  - `type: "discount"` → `{ code, discountPercentage, description }`.
 *  - `type: "referral"` → `{ code, inviteeDiscountAmount, referrerCreditAmount }`.
 *    NO trae `discountPercentage` porque el referido descuenta un monto fijo
 *    (no un porcentaje del total).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    const body = (await request.json().catch(() => ({}))) as {
      code?: string;
      email?: string;
    };

    if (
      !body.code ||
      typeof body.code !== "string" ||
      body.code.trim() === ""
    ) {
      return validationErrorResponse("El código es requerido");
    }

    const email =
      body.email && typeof body.email === "string"
        ? body.email.toLowerCase().trim()
        : undefined;

    const result = await validateCheckoutCode(supabase, {
      codeRaw: body.code,
      contactEmail: email,
    });

    if (!result.ok) {
      return errorResponse(result.message, 400);
    }

    if (result.type === "discount") {
      return successResponse({
        valid: true,
        type: "discount",
        code: result.code,
        discountPercentage: result.discountPercentage,
        description: result.description,
      });
    }

    return successResponse({
      valid: true,
      type: "referral",
      code: result.code,
      inviteeDiscountAmount: result.inviteeDiscountAmount,
      referrerCreditAmount: result.referrerCreditAmount,
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al validar el código";
    console.error("Error inesperado en /api/codes/validate:", error);
    return errorResponse(errorMessage, 500);
  }
}
