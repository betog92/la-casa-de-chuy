import type { Metadata } from "next";
import {
  LOCATION_CONTENT_KEY,
  parseLocationContent,
} from "@/lib/site-location";
import { createPublicReadonlyClient } from "@/lib/supabase/server";
import { pageMetadata } from "@/lib/site-seo";
import { isAllowedMapsEmbedUrl } from "@/utils/maps-embed";
import { UbicacionAddressActions } from "./UbicacionAddressActions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata(
  "Ubicaci?n",
  "Direcci?n y mapa de la locaci?n en Monterrey, Nuevo Le?n. C?mo llegar a La Casa de Chuy el Rico.",
  { path: "/ubicacion" },
);

export default async function UbicacionPage() {
  const supabase = createPublicReadonlyClient();
  const { data, error: queryError } = await supabase
    .from("site_content")
    .select("value")
    .eq("key", LOCATION_CONTENT_KEY)
    .maybeSingle();

  if (queryError) {
    console.error("[ubicacion page]", queryError);
    return (
      <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
        <div className="container mx-auto max-w-3xl px-4 py-12 sm:py-16">
          <h1
            className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Ubicaci?n
          </h1>
          <p className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
            No pudimos cargar la informaci?n de ubicaci?n. Vuelve a intentar m?s
            tarde.
          </p>
        </div>
      </div>
    );
  }

  const loc = parseLocationContent(
    data ? (data as { value: unknown }).value : null,
  );
  const hasContent =
    loc.address.trim() ||
    loc.mapsEmbedUrl.trim() ||
    loc.directions.trim() ||
    loc.parkingNote.trim();

  const mapsEmbedRaw = loc.mapsEmbedUrl.trim();
  const mapsEmbedSafe =
    mapsEmbedRaw && isAllowedMapsEmbedUrl(mapsEmbedRaw)
      ? mapsEmbedRaw
      : "";
  if (mapsEmbedRaw && !mapsEmbedSafe) {
    console.error(
      "[ubicacion page] mapsEmbedUrl no permitida; no se muestra el iframe",
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white">
      <div className="container mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <h1
          className="mb-4 text-center text-3xl font-bold text-zinc-900 sm:text-4xl"
          style={{ fontFamily: "var(--font-cormorant), serif" }}
        >
          Ubicaci?n
        </h1>
        <p className="mx-auto mb-10 max-w-xl text-center text-zinc-600">
          Direcci?n de la locaci?n en Monterrey. Usa el mapa o abre la ruta en tu
          celular con Google Maps o Waze.
        </p>

        {!hasContent ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-900">
            Estamos configurando esta secci?n. Si necesitas la direcci?n,
            escr?benos por redes o al reservar.
          </p>
        ) : (
          <div className="space-y-8">
            {loc.address.trim() ? (
              <section
                className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
                aria-labelledby="ubicacion-direccion"
              >
                <h2
                  id="ubicacion-direccion"
                  className="mb-2 text-lg font-semibold text-zinc-900"
                >
                  Direcci?n
                </h2>
                <address className="not-italic whitespace-pre-line text-zinc-700">
                  {loc.address}
                </address>
                <UbicacionAddressActions address={loc.address} />
              </section>
            ) : null}

            {mapsEmbedRaw ? (
              <section
                className="overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm"
                aria-labelledby="ubicacion-mapa"
              >
                <h2
                  id="ubicacion-mapa"
                  className="border-b border-zinc-100 px-6 py-3 text-lg font-semibold text-zinc-900"
                >
                  Mapa
                </h2>
                {mapsEmbedSafe ? (
                  <div className="aspect-[16/10] min-h-[220px] w-full bg-zinc-100 sm:min-h-0">
                    <iframe
                      title="Mapa de la locaci?n"
                      src={mapsEmbedSafe}
                      className="h-full min-h-[220px] w-full border-0 sm:min-h-0"
                      loading="lazy"
                      referrerPolicy="no-referrer-when-downgrade"
                      allowFullScreen
                    />
                  </div>
                ) : (
                  <p className="px-6 py-4 text-sm text-amber-800">
                    El mapa no est? disponible por un problema de configuraci?n.
                    {loc.address.trim()
                      ? " Usa la direcci?n y los enlaces a Google Maps o Waze en esta misma p?gina."
                      : " Busca la ubicaci?n en Google Maps o cont?ctanos."}
                  </p>
                )}
              </section>
            ) : null}

            {loc.directions.trim() ? (
              <section className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                <h2 className="mb-2 text-lg font-semibold text-zinc-900">
                  C?mo llegar
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
