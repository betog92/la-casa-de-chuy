/**
 * Obtiene la URL base de la aplicación
 * Prioriza NEXT_PUBLIC_APP_URL si está configurada, sino usa window.location.origin
 * 
 * Esta función es útil para construir URLs de redirección en autenticación
 * que funcionen tanto en desarrollo como en producción.
 */
export function getBaseUrl(): string {
  // En cliente, priorizar NEXT_PUBLIC_APP_URL si está configurada
  if (typeof window !== "undefined") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (appUrl) {
      return appUrl;
    }
    // Fallback a window.location.origin (funciona en desarrollo y producción)
    return window.location.origin;
  }

  // En servidor, usar NEXT_PUBLIC_APP_URL o fallback a localhost
  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

/**
 * Construye la URL completa para el callback de autenticación
 */
export function getAuthCallbackUrl(): string {
  return `${getBaseUrl()}/auth/callback`;
}

/**
 * Construye la URL completa para el callback de recuperación de contraseña
 */
export function getPasswordResetCallbackUrl(): string {
  return `${getBaseUrl()}/auth/callback?type=recovery`;
}
