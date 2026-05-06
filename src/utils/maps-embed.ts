/**
 * Valida URL para iframe de Google Maps (embed).
 * Vacío = permitido (sin mapa).
 */
export function isAllowedMapsEmbedUrl(raw: string): boolean {
  const t = raw.trim();
  if (!t) return true;
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  const h = u.hostname.toLowerCase();
  return (
    h === "www.google.com" ||
    h === "google.com" ||
    h.endsWith(".google.com") ||
    h.endsWith(".google.com.mx") ||
    h.includes("googleapis.com") ||
    h.includes("gstatic.com")
  );
}
