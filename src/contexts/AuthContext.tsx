"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<{ success: boolean; error?: string }>;
  resendVerificationEmail: (email: string) => Promise<{ success: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    // Obtener sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Escuchar cambios en la autenticación
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [supabase.auth]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error.message),
      };
    }

    return { success: true };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error.message),
      };
    }

    return { success: true };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const signInWithMagicLink = async (email: string) => {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error.message),
      };
    }

    return { success: true };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase(),
      {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      }
    );

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error.message),
      };
    }

    return { success: true };
  };

  const resendVerificationEmail = async (email: string) => {
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim().toLowerCase(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      return {
        success: false,
        error: getAuthErrorMessage(error.message),
      };
    }

    return { success: true };
  };

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn,
    signUp,
    signOut,
    signInWithMagicLink,
    resetPassword,
    resendVerificationEmail,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth debe usarse dentro de un AuthProvider");
  }
  return context;
}

function getAuthErrorMessage(message: string): string {
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

  return errorMessages[message] || message || "Error de autenticación";
}

