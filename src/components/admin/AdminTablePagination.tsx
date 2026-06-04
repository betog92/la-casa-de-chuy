"use client";

type AdminTablePaginationProps = {
  offset: number;
  pageSize: number;
  total: number;
  onOffsetChange: (nextOffset: number) => void;
  /** Muestra spinner y deshabilita botones mientras carga la página */
  loading?: boolean;
  className?: string;
};

export function AdminTablePagination({
  offset,
  pageSize,
  total,
  onOffsetChange,
  loading = false,
  className = "",
}: AdminTablePaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;

  if (totalPages <= 1) return null;

  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + pageSize, total);

  return (
    <div
      className={`flex flex-col gap-2 border-t border-zinc-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`.trim()}
    >
      <div className="text-sm text-zinc-600">
        <span>
          Página {currentPage} de {totalPages}
        </span>
        <span className="mx-2 text-zinc-300">·</span>
        <span>
          Mostrando {rangeStart}–{rangeEnd} de {total}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {loading ? (
          <div
            className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-[#103948] border-t-transparent"
            aria-hidden
          />
        ) : null}
        <button
          type="button"
          onClick={() => onOffsetChange(Math.max(0, offset - pageSize))}
          disabled={offset === 0 || loading}
          aria-label="Página anterior"
          className="min-h-[44px] rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          ← Anterior
        </button>
        <button
          type="button"
          onClick={() =>
            onOffsetChange(Math.min((totalPages - 1) * pageSize, offset + pageSize))
          }
          disabled={currentPage >= totalPages || loading}
          aria-label="Página siguiente"
          className="min-h-[44px] rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-0"
        >
          Siguiente →
        </button>
      </div>
    </div>
  );
}
