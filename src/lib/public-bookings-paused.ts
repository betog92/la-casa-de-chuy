import { errorResponse } from "@/utils/api-response";

export const PUBLIC_BOOKINGS_PAUSED_MESSAGE =
  "Estamos sincronizando el calendario. Las reservas en línea están pausadas temporalmente. Escríbenos por correo o Facebook Messenger para agendar.";

export const PUBLIC_CONTACT_EMAIL = "reservas@lacasadechuyelrico.com";

/** Rutas del flujo de reserva nueva (no incluye reagendar ni confirmación). */
export const PAUSED_BOOKING_PATH_PREFIXES = ["/reservar/formulario"] as const;

export function isPublicBookingsPaused(): boolean {
  const raw =
    process.env.PUBLIC_BOOKINGS_PAUSED?.trim().toLowerCase() ??
    process.env.NEXT_PUBLIC_BOOKINGS_PAUSED?.trim().toLowerCase();
  return raw === "true" || raw === "1" || raw === "yes";
}

export function isBookingFlowPausedPath(pathname: string): boolean {
  if (pathname === "/reservar/pausado") return false;
  if (pathname === "/reservar") return true;
  return PAUSED_BOOKING_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function getPublicBookingsHref(fallback = "/reservar"): string {
  return isPublicBookingsPaused() ? "/reservar/pausado" : fallback;
}

/** WhatsApp opcional: NEXT_PUBLIC_CONTACT_WHATSAPP=5218123456789 */
export function getPublicContactWhatsAppUrl(): string | null {
  const phone = process.env.NEXT_PUBLIC_CONTACT_WHATSAPP?.replace(/\D/g, "");
  if (!phone) return null;
  const text = encodeURIComponent(
    "Hola, quiero agendar en La Casa de Chuy el Rico.",
  );
  return `https://wa.me/${phone}?text=${text}`;
}

export function publicBookingsPausedResponse() {
  return errorResponse(PUBLIC_BOOKINGS_PAUSED_MESSAGE, 503);
}
