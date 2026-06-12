/** Normaliza código de tarjetero: trim, vacío → null, máx. 64 caracteres. */
export function normalizeStampCardCode(
  value: string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const t = String(value).trim();
  if (!t) return null;
  return t.slice(0, 64);
}

/** Cita manual La Casa de Chuy (efectivo/transferencia), no Alvero ni bloqueos. */
export function isManualChuyReservation(reservation: {
  source?: string | null;
  import_type?: string | null;
}): boolean {
  return reservation.source === "admin" && reservation.import_type == null;
}

/** Sesión regalo tarjetero: cupón registrado, precio $0, sin cobro. */
export function isStampCardGiftReservation(reservation: {
  stamp_card_code?: string | null;
}): boolean {
  return normalizeStampCardCode(reservation.stamp_card_code) != null;
}

/** Campos de pago/precio al registrar o convertir a sesión regalo. */
export function stampCardGiftPaymentFields(): {
  price: number;
  original_price: number;
  payment_method: null;
  payment_status: "not_applicable";
  payment_validated_at: null;
  payment_validated_by_user_id: null;
} {
  return {
    price: 0,
    original_price: 0,
    payment_method: null,
    payment_status: "not_applicable",
    payment_validated_at: null,
    payment_validated_by_user_id: null,
  };
}
