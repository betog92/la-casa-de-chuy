import {
  LOCATION_CONTENT_KEY,
  parseLocationContent,
} from "@/lib/site-location";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function UbicacionPage() {
  const supabase = createServiceRoleClient();
  const { data } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", LOCATION_CONTENT_KEY)
    .maybeSingle();

  const loc = parseLocationContent(
    data ? (data as { value: unknown }).value : null,
  );
  const hasContent =
    loc.address.trim() ||
    loc.mapsEmbedUrl.trim() ||
    loc.directions.trim() ||
    loc.parkingNote.trim();

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="container mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1
          className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Ubicación
        </h1>
        <p className="mb-10 text-center text-zinc-600">
          Cómo llegar a La Casa de Chuy el Rico.
        </p>

        {!hasContent ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
            Estamos configurando esta sección. Si necesitas la dirección,
            escríbenos por redes o al reservar.
          </p>
        ) : (
          <div className="space-y-8">
            {loc.address.trim() ? (
              <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-lg font-semibold text-zinc-900">
                  Dirección
                </h2>
                <p className="whitespace-pre-line text-zinc-700">
                  {loc.address}
                </p>
              </section>
            ) : null}

            {loc.mapsEmbedUrl.trim() ? (
              <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
                <h2 className="border-b border-zinc-100 px-6 py-3 text-lg font-semibold text-zinc-900">
                  Mapa
                </h2>
                <div className="aspect-[16/10] w-full bg-zinc-100">
                  <iframe
                    title="Mapa del estudio"
                    src={loc.mapsEmbedUrl.trim()}
                    className="h-full w-full border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    allowFullScreen
                  />
                </div>
              </section>
            ) : null}

            {loc.directions.trim() ? (
              <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-lg font-semibold text-zinc-900">
                  Cómo llegar
                </h2>
                <p className="whitespace-pre-line text-zinc-700">
                  {loc.directions}
                </p>
              </section>
            ) : null}

            {loc.parkingNote.trim() ? (
              <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-lg font-semibold text-zinc-900">
                  Estacionamiento
                </h2>
                <p className="whitespace-pre-line text-zinc-700">
                  {loc.parkingNote}
                </p>
              </section>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
