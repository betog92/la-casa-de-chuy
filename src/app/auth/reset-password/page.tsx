"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import { useRouter, useSearchParams } from "next/navigation";
import AuthError from "@/components/auth/AuthError";
import AuthSuccess from "@/components/auth/AuthSuccess";
import Link from "next/link";

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(6, "La contraseña debe tener al menos 6 caracteres"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Las contraseñas no coinciden",
    path: ["confirmPassword"],
  });

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [canReset, setCanReset] = useState(false);
  const [countdown, setCountdown] = useState(5);
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const { updatePassword, session, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Verificar error desde query params (si viene del callback)
    const errorParam = searchParams.get("error");
    if (errorParam) {
      setError(decodeURIComponent(errorParam));
      setCountdown(5); // Reset countdown
      setShouldRedirect(false); // Evitar redirección
      return;
    }

    // Verificar que hay una sesión válida (el callback ya intercambió el código por sesión)
    if (!authLoading) {
      if (session) {
        setCanReset(true);
      } else {
        setError(
          "Enlace inválido o expirado. Por favor solicita un nuevo enlace."
        );
        setCountdown(5); // Reset countdown
        setShouldRedirect(false); // Evitar redirección
      }
    }
  }, [session, authLoading, searchParams]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    setError("");
    setSuccess("");
    setLoading(true);
    setCountdown(5);
    setShouldRedirect(false);

    try {
      const result = await updatePassword(data.password);
      if (result.success) {
        setSuccess("Contraseña actualizada correctamente");
      } else {
        setError(result.error || "Error al actualizar contraseña");
      }
    } catch (err) {
      setError("Error inesperado al actualizar contraseña");
    } finally {
      setLoading(false);
    }
  };

  // Contador que cuenta hacia atrás cuando hay éxito
  useEffect(() => {
    if (!success) return;

    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setShouldRedirect(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [success]);

  // Redirigir solo cuando el contador llegue a 0
  useEffect(() => {
    if (shouldRedirect) {
      router.push("/account");
    }
  }, [shouldRedirect, router]);

  // Mostrar loading mientras se verifica la sesión
  if (authLoading) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
            <div className="text-center">
              <p className="text-zinc-600">Verificando enlace...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Si no puede resetear, mostrar error
  if (!canReset) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
            <AuthError message={error || "Enlace inválido o expirado"} />
            <div className="mt-6 text-center">
              <Link
                href="/auth/forgot-password"
                className="text-sm text-[#103948BF] hover:text-[#103948] transition-colors"
              >
                Solicitar nuevo enlace
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Restablecer contraseña
          </h1>
          <p className="text-zinc-600">Ingresa tu nueva contraseña</p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
          {success ? (
            <div className="text-center space-y-6">
              <AuthSuccess message={success} />
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <svg
                  className="h-8 w-8 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <p className="text-zinc-700">
                Redirigiendo a tu cuenta en {countdown} segundo
                {countdown !== 1 ? "s" : ""}...
              </p>
              <Link
                href="/account"
                className="inline-block bg-[#103948] text-white py-3 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
              >
                Ir a mi cuenta ahora
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              <AuthError message={error} />

              <div>
                <label
                  htmlFor="password"
                  className="block text-sm font-medium text-[#103948] mb-2"
                >
                  Nueva contraseña
                </label>
                <input
                  id="password"
                  type="password"
                  {...register("password")}
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#103948] focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                />
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.password.message}
                  </p>
                )}
                <p className="mt-1 text-xs text-zinc-500">
                  Mínimo 6 caracteres
                </p>
              </div>

              <div>
                <label
                  htmlFor="confirmPassword"
                  className="block text-sm font-medium text-[#103948] mb-2"
                >
                  Confirmar nueva contraseña
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  {...register("confirmPassword")}
                  className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#103948] focus:border-transparent outline-none transition-all"
                  placeholder="••••••••"
                />
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-[#103948] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Actualizando..." : "Actualizar contraseña"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
