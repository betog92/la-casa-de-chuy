import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { getMonterreyToday } from "@/utils/business-days";
import type { Database } from "@/types/database.types";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";

type DiscountCode = Database["public"]["Tables"]["discount_codes"]["Row"];

export async function POST(request: NextRequest) {
  try {
    const supabase = createServiceRoleClient();
    const body = await request.json();

    const { code, email } = body;

    // Validar que el código esté presente
    if (!code || typeof code !== "string" || code.trim() === "") {
      return validationErrorResponse("El código es requerido");
    }

    const codeUpper = code.trim().toUpperCase();

    // Buscar el código en la base de datos
    const { data: discountCode, error: codeError } = await supabase
      .from("discount_codes")
      .select("*")
      .eq("code", codeUpper)
      .single();

    if (codeError || !discountCode) {
      return errorResponse("Código de descuento no válido", 404);
    }

    // Type assertion para ayudar a TypeScript
    const discountCodeRow = discountCode as DiscountCode;

    // Validar que esté activo
    if (!discountCodeRow.active) {
      return errorResponse("Este código de descuento no está activo", 400);
    }

    // Validar fecha de expiración
    const today = getMonterreyToday();

    const validFrom = new Date(discountCodeRow.valid_from);
    validFrom.setHours(0, 0, 0, 0);

    const validUntil = new Date(discountCodeRow.valid_until);
    validUntil.setHours(23, 59, 59, 999);

    if (today < validFrom) {
      return errorResponse(
        `Este código será válido a partir del ${validFrom.toLocaleDateString(
          "es-MX"
        )}`,
        400
      );
    }

    if (today > validUntil) {
      return errorResponse("Este código de descuento ha expirado", 400);
    }

    // Validar límite de usos totales
    if (discountCodeRow.current_uses >= discountCodeRow.max_uses) {
      return errorResponse(
        "Este código de descuento ha alcanzado su límite de usos",
        400
      );
    }

    // Validar que el usuario/email no haya usado este código antes
    if (email && email.trim()) {
      const { data: existingUse, error: useError } = await supabase
        .from("discount_code_uses")
        .select("id")
        .eq("discount_code_id", discountCodeRow.id)
        .eq("email", email.toLowerCase().trim())
        .maybeSingle();

      if (existingUse) {
        return errorResponse(
          "Ya has usado este código de descuento anteriormente",
          400
        );
      }
    }

    // Retornar información del código válido
    return successResponse({
      valid: true,
      code: discountCodeRow.code,
      description: discountCodeRow.description,
      discountPercentage: Number(discountCodeRow.discount_percentage),
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al validar el código";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
