import { createClient } from "./client";
import type { AuthError } from "@supabase/supabase-js";

export interface AuthResult {
  success: boolean;
  error?: string;
  data?: any;
}

/**
 * Inicia sesión con email y contraseña
 */
export async function signInWithPassword(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al iniciar sesión",
    };
  }
}

/**
 * Envía magic link para iniciar sesión sin contraseña
 */
export async function signInWithMagicLink(
  email: string,
  redirectTo?: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: redirectTo || `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al enviar magic link",
    };
  }
}

/**
 * Registra un nuevo usuario (solo email y contraseña)
 */
export async function signUp(
  email: string,
  password: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al registrar usuario",
    };
  }
}

/**
 * Cierra la sesión del usuario
 */
export async function signOut(): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al cerrar sesión",
    };
  }
}

/**
 * Envía email para recuperar contraseña
 */
export async function resetPassword(email: string): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }
    );

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al enviar email de recuperación",
    };
  }
}

/**
 * Actualiza la contraseña del usuario
 */
export async function updatePassword(
  newPassword: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al actualizar contraseña",
    };
  }
}

/**
 * Reenvía email de verificación
 */
export async function resendVerificationEmail(
  email: string
): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error),
      };
    }

    return {
      success: true,
      data,
    };
  } catch (error) {
    return {
      success: false,
      error: "Error inesperado al reenviar email de verificación",
    };
  }
}

/**
 * Obtiene el usuario actual
 */
export async function getCurrentUser() {
  try {
    const supabase = createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error) {
      return { user: null, error };
    }

    return { user, error: null };
  } catch (error) {
    return { user: null, error };
  }
}

/**
 * Obtiene la sesión actual
 */
export async function getCurrentSession() {
  try {
    const supabase = createClient();
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) {
      return { session: null, error };
    }

    return { session, error: null };
  } catch (error) {
    return { session: null, error };
  }
}

/**
 * Convierte errores de Supabase Auth a mensajes en español
 */
function getAuthErrorMessage(error: AuthError): string {
  const errorMessages: Record<string, string> = {
    "Invalid login credentials": "Email o contraseña incorrectos",
    "Email not confirmed": "Por favor verifica tu email antes de iniciar sesión",
    "User already registered": "Este email ya está registrado",
    "Password should be at least 6 characters":
      "La contraseña debe tener al menos 6 caracteres",
    "Signups not allowed": "El registro no está permitido en este momento",
    "Email rate limit exceeded":
      "Demasiados intentos. Por favor espera unos minutos",
    "Forbidden": "No tienes permiso para realizar esta acción",
    "Token has expired or is invalid": "El enlace ha expirado o no es válido",
  };

  return errorMessages[error.message] || error.message || "Error de autenticación";
}

