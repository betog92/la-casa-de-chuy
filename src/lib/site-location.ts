/** Clave en `site_content` para la página /ubicacion */
export const LOCATION_CONTENT_KEY = "location";

export interface LocationContent {
  address: string;
  mapsEmbedUrl: string;
  directions: string;
  parkingNote: string;
}

export function defaultLocationContent(): LocationContent {
  return {
    address: "",
    mapsEmbedUrl: "",
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
