/**
 * Valida URL para iframe de Google Maps (embed). Vacío = permitido (sin mapa).
 * Hosts permitidos por sufijo estricto (evita `evil-googleapis.com`, etc.).
 */
function hostIsOrUnder(host: string, base: string): boolean {
  const h = host.toLowerCase();
  const b = base.toLowerCase();
  return h === b || h.endsWith(`.${b}`);
}

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
    hostIsOrUnder(h, "google.com") ||
    hostIsOrUnder(h, "google.com.mx") ||
    hostIsOrUnder(h, "googleapis.com") ||
    hostIsOrUnder(h, "gstatic.com")
  );
}
