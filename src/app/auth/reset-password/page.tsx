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
  const { updatePassword } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Verificar que hay un token en la URL (Supabase lo maneja automáticamente)
    const hash = window.location.hash;
    if (hash.includes("access_token") || searchParams.get("token")) {
      setCanReset(true);
    } else {
      setError("Enlace inválido o expirado");
    }
  }, [searchParams]);

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

    try {
      const result = await updatePassword(data.password);
      if (result.success) {
        setSuccess("Contraseña actualizada correctamente");
        setTimeout(() => {
          router.push("/auth/login");
        }, 2000);
      } else {
        setError(result.error || "Error al actualizar contraseña");
      }
    } catch (err) {
      setError("Error inesperado al actualizar contraseña");
    } finally {
      setLoading(false);
    }
  };

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
          <p className="text-zinc-600">
            Ingresa tu nueva contraseña
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <AuthError message={error} />
            <AuthSuccess message={success} />

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
              disabled={loading || !!success}
              className="w-full bg-[#103948] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Actualizando..."
                : success
                ? "Contraseña actualizada"
                : "Actualizar contraseña"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

