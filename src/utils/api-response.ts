import { NextResponse } from "next/server";

/**
 * Crea una respuesta de éxito estandarizada
 */
export function successResponse<T extends Record<string, unknown>>(
  data: T,
  status = 200
) {
  return NextResponse.json({ success: true, ...data }, { status });
}

/**
 * Crea una respuesta de error estandarizada
 */
export function errorResponse(
  error: string,
  status = 500,
  additionalData?: Record<string, unknown>
) {
  return NextResponse.json(
    { success: false, error, ...additionalData },
    { status }
  );
}

/**
 * Crea una respuesta de error de validación (400)
 */
export function validationErrorResponse(error: string) {
  return errorResponse(error, 400);
}

/**
 * Crea una respuesta de recurso no encontrado (404)
 */
export function notFoundResponse(resource = "Recurso") {
  return errorResponse(`${resource} no encontrado`, 404);
}

/**
 * Crea una respuesta de conflicto (409)
 */
export function conflictResponse(message: string) {
  return errorResponse(message, 409);
}
