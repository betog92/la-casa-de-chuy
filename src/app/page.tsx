import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import HeroCarousel from "@/components/HeroCarousel";
import { LocalBusinessJsonLd } from "@/components/LocalBusinessJsonLd";
import { pageMetadata, SITE_KEYWORDS } from "@/lib/site-seo";
import { PRICES, formatPricePerHour } from "@/utils/pricing";
import {
  getPublicBookingsHref,
  isPublicBookingsPaused,
} from "@/lib/public-bookings-paused";
import { createPublicReadonlyClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  ...pageMetadata(
    "Locación para fotos de XV años y boda en Monterrey",
    "Renta por hora una locación fotográfica en Monterrey con interiores de carácter y jardín, ideal para sesiones de XV años y boda. Reserva en línea en minutos.",
    { path: "/", keywords: [...SITE_KEYWORDS] },
  ),
  title: {
    absolute:
      "La Casa de Chuy el Rico | Locación para fotos de XV años y boda en Monterrey",
  },
  openGraph: {
    title:
      "La Casa de Chuy el Rico | Locación para XV años y boda en Monterrey",
    description:
      "Interiores con carácter y jardín en Monterrey para tus fotos de XV años y boda. Renta por hora y reserva en línea.",
    type: "website",
    url: "/",
  },
};

// Revalida cada hora: el teaser de galería se actualiza sin hacer la página dinámica.
export const revalidate = 3600;

const serifHeading = { fontFamily: "var(--font-cormorant), serif" } as const;

type TeaserImage = { id: string; src: string; alt: string };

