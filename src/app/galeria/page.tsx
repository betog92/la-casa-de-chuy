import Image from "next/image";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function GaleriaPage() {
  const supabase = createServiceRoleClient();
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
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((img) => (
              <li
                key={img.id}
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
              >
                <div className="relative aspect-[4/3] w-full bg-zinc-100">
                  <Image
                    src={img.public_url}
                    alt={img.caption?.trim() || "Foto del estudio"}
                    fill
                    className="object-cover"
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                  />
                </div>
                {img.caption?.trim() ? (
                  <p className="px-3 py-2 text-sm text-zinc-600">
                    {img.caption.trim()}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
