"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";

export default function EmailVerifiedPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [countdown, setCountdown] = useState(5);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  // Contador que cuenta hacia atrás
  useEffect(() => {
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
  }, []);

  // Redirigir solo cuando el contador llegue a 0
  useEffect(() => {
    if (shouldRedirect) {
      router.push("/account");
    }
  }, [shouldRedirect, router]);

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
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
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            ¡Email verificado!
          </h1>
          <p className="text-zinc-600">
            Tu cuenta ha sido verificada exitosamente
          </p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8 text-center">
          <p className="text-zinc-700 mb-4">
            Redirigiendo a tu cuenta en {countdown} segundo
            {countdown !== 1 ? "s" : ""}...
          </p>

          {loading && (
            <p className="text-sm text-zinc-500 mb-4">Verificando sesión...</p>
          )}

          <Link
            href="/account"
            className="inline-block bg-[#103948] text-white py-3 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
          >
            Ir a mi cuenta ahora
          </Link>
        </div>
      </div>
    </div>
  );
}
