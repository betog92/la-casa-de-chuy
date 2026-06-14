import type { Metadata } from "next";
import Link from "next/link";
import CheckoutTermsHighlights from "@/components/CheckoutTermsHighlights";
import TermsContent from "@/components/TermsContent";
import { pageMetadata } from "@/lib/site-seo";

export const metadata: Metadata = pageMetadata(
  "Términos y Condiciones",
  "Términos y condiciones del servicio de reservas en La Casa de Chuy el Rico: cancelaciones, reagendamiento, normas de la locación y más.",
  { path: "/terminos" },
);

export default function TerminosPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="container mx-auto max-w-4xl px-4 py-12 sm:py-16">
        <h1
          className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Términos y Condiciones
        </h1>
        <p className="mx-auto mb-10 max-w-2xl text-center text-zinc-600">
          Reglas del servicio de reservas.
        </p>

        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Resumen</h2>
          <CheckoutTermsHighlights className="mb-8 space-y-5 text-sm text-zinc-700" />

          <h2 className="mb-4 border-t border-zinc-200 pt-8 text-lg font-semibold text-zinc-900">
            Documento completo
          </h2>
          <TermsContent />
        </div>

        <p className="mt-10 text-center text-sm text-zinc-600">
          <Link
            href="/privacidad"
            className="font-medium text-[#103948] hover:underline"
          >
            Política de privacidad
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
