/** Filtros compartidos para listados/KPIs de reservas en el panel admin. */

export const ORIGIN_FILTER_VALUES = ["imported", "native"] as const;
export type OriginFilter = (typeof ORIGIN_FILTER_VALUES)[number];

export const SOURCE_FILTER_VALUES = ["web", "admin"] as const;
export type SourceFilter = (typeof SOURCE_FILTER_VALUES)[number];

export const IMPORT_TYPE_FILTER_VALUES = ["manual_client"] as const;
export type ImportTypeFilter = (typeof IMPORT_TYPE_FILTER_VALUES)[number];

export function isOriginFilter(value: string | null | undefined): value is OriginFilter {
  return value === "imported" || value === "native";
}

export function isSourceFilter(value: string | null | undefined): value is SourceFilter {
  return value === "web" || value === "admin";
}

export function isImportTypeFilter(
  value: string | null | undefined,
): value is ImportTypeFilter {
  return value === "manual_client";
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

type ImportTypeFilterable = {
  is: (column: string, value: null) => unknown;
};

/** Canal de venta: web (Conekta) o manual cliente (admin sin import_type). */
export function applySourceFilter<T extends SourceFilterable>(
  query: T,
  source: string | null | undefined,
): T {
  if (source === "web") {
    return query.eq("source", "web") as T;
  }
  if (source === "admin") {
    const adminQuery = query.eq("source", "admin") as T & ImportTypeFilterable;
    return adminQuery.is("import_type", null) as T;
  }
  return query;
}

/** Citas Alvero u otros tipos de importación del panel. */
export function applyImportTypeFilter<T extends SourceFilterable>(
  query: T,
  importType: string | null | undefined,
): T {
  if (importType === "manual_client") {
    return query.eq("import_type", "manual_client") as T;
  }
  return query;
}
