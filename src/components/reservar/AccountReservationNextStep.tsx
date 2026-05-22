import Link from "next/link";

type AccountReservationNextStepProps = {
  reservationId: number;
  variant: "new" | "reschedule";
  /** Email con cuenta pero sin sesión: CTA lleva a login en lugar de /reservaciones */
  requiresLogin?: boolean;
};

const copyByVariant = {
  new: {
    title: "Tu reserva está en tu cuenta",
    body: "Puedes ver el detalle, reagendar o cancelar cuando lo necesites.",
    primaryLabel: "Gestionar mi reserva",
  },
  reschedule: {
    title: "Tu reserva quedó actualizada",
    body: "La nueva fecha y horario ya están guardados. Desde tu cuenta puedes revisar el detalle o hacer otro cambio.",
    primaryLabel: "Ver mi reserva actualizada",
  },
} as const;

export function AccountReservationNextStep({
  reservationId,
  variant,
  requiresLogin = false,
}: AccountReservationNextStepProps) {
  const copy = copyByVariant[variant];
  const managePath = `/reservaciones/${reservationId}`;
  const primaryHref = requiresLogin
    ? `/auth/login?redirect=${encodeURIComponent(managePath)}`
    : managePath;
  const primaryLabel = requiresLogin ? "Iniciar sesión" : copy.primaryLabel;

  return (
    <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
      <h3 className="mb-2 text-lg font-semibold text-zinc-900">{copy.title}</h3>
      <p className="mb-5 text-sm text-zinc-600">
        {requiresLogin
          ? "Tu correo ya tiene cuenta. Inicia sesión para ver y gestionar esta reserva."
          : copy.body}
      </p>

      <Link
        href={primaryHref}
        className="mb-4 flex w-full items-center justify-center rounded-lg bg-[#103948] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-[#0d2d38]"
      >
        {primaryLabel}
      </Link>

      <Link
        href="/account"
        className="block text-center text-sm font-medium text-[#103948] underline hover:text-[#0d2d38]"
      >
        Ver todas mis reservas
      </Link>
    </div>
  );
}
