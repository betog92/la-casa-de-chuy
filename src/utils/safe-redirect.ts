/**
 * Solo permite rutas internas relativas (evita open redirect).
 */
export function isSafeRedirectPath(path: string): boolean {
  const trimmed = path.trim();
  if (!trimmed.startsWith("/")) return false;
  if (trimmed.startsWith("//")) return false;
  if (trimmed.includes("://")) return false;
  return true;
}

export function resolveSafeRedirectPath(
  path: string | null | undefined,
  fallback: string,
): string {
  if (path && isSafeRedirectPath(path)) return path.trim();
  return fallback;
}
