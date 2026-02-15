import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";

/**
 * GET: Lista todos los códigos de descuento
 */
export async function GET(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get("activeOnly") === "true";

    const supabase = createServiceRoleClient();
    let query = supabase
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false });

    if (activeOnly) {
      query = query.eq("active", true);
    }

    const { data, error } = await query;

    if (error) {
      console.error("Error listing discount codes:", error);
      return errorResponse("Error al listar códigos de descuento", 500);
    }

    return successResponse({ discountCodes: data ?? [] });
  } catch (error) {
    console.error("Error in admin discount-codes GET:", error);
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Error al cargar códigos de descuento",
      500
    );
  }
}

/**
 * POST: Crear o actualizar código de descuento
 * Body: { id?: string, code, description?, discountPercentage, validFrom, validUntil, maxUses?, active? }
 */
export async function POST(request: NextRequest) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const body = await request.json();
    const {
      id,
      code,
      description,
      discountPercentage,
      validFrom,
      validUntil,
      maxUses = 100,
      active = true,
    } = body;

    if (!code || typeof code !== "string") {
      return validationErrorResponse("Se requiere code");
    }
    if (
      typeof discountPercentage !== "number" ||
      discountPercentage < 0 ||
      discountPercentage > 100
    ) {
      return validationErrorResponse(
        "discountPercentage debe ser un número entre 0 y 100"
      );
    }
    if (!validFrom || !validUntil) {
      return validationErrorResponse("Se requieren validFrom y validUntil");
    }

    const supabase = createServiceRoleClient();
    const insertData = {
      code: String(code).toUpperCase().trim(),
      description: description ?? null,
      discount_percentage: Number(discountPercentage),
      valid_from: validFrom,
      valid_until: validUntil,
      max_uses: Math.max(0, parseInt(String(maxUses), 10) || 100),
      active: !!active,
      updated_at: new Date().toISOString(),
    };

    if (id) {
      const { data, error } = await supabase
        .from("discount_codes")
        .update(insertData as never)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error("Error updating discount code:", error);
        return errorResponse("Error al actualizar código", 500);
      }
      return successResponse({ discountCode: data });
    }

    const { data, error } = await supabase
      .from("discount_codes")
      .insert(insertData as never)
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return validationErrorResponse("Ya existe un código con ese nombre");
      }
      console.error("Error creating discount code:", error);
      return errorResponse("Error al crear código", 500);
    }

    return successResponse({ discountCode: data });
  } catch (error) {
    console.error("Error in admin discount-codes POST:", error);
    return errorResponse(
      error instanceof Error
        ? error.message
        : "Error al guardar código de descuento",
      500
    );
  }
}