/** Fotos para el teaser de galería; usa Supabase y cae a las del hero si no hay. */
async function getGalleryTeaserImages(): Promise<TeaserImage[]> {
  try {
    const supabase = createPublicReadonlyClient();
    const { data, error } = await supabase
      .from("gallery_images")
      .select("id, public_url, caption, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(3);
    if (!error && data && data.length >= 3) {
      return (
        data as { id: string; public_url: string; caption: string | null }[]
      ).map((row) => ({
        id: row.id,
        src: row.public_url,
        alt: row.caption?.trim() || "Espacios de La Casa de Chuy el Rico",
      }));
    }
  } catch (err) {
    console.error("[home gallery teaser]", err);
  }
  return [2, 3, 5].map((n) => ({
    id: `hero-${n}`,
    src: `/hero/hero-0${n}.jpg`,
    alt: "Espacios de La Casa de Chuy el Rico",
  }));
}

export default async function Home() {
  const reservarHref = getPublicBookingsHref();
  const bookingsPaused = isPublicBookingsPaused();
  const teaserImages = await getGalleryTeaserImages();

  return (
    <div className="min-h-screen bg-[#fcfcfc]">
      <LocalBusinessJsonLd />
      {/* Hero carrusel */}
      <HeroCarousel reservarHref={reservarHref} />

      {/* Sobre la locación: imagen + texto editorial (sin cards) */}
      <section className="container mx-auto px-4 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="reveal-on-scroll relative aspect-[4/5] w-full overflow-hidden sm:aspect-[3/4] lg:aspect-[4/5]">
            <Image
              src="/hero/hero-04.jpg"
              alt="Interior de La Casa de Chuy el Rico"
              fill
              className="object-cover"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
          </div>

          <div className="reveal-on-scroll">
            <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[#BC5631]">
              La locación
            </p>
            <h2
              className="mb-6 text-4xl font-medium leading-tight text-[#103948] sm:text-5xl"
              style={serifHeading}
            >
              Cada rincón, pensado para tu sesión
            </h2>
            <p className="mb-10 max-w-prose text-lg leading-relaxed text-zinc-600">
              En el corazón de Monterrey, interiores llenos de carácter y un
              jardín al aire libre que rentas por hora para tus fotos de XV años,
              boda o el proyecto que sueñes. Tú llegas con tu vestido y tu
              fotógrafo; nosotros tenemos listo el escenario para que cada toma
              se vuelva un recuerdo.
            </p>

            <dl className="divide-y divide-zinc-200 border-y border-zinc-200">
              <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-medium text-[#103948]">Lunes a sábado</dt>
                <dd className="text-zinc-600">
                  11:00 AM – 7:00 PM · {formatPricePerHour(PRICES.normal)}
                </dd>
              </div>
              <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-medium text-[#103948]">
                  Domingos y festivos
                </dt>
                <dd className="text-zinc-600">
                  11:00 AM – 4:00 PM · {formatPricePerHour(PRICES.holiday)}
                </dd>
              </div>
              <div className="grid gap-1 py-5 sm:grid-cols-[11rem_1fr] sm:gap-6">
                <dt className="font-medium text-[#103948]">Cada reserva</dt>
                <dd className="text-zinc-600">
                  1 hora: 45 min en interiores + 15 min en jardín
                </dd>
              </div>
            </dl>

            <p className="mt-6 text-sm text-zinc-500">
              El precio se aplica automáticamente al reservar en línea; sin
              cargos adicionales por domingo o festivo.
            </p>
          </div>
        </div>
      </section>

      {/* Por qué elegirnos: banda oscura invertida */}
      <section className="bg-[#103948] py-20 text-white sm:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-5xl">
            <h2
              className="reveal-on-scroll mb-14 text-center text-4xl font-medium sm:text-5xl"
              style={serifHeading}
            >
              Pensado para tu gran día
            </h2>

            <div className="grid gap-12 sm:grid-cols-3 sm:gap-8">
              <div className="reveal-on-scroll text-center">
                <svg
                  className="mx-auto mb-5 h-10 w-10 text-white/80"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75"
                  />
                </svg>
                <h3 className="mb-2 text-2xl font-medium" style={serifHeading}>
                  Escenarios que enamoran
                </h3>
                <p className="leading-relaxed text-white/70">
                  Interiores con estilo y un jardín natural en Monterrey: fondos
                  que convierten cada foto en un recuerdo irrepetible.
                </p>
              </div>

              <div className="reveal-on-scroll text-center">
                <svg
                  className="mx-auto mb-5 h-10 w-10 text-white/80"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <h3 className="mb-2 text-2xl font-medium" style={serifHeading}>
                  El tiempo es tuyo
                </h3>
                <p className="leading-relaxed text-white/70">
                  Reservas por hora con interior y jardín incluidos, para crear
                  sin prisas junto a tu fotógrafo.
                </p>
              </div>

              <div className="reveal-on-scroll text-center">
                <svg
                  className="mx-auto mb-5 h-10 w-10 text-white/80"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 6h.008v.008H6V6z"
                  />
                </svg>
                <h3 className="mb-2 text-2xl font-medium" style={serifHeading}>
                  Reserva en minutos
                </h3>
                <p className="leading-relaxed text-white/70">
                  Elige fecha, paga en línea y recibe tu confirmación al
                  instante. Claro y sin sorpresas.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Teaser de galería */}
      <section className="container mx-auto px-4 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl">
          <div className="reveal-on-scroll mb-10 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="mb-3 text-sm uppercase tracking-[0.2em] text-[#BC5631]">
                Galería
              </p>
              <h2
                className="text-4xl font-medium text-[#103948] sm:text-5xl"
                style={serifHeading}
              >
                Mira lo que puedes crear aquí
              </h2>
            </div>
            <Link
              href="/galeria"
              className="shrink-0 text-base font-medium text-[#103948] underline decoration-[#103948]/30 underline-offset-4 transition hover:decoration-[#103948]"
            >
              Ver galería completa →
            </Link>
          </div>

          <ul className="grid gap-4 sm:grid-cols-3">
            {teaserImages.map((img) => (
              <li key={img.id} className="reveal-on-scroll">
                <Link
                  href="/galeria"
                  className="group block"
                  aria-label="Abrir galería"
                >
                  <div className="relative aspect-[4/5] w-full overflow-hidden bg-zinc-100">
                    <Image
                      src={img.src}
                      alt={img.alt}
                      fill
                      className="object-cover transition duration-300 group-hover:scale-[1.03]"
                      sizes="(max-width: 640px) 100vw, 33vw"
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* CTA final: banner invertido */}
      <section className="bg-[#103948] py-20 sm:py-28">
        <div className="container mx-auto px-4">
          <div className="reveal-on-scroll mx-auto max-w-2xl text-center text-white">
            <h2
              className="mb-6 text-4xl font-medium leading-tight sm:text-5xl"
              style={serifHeading}
            >
              Aparta tu fecha
            </h2>
            <p className="mb-10 text-lg leading-relaxed text-white/75">
              {bookingsPaused
                ? "Las reservas en línea están pausadas temporalmente mientras actualizamos el calendario."
                : "Tu sesión de XV años o boda merece la fecha perfecta. Las mejores se reservan rápido: aparta la tuya hoy."}
            </p>
            <Link
              href={reservarHref}
              className="inline-block rounded-full bg-white px-10 py-4 text-lg font-semibold text-[#103948] shadow-lg transition hover:shadow-xl"
            >
              {bookingsPaused ? "Más información" : "Reservar mi fecha"}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
