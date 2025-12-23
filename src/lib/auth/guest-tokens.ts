import { SignJWT, jwtVerify } from "jose";

const SECRET_KEY = process.env.NEXT_PUBLIC_GUEST_TOKEN_SECRET || "default-secret-key-change-in-production";

/**
 * Payload del token JWT para invitados
 */
export interface GuestTokenPayload {
  email: string;
  reservationId: string;
  iat?: number;
  exp?: number;
}

/**
 * Genera un token JWT para que un invitado pueda gestionar su reserva
 * El token expira cuando la reserva está completada o cancelada (validación dinámica)
 */
export async function generateGuestToken(
  email: string,
  reservationId: string
): Promise<string> {
  const secret = new TextEncoder().encode(SECRET_KEY);
  
  // Token válido por 1 año (la validación real se hace verificando el estado de la reserva)
  const expirationTime = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 365;

  const jwt = await new SignJWT({
    email: email.toLowerCase(),
    reservationId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expirationTime)
    .sign(secret);

  return jwt;
}

/**
 * Valida y decodifica un token JWT de invitado
 */
export async function verifyGuestToken(
  token: string
): Promise<{ valid: boolean; payload?: GuestTokenPayload; error?: string }> {
  try {
    const secret = new TextEncoder().encode(SECRET_KEY);
    const { payload } = await jwtVerify(token, secret);

    // Verificar que el payload tenga los campos requeridos
    if (
      !payload.email ||
      !payload.reservationId ||
      typeof payload.email !== "string" ||
      typeof payload.reservationId !== "string"
    ) {
      return {
        valid: false,
        error: "Token inválido: faltan campos requeridos",
      };
    }

    return {
      valid: true,
      payload: {
        email: payload.email as string,
        reservationId: payload.reservationId as string,
        iat: payload.iat as number,
        exp: payload.exp as number,
      },
    };
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes("expired")) {
        return {
          valid: false,
          error: "El enlace ha expirado",
        };
      }
      if (error.message.includes("signature")) {
        return {
          valid: false,
          error: "Token inválido: firma incorrecta",
        };
      }
    }
    return {
      valid: false,
      error: "Token inválido",
    };
  }
}

/**
 * Genera la URL del magic link para gestionar una reserva de invitado
 */
export function generateGuestReservationUrl(token: string): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}/reservas/${token}`;
  }
  // Para uso en servidor
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${baseUrl}/reservas/${token}`;
}

