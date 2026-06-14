import {
  getReservationCalendarColor,
  getReservationTypeAbbrev,
  getReservationTypeLabel,
  hexWithAlpha,
  type ReservationColorInput,
} from "@/lib/admin/reservation-calendar-colors";

type ReservationTypeChipProps = {
  input: ReservationColorInput;
};

export function ReservationTypeChip({ input }: ReservationTypeChipProps) {
  const color = getReservationCalendarColor(input);
  const abbrev = getReservationTypeAbbrev(input);

  return (
    <span
      title={getReservationTypeLabel(input, { includeStampCode: false })}
      className="ml-1.5 inline-flex shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
      style={{
        backgroundColor: hexWithAlpha(color, 0.12),
        color,
      }}
    >
      {abbrev}
    </span>
  );
}
