/** Fila mínima para clasificar ingresos en KPIs del dashboard. */
export type RevenueRow = {
  price: number;
  source: string | null;
  import_type: string | null;
  payment_status: string | null;
};

export type RevenueBreakdown = {
  web: number;
  manual: number;
  total: number;
  webCount: number;
  manualCount: number;
  alveroSessions: number;
};

function isWebRow(row: RevenueRow): boolean {
  return row.source === "web";
}

function isManualPaidRow(row: RevenueRow): boolean {
  return (
    row.source === "admin" &&
    (row.import_type == null || row.import_type === "") &&
    row.payment_status === "paid"
  );
}

function isAlveroRow(row: RevenueRow): boolean {
  return row.source === "admin" && row.import_type === "manual_client";
}

/**
 * Agrega ingresos por canal (web, manuales cobrados) y cuenta citas Alvero.
 * Excluir google_import y manual_available antes de llamar (filterNativeReservations).
 */
export function aggregateRevenueBreakdown(rows: RevenueRow[]): RevenueBreakdown {
  let web = 0;
  let manual = 0;
  let webCount = 0;
  let manualCount = 0;
  let alveroSessions = 0;

  for (const row of rows) {
    const price = Number(row.price) || 0;

    if (isWebRow(row)) {
      web += price;
      webCount += 1;
    } else if (isManualPaidRow(row)) {
      manual += price;
      manualCount += 1;
    } else if (isAlveroRow(row)) {
      alveroSessions += 1;
    }
  }

  return {
    web,
    manual,
    total: web + manual,
    webCount,
    manualCount,
    alveroSessions,
  };
}
