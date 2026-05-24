import { format } from "date-fns";
import { es } from "date-fns/locale";

type RescheduleActor = { id: string; name?: string | null; email?: string };

/**
 * Si el reagendamiento lo hizo el dueño de la reserva, no mostramos su nombre.
 * Si lo hizo un admin u otra persona, sí.
 */
export function shouldShowRescheduleActor(
  rescheduledBy: RescheduleActor | null | undefined,
  reservationUserId: string | null | undefined,
  reservationEmail?: string | null,
): boolean {
  if (!rescheduledBy) return false;
  if (reservationUserId) {
    return rescheduledBy.id !== reservationUserId;
  }
  const actorEmail = rescheduledBy.email?.trim().toLowerCase();
  const ownerEmail = reservationEmail?.trim().toLowerCase();
  if (actorEmail && ownerEmail) {
    return actorEmail !== ownerEmail;
  }
  return true;
}

const RESCHEDULE_DATE_FORMAT = "d 'de' MMMM 'a las' h:mm a";

/** Etiqueta de quién/cuándo reagendó (para bloques de historial). */
export function formatRescheduleAttribution(
  rescheduledAt: string,
  rescheduledBy: RescheduleActor | null | undefined,
  reservationUserId: string | null | undefined,
  reservationEmail?: string | null,
): string {
  const when = format(new Date(rescheduledAt), RESCHEDULE_DATE_FORMAT, {
    locale: es,
  });
  if (
    shouldShowRescheduleActor(
      rescheduledBy,
      reservationUserId,
      reservationEmail,
    ) &&
    rescheduledBy
  ) {
    const name =
      rescheduledBy.name?.trim() || rescheduledBy.email || "Administrador";
    return `Realizado por: ${name} · ${when}`;
  }
  return `Reagendado el ${when}`;
}
