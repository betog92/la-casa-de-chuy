/** Límite de caracteres para description en eventos y description_override en notas (POST/PATCH). */
export const VESTIDO_DESCRIPTION_MAX_CHARS = 32_000;

export function vestidoDescriptionTooLong(text: string): boolean {
  return text.length > VESTIDO_DESCRIPTION_MAX_CHARS;
}
