/**
 * Variantes de reserva creadas desde el admin y su duración en minutos.
 * Las reservas tipo Alvero ocupan 2 bloques consecutivos (90 min);
 * el resto sigue siendo de 45 min como históricamente.
 */
export const ALVERO_VARIANTS = ["cita_alvero", "reservado_alvero"] as const;
export type AlveroVariant = (typeof ALVERO_VARIANTS)[number];

export const DEFAULT_DURATION_MIN = 45;
export const ALVERO_DURATION_MIN = 90;

export function isAlveroVariant(value: string | null | undefined): boolean {
  return (
    typeof value === "string" &&
    (ALVERO_VARIANTS as readonly string[]).includes(value)
  );
}

/** Devuelve la duración (en minutos) de una variante de reserva. */
export function durationForVariant(variant: string | null | undefined): number {
  return isAlveroVariant(variant ?? null)
    ? ALVERO_DURATION_MIN
    : DEFAULT_DURATION_MIN;
}
