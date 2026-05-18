import type { Metadata } from "next";
import Link from "next/link";
import PrivacyContent from "@/components/PrivacyContent";

export const metadata: Metadata = {
  title: "Política de Privacidad — La Casa de Chuy el Rico",
  description:
    "Cómo La Casa de Chuy el Rico recopila, usa y protege tus datos personales al reservar en línea: pagos con Conekta, correos transaccionales y tus derechos.",
};

export default function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="container mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1
          className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Política de Privacidad
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-center text-zinc-600">
          Información sobre el tratamiento de tus datos al usar nuestro sitio de
          reservas y pagos en línea.
        </p>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <PrivacyContent />
        </div>

        <p className="mt-10 text-center text-sm text-zinc-600">
          <Link
            href="/terminos"
            className="font-medium text-[#103948] hover:underline"
          >
            Términos y condiciones
          </Link>
          <span className="mx-2 text-zinc-400">·</span>
          <Link
            href="/reservar"
            className="font-medium text-[#103948] hover:underline"
          >
            Agendar una cita
          </Link>
          <span className="mx-2 text-zinc-400">·</span>
          <Link href="/" className="font-medium text-[#103948] hover:underline">
            Volver al inicio
          </Link>
        </p>
      </div>
    </div>
  );
}
