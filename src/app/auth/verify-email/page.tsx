"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import AuthError from "@/components/auth/AuthError";
import AuthSuccess from "@/components/auth/AuthSuccess";
import Link from "next/link";

const verifyEmailSchema = z.object({
  email: z.string().email("Email inválido"),
});

type VerifyEmailFormData = z.infer<typeof verifyEmailSchema>;

export default function VerifyEmailPage() {
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { resendVerificationEmail } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<VerifyEmailFormData>({
    resolver: zodResolver(verifyEmailSchema),
  });

  const onSubmit = async (data: VerifyEmailFormData) => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const result = await resendVerificationEmail(data.email);
      if (result.success) {
        setSuccess(
          "Te hemos enviado un nuevo enlace de verificación. Revisa tu bandeja de entrada."
        );
      } else {
        setError(result.error || "Error al reenviar email de verificación");
      }
    } catch (err) {
      setError("Error inesperado al reenviar email de verificación");
    } finally {
      setLoading(false);
    }
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
            Te hemos enviado un enlace de verificación a tu email. Haz clic en el
            enlace para activar tu cuenta.
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <AuthError message={error} />
            <AuthSuccess message={success} />

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-[#103948] mb-2"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                {...register("email")}
                className="w-full px-4 py-3 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-[#103948] focus:border-transparent outline-none transition-all"
                placeholder="tu@email.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading || !!success}
              className="w-full bg-[#103948] text-white py-3 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? "Enviando..."
                : success
                ? "Email enviado"
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
          </form>
        </div>
      </div>
    </div>
  );
}

