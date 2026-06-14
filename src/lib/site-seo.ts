import type { Metadata } from "next";

export const SITE_NAME = "La Casa de Chuy el Rico";

export const SITE_URL = (
  process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://lacasadechuyelrico.com"
).replace(/\/$/, "");

export const DEFAULT_DESCRIPTION =
  "Renta por hora una locación fotográfica en Monterrey con interiores de carácter y jardín, ideal para sesiones de XV años y boda.";

export const SITE_KEYWORDS = [
  "locación fotográfica Monterrey",
  "estudio para fotos XV años Monterrey",
  "locación para boda Monterrey",
  "renta de locación para sesiones de fotos",
  "fotos de quinceañera Monterrey",
] as const;

/** Rutas públicas indexables (sin trailing slash). */
export const PUBLIC_SITEMAP_PATHS = [
  "/",
  "/galeria",
  "/ubicacion",
  "/reservar",
  "/terminos",
  "/privacidad",
] as const;

export function absoluteUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

const defaultOgImage = "/hero/hero-01.jpg";

const defaultOgImageEntry = {
  url: defaultOgImage,
  alt: "Locación fotográfica La Casa de Chuy el Rico en Monterrey",
} as const;

function pageOpenGraph(
  title: string,
  description: string,
  url?: string,
): NonNullable<Metadata["openGraph"]> {
  return {
    ...(url ? { url } : {}),
    title,
    description,
    images: [defaultOgImageEntry],
  };
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} | Locación fotográfica en Monterrey`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  keywords: [...SITE_KEYWORDS],
  openGraph: {
    type: "website",
    locale: "es_MX",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Locación para XV años y boda en Monterrey`,
    description:
      "Interiores con carácter y jardín en Monterrey para tus fotos de XV años y boda. Renta por hora y reserva en línea.",
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 800,
        alt: "Locación fotográfica La Casa de Chuy el Rico en Monterrey",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Locación en Monterrey`,
    description: DEFAULT_DESCRIPTION,
    images: [defaultOgImage],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    apple: "/apple-touch-icon.png",
  },
};

export function pageMetadata(
  title: string,
  description: string,
  options?: {
    path?: string;
    keywords?: string[];
    noIndex?: boolean;
  },
): Metadata {
  const canonical = options?.path ? absoluteUrl(options.path) : undefined;
  return {
    title,
    description,
    ...(options?.keywords ? { keywords: options.keywords } : {}),
    ...(canonical
      ? {
          alternates: { canonical },
          openGraph: pageOpenGraph(title, description, canonical),
        }
      : { openGraph: pageOpenGraph(title, description) }),
    ...(options?.noIndex
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
