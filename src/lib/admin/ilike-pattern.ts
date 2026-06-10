/** Patrón seguro para filtros PostgREST `.ilike` (comillas si hace falta). */
export function buildIlikePattern(search: string): string {
  const escaped = search
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/'/g, "''");
  const pattern = `%${escaped}%`;
  return pattern.includes(",") || pattern.includes('"')
    ? `"${pattern.replace(/"/g, '""')}"`
    : pattern;
}
