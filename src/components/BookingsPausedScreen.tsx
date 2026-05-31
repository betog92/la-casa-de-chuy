import Link from "next/link";
import {
  PUBLIC_BOOKINGS_PAUSED_MESSAGE,
  PUBLIC_CONTACT_EMAIL,
  getPublicContactWhatsAppUrl,
} from "@/lib/public-bookings-paused";

export function BookingsPausedScreen() {
  const whatsAppUrl = getPublicContactWhatsAppUrl();

  return (
    <div className="container mx-auto px-4 py-16 sm:py-24">
      <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-wide text-amber-800">
          Reservas en línea pausadas
        </p>
        <h1
          className="mt-3 text-3xl font-bold text-[#103948]"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Volveremos a abrir el calendario pronto
        </h1>
        <p className="mt-4 text-zinc-700">{PUBLIC_BOOKINGS_PAUSED_MESSAGE}</p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/"
            className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
          >
            Volver al inicio
          </Link>
          <a
            href={`mailto:${PUBLIC_CONTACT_EMAIL}`}
            className="inline-block rounded-lg border border-zinc-300 bg-white px-6 py-3 font-semibold text-[#103948] transition-colors hover:bg-zinc-50"
          >
            Enviar correo
          </a>
          {whatsAppUrl ? (
            <a
              href={whatsAppUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block rounded-lg border border-emerald-300 bg-emerald-50 px-6 py-3 font-semibold text-emerald-900 transition-colors hover:bg-emerald-100"
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
