"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/useAuth";
import AuthError from "./AuthError";
import AuthSuccess from "./AuthSuccess";

const magicLinkSchema = z.object({
  email: z.string().email("Email inválido"),
});

type MagicLinkFormData = z.infer<typeof magicLinkSchema>;

interface MagicLinkFormProps {
  onSuccess?: () => void;
}

export default function MagicLinkForm({ onSuccess }: MagicLinkFormProps) {
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { signInWithMagicLink } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MagicLinkFormData>({
    resolver: zodResolver(magicLinkSchema),
  });

  const onSubmit = async (data: MagicLinkFormData) => {
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const result = await signInWithMagicLink(data.email);
      if (result.success) {
        setSuccess(
          "Te hemos enviado un enlace mágico a tu email. Revisa tu bandeja de entrada."
        );
        if (onSuccess) {
          onSuccess();
        }
      } else {
        setError(result.error || "Error al enviar magic link");
      }
    } catch (err) {
      setError("Error inesperado al enviar magic link");
    } finally {
      setLoading(false);
    }
  };

  return (
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
          <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
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
          ? "Enlace enviado"
          : "Enviar enlace mágico"}
      </button>

      {success && (
        <p className="text-sm text-zinc-600 text-center">
          Revisa tu bandeja de entrada y haz clic en el enlace para iniciar sesión.
        </p>
      )}
    </form>
  );
}

