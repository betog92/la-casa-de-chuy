import { NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
} from "@/utils/api-response";

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

    // Validar que esté activo
    if (!discountCode.active) {
      return errorResponse("Este código de descuento no está activo", 400);
    }

    // Validar fecha de expiración
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const validFrom = new Date(discountCode.valid_from);
    validFrom.setHours(0, 0, 0, 0);

    const validUntil = new Date(discountCode.valid_until);
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
    if (discountCode.current_uses >= discountCode.max_uses) {
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
        .eq("discount_code_id", discountCode.id)
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
      code: discountCode.code,
      description: discountCode.description,
      discountPercentage: Number(discountCode.discount_percentage),
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
