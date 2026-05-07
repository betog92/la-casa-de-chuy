/** Clave en `site_content` para la página /ubicacion */
export const LOCATION_CONTENT_KEY = "location";

export interface LocationContent {
  address: string;
  mapsEmbedUrl: string;
  directions: string;
  parkingNote: string;
}

/** Dirección física del negocio (fallback y base para PUT admin). */
export const DEFAULT_LOCATION_ADDRESS =
  "José María Arteaga #1111 Oriente, 64000 Monterrey, Nuevo León, México";

/** Búsqueda en Google Maps (sin API key; iframe con output=embed). */
export const DEFAULT_LOCATION_MAPS_EMBED_URL =
  "https://www.google.com/maps?q=Jos%C3%A9%20Mar%C3%ADa%20Arteaga%20%231111%20Oriente%2C%2064000%20Monterrey%2C%20Nuevo%20Le%C3%B3n%2C%20M%C3%A9xico&hl=es&output=embed";

export function defaultLocationContent(): LocationContent {
  return {
    address: DEFAULT_LOCATION_ADDRESS,
    mapsEmbedUrl: DEFAULT_LOCATION_MAPS_EMBED_URL,
    directions: "",
    parkingNote: "",
  };
}

export function parseLocationContent(value: unknown): LocationContent {
  const d = defaultLocationContent();
  if (!value || typeof value !== "object") return d;
  const o = value as Record<string, unknown>;
  return {
    address: typeof o.address === "string" ? o.address : d.address,
    mapsEmbedUrl:
      typeof o.mapsEmbedUrl === "string" ? o.mapsEmbedUrl : d.mapsEmbedUrl,
    directions:
      typeof o.directions === "string" ? o.directions : d.directions,
    parkingNote:
      typeof o.parkingNote === "string" ? o.parkingNote : d.parkingNote,
  };
}
