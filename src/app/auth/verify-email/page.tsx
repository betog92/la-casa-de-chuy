"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import AuthError from "@/components/auth/AuthError";
import AuthSuccess from "@/components/auth/AuthSuccess";
import Link from "next/link";

const COUNTDOWN_SECONDS = 60; // Tiempo recomendado por Supabase: 60 segundos

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [isCountdownActive, setIsCountdownActive] = useState(true);
  const { resendVerificationEmail, user } = useAuth();

  // Obtener el email de la URL o del contexto del usuario
  const email = user?.email || searchParams.get("email") || "";

  // Contador regresivo
  useEffect(() => {
    if (!isCountdownActive) {
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setIsCountdownActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isCountdownActive]);

  const handleResend = async () => {
    if (!email) {
      setError("No se pudo obtener tu email. Por favor, inicia sesión nuevamente.");
      return;
    }

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const result = await resendVerificationEmail(email);
      if (result.success) {
        setSuccess(
          "Te hemos enviado un nuevo enlace de verificación. Revisa tu bandeja de entrada."
        );
        // Reiniciar el contador
        setCountdown(COUNTDOWN_SECONDS);
        setIsCountdownActive(true);
      } else {
        setError(result.error || "Error al reenviar email de verificación");
      }
    } catch (err) {
      setError("Error inesperado al reenviar email de verificación");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Verifica tu email
          </h1>
          <p className="text-zinc-600">
            Te hemos enviado un enlace de verificación a tu email. Haz clic en
            el enlace para activar tu cuenta.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
          <div className="space-y-6">
            <AuthError message={error} />
            <AuthSuccess message={success} />

            {email && (
              <div className="text-center">
                <p className="text-sm text-zinc-600 mb-2">
                  Email registrado:
                </p>
                <p className="text-sm font-medium text-[#103948]">
                  {email}
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={handleResend}
              disabled={loading || isCountdownActive}
              className="w-full bg-[#103948] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Enviando..."
                : isCountdownActive
                ? `Espera ${formatTime(countdown)} para reenviar`
                : "Reenviar enlace de verificación"}
            </button>

            <div className="text-center">
              <Link
                href="/auth/login"
                className="text-sm text-[#103948BF] hover:text-[#103948] transition-colors"
              >
                Volver a iniciar sesión
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
