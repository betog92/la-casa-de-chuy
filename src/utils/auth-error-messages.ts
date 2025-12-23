/**
 * Convierte mensajes de error de Supabase Auth a español
 * Función compartida para evitar duplicación de código
 */
export function getAuthErrorMessage(message: string): string {
  // Normalizar el mensaje (trim para comparación)
  const normalizedMessage = message.trim();

  const errorMessages: Record<string, string> = {
    "Invalid login credentials": "Email o contraseña incorrectos",
    "Email not confirmed":
      "Por favor verifica tu email antes de iniciar sesión",
    "User already registered": "Este email ya está registrado",
    "Password should be at least 6 characters":
      "La contraseña debe tener al menos 6 caracteres",
    "New password should be different from the old password":
      "La nueva contraseña debe ser diferente a la anterior",
    "New password should be different from the old password.":
      "La nueva contraseña debe ser diferente a la anterior",
    "Signups not allowed": "El registro no está permitido en este momento",
    "Email rate limit exceeded":
      "Demasiados intentos. Por favor espera unos minutos",
    "For security purposes, you can only request this after 28 seconds.":
      "Por seguridad, solo puedes solicitar esto después de 28 segundos",
    "For security purposes, you can only request this after 28 seconds":
      "Por seguridad, solo puedes solicitar esto después de 28 segundos",
    Forbidden: "No tienes permiso para realizar esta acción",
    "Token has expired or is invalid": "El enlace ha expirado o no es válido",
  };

  // Intentar encontrar coincidencia exacta primero
  if (errorMessages[normalizedMessage]) {
    return errorMessages[normalizedMessage];
  }

  // Buscar coincidencia parcial (por si el mensaje tiene variaciones)
  const lowerMessage = normalizedMessage.toLowerCase();
  if (lowerMessage.includes("new password should be different")) {
    return "La nueva contraseña debe ser diferente a la anterior";
  }

  // Capturar mensajes de rate limiting con tiempos variables
  if (
    lowerMessage.includes(
      "for security purposes, you can only request this after"
    )
  ) {
    // Extraer el número de segundos si está presente
    const secondsMatch = normalizedMessage.match(/(\d+)\s*second/i);
    const seconds = secondsMatch ? secondsMatch[1] : "28";
    return `Por seguridad, solo puedes solicitar esto después de ${seconds} segundos`;
  }

  // Si no se encontró ninguna traducción, devolver el mensaje normalizado o un mensaje genérico
  return normalizedMessage || "Error de autenticación";
}
