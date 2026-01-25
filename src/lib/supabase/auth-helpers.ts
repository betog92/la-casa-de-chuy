import { createClient } from "./client";
import { getAuthErrorMessage as translateAuthError } from "@/utils/auth-error-messages";
import {
  getAuthCallbackUrl,
  getPasswordResetCallbackUrl,
} from "@/utils/url-helpers";

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
        error: translateAuthError(error.message),
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
        emailRedirectTo: redirectTo || getAuthCallbackUrl(),
      },
    });

    if (error) {
      return {
        success: false,
        error: translateAuthError(error.message),
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
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });

    if (error) {
      return {
        success: false,
        error: translateAuthError(error.message),
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
        error: translateAuthError(error.message),
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
        redirectTo: getPasswordResetCallbackUrl(),
      }
    );

    if (error) {
      return {
        success: false,
        error: translateAuthError(error.message),
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
export async function updatePassword(newPassword: string): Promise<AuthResult> {
  try {
    const supabase = createClient();
    const { data, error } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (error) {
      return {
        success: false,
        error: translateAuthError(error.message),
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
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });

    if (error) {
      return {
        success: false,
        error: translateAuthError(error.message),
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
