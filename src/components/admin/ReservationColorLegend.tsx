import {
  getTableLegendItems,
  type TableLegendItem,
} from "@/lib/admin/reservation-calendar-colors";

type ReservationColorLegendProps = {
  scope?: "native" | "full";
  className?: string;
};

export function ReservationColorLegend({
  scope = "full",
  className = "",
}: ReservationColorLegendProps) {
  const items = getTableLegendItems(scope);

  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-zinc-600 ${className}`.trim()}
    >
      <span className="font-medium text-zinc-500">Tipos:</span>
      {items.map((item: TableLegendItem) => (
        <span key={item.key} className="inline-flex items-center gap-1.5">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-sm border border-black/5"
            style={{ backgroundColor: item.color }}
            aria-hidden
          />
          {item.label}
        </span>
      ))}
    </div>
  );
}
