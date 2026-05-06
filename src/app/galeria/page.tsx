import { createPublicReadonlyClient } from "@/lib/supabase/server";
import { GaleriaGrid } from "./GaleriaGrid";

export const dynamic = "force-dynamic";

export default async function GaleriaPage() {
  const supabase = createPublicReadonlyClient();
  const { data: rows, error: queryError } = await supabase
    .from("gallery_images")
    .select("id, public_url, caption, sort_order")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (queryError) {
    console.error("[galeria page]", queryError);
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
        <div className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
          <h1
            className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Galería
          </h1>
          <p className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
            No pudimos cargar la galería en este momento. Vuelve a intentar
            más tarde.
          </p>
        </div>
      </div>
    );
  }

  const images =
    (rows as
      | { id: string; public_url: string; caption: string | null }[]
      | null) ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="container mx-auto max-w-6xl px-4 py-12 sm:py-16">
        <h1
          className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Galería
        </h1>
        <p className="mx-auto mb-12 max-w-2xl text-center text-zinc-600">
          Un vistazo a nuestros espacios en La Casa de Chuy el Rico.
        </p>

        {images.length === 0 ? (
          <p className="text-center text-zinc-500">
            Pronto añadiremos fotos del estudio.
          </p>
        ) : (
          <GaleriaGrid images={images} />
        )}
      </div>
    </div>
  );
}
