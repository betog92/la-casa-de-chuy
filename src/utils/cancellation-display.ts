import { formatAttributionDateTime } from "@/utils/formatters";

type CancellationActor = {
  id: string;
  name?: string | null;
  email?: string;
};

/**
 * Si canceló el dueño de la reserva, no mostramos su nombre.
 * Si lo hizo un admin u otra persona, sí.
 */
export function shouldShowCancellationActor(
  cancelledBy: CancellationActor | null | undefined,
  reservationUserId: string | null | undefined,
  reservationEmail?: string | null,
): boolean {
  if (!cancelledBy) return false;
  if (reservationUserId) {
    return cancelledBy.id !== reservationUserId;
  }
  const actorEmail = cancelledBy.email?.trim().toLowerCase();
  const ownerEmail = reservationEmail?.trim().toLowerCase();
  if (actorEmail && ownerEmail) {
    return actorEmail !== ownerEmail;
  }
  return true;
}

/** Pie del bloque de cancelación (mismo estilo que «Reagendado el …»). */
export function formatCancellationAttribution(
  cancelledAt: string,
  cancelledBy: CancellationActor | null | undefined,
  reservationUserId: string | null | undefined,
  reservationEmail?: string | null,
): string | null {
  const when = formatAttributionDateTime(cancelledAt);
  if (!when) return null;

  if (
    shouldShowCancellationActor(
      cancelledBy,
      reservationUserId,
      reservationEmail,
    ) &&
    cancelledBy
  ) {
    const name =
      cancelledBy.name?.trim() || cancelledBy.email || "Administrador";
    return `Cancelado por: ${name} · ${when}`;
  }
  return `Cancelado el ${when}`;
}
