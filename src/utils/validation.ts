export const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_REGEX = /^\d{2}:\d{2}$/;

/**
 * Valida el formato de fecha YYYY-MM-DD
 */
export function validateDateFormat(date: string): boolean {
  return DATE_REGEX.test(date);
}

/**
 * Valida el formato de hora HH:mm
 */
export function validateTimeFormat(time: string): boolean {
  return TIME_REGEX.test(time);
}

/**
 * Interfaz para el body de la request de creación de reserva
 */
export interface ReservationRequestBody {
  email?: string;
  name?: string;
  phone?: string;
  date?: string;
  startTime?: string;
  price?: number;
  originalPrice?: number;
  paymentId?: string;
  userId?: string | null;
  discountAmount?: number;
  // Campos específicos de descuentos
  lastMinuteDiscount?: number;
  loyaltyDiscount?: number;
  loyaltyPointsUsed?: number;
  creditsUsed?: number;
  referralDiscount?: number;
  // Código de descuento
  discountCode?: string | null;
  discountCodeDiscount?: number;
}

/**
 * Valida que todos los campos requeridos para una reserva estén presentes y en el formato correcto
 */
export function validateReservationFields(body: ReservationRequestBody): {
  isValid: boolean;
  error?: string;
} {
  // Validar campos requeridos individualmente para mejor type safety
  if (!body.email || body.email === "") {
    return { isValid: false, error: "Campo requerido faltante: email" };
  }
  if (!body.name || body.name === "") {
    return { isValid: false, error: "Campo requerido faltante: name" };
  }
  if (!body.phone || body.phone === "") {
    return { isValid: false, error: "Campo requerido faltante: phone" };
  }
  if (!body.date || body.date === "") {
    return { isValid: false, error: "Campo requerido faltante: date" };
  }
  if (!body.startTime || body.startTime === "") {
    return { isValid: false, error: "Campo requerido faltante: startTime" };
  }
  if (body.price === undefined || body.price === null) {
    return { isValid: false, error: "Campo requerido faltante: price" };
  }
  if (body.originalPrice === undefined || body.originalPrice === null) {
    return { isValid: false, error: "Campo requerido faltante: originalPrice" };
  }
  if (!body.paymentId || body.paymentId === "") {
    return { isValid: false, error: "Campo requerido faltante: paymentId" };
  }

  // Validar formato de fecha (ya sabemos que existe por las validaciones anteriores)
  if (!validateDateFormat(body.date!)) {
    return {
      isValid: false,
      error: "Formato de fecha inválido. Debe ser YYYY-MM-DD",
    };
  }

  // Validar formato de hora (ya sabemos que existe por las validaciones anteriores)
  if (!validateTimeFormat(body.startTime!)) {
    return {
      isValid: false,
      error: "Formato de hora inválido. Debe ser HH:mm",
    };
  }

  return { isValid: true };
}
