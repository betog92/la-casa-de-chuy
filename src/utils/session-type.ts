export const SESSION_TYPE_VALUES = ["xv_anos", "boda", "casual"] as const;
export type SessionType = (typeof SESSION_TYPE_VALUES)[number];

export function isSessionType(value: string): value is SessionType {
  return (SESSION_TYPE_VALUES as readonly string[]).includes(value);
}

export function sessionTypeLabel(
  value: SessionType | string | null | undefined
): string {
  switch (value) {
    case "xv_anos":
      return "XV años";
    case "boda":
      return "Boda";
    case "casual":
      return "Casual";
    default:
      return "—";
  }
}
