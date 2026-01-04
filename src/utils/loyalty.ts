/**
 * Calcula el nivel de fidelización basado en el número de reservas confirmadas
 *
 * @param confirmedCount - Número de reservas confirmadas
 * @returns Nombre del nivel de fidelización
 */
export function calculateLoyaltyLevel(confirmedCount: number): string {
  if (confirmedCount >= 10) {
    return "Elite";
  } else if (confirmedCount >= 5) {
    return "VIP";
  } else if (confirmedCount >= 1) {
    return "Frecuente";
  } else {
    return "Inicial";
  }
}
