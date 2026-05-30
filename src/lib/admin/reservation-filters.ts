/** Filtros compartidos para listados/KPIs de reservas en el panel admin. */

export const ORIGIN_FILTER_VALUES = ["imported", "native"] as const;
export type OriginFilter = (typeof ORIGIN_FILTER_VALUES)[number];

export function isOriginFilter(value: string | null | undefined): value is OriginFilter {
  return value === "imported" || value === "native";
}

type OrFilterable = { or: (filters: string) => unknown };
type SourceFilterable = OrFilterable & {
  neq: (column: string, value: string) => SourceFilterable;
  eq: (column: string, value: string) => SourceFilterable;
};

/** Excluye placeholders Nancy / "Reservado para Alvero". */
export function excludeManualAvailableSlots<T extends OrFilterable>(query: T): T {
  return query.or("import_type.is.null,import_type.neq.manual_available") as T;
}

/** Reservas operativas: web + admin, sin importaciones ni placeholders Nancy. */
export function filterNativeReservations<T extends SourceFilterable>(query: T): T {
  const withoutImport = query.neq("source", "google_import") as T;
  return excludeManualAvailableSlots(withoutImport);
}

export function applyOriginFilter<T extends SourceFilterable>(
  query: T,
  origin: string | null | undefined,
): T {
  if (origin === "imported") {
    return query.eq("source", "google_import") as T;
  }
  if (origin === "native") {
    return query.neq("source", "google_import") as T;
  }
  return query;
}
