/**
 * Enlaces profundos para abrir la dirección en apps de mapas (navegador / app nativa).
 */
export function googleMapsSearchUrl(address: string): string {
  const q = address.trim();
  if (!q) return "https://www.google.com/maps";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export function wazeSearchUrl(address: string): string {
  const q = address.trim();
  if (!q) return "https://www.waze.com";
  return `https://www.waze.com/ul?q=${encodeURIComponent(q)}&navigate=yes`;
}
