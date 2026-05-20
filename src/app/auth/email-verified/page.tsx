"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { readRedirectAfterVerify } from "@/lib/auth/sign-up-contact";
import { resolveSafeRedirectPath } from "@/utils/safe-redirect";
import { useIsAdmin } from "@/hooks/useIsAdmin";

function EmailVerifiedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [countdown, setCountdown] = useState(5);
  const [shouldRedirect, setShouldRedirect] = useState(false);

  const destination = useMemo(
    () =>
      resolveSafeRedirectPath(
        searchParams.get("redirect") ??
          readRedirectAfterVerify(user?.user_metadata) ??
          undefined,
        isAdmin ? "/admin" : "/account",
      ),
    [searchParams, user?.user_metadata, isAdmin],
  );

  const redirectMessage =
    destination === "/admin"
      ? "al panel de administración"
      : destination === "/account"
        ? "a tu cuenta"
        : "a la siguiente página";

  // Esperar sesión antes del countdown para leer redirect_after_verify en metadata
  useEffect(() => {
    if (loading || adminLoading) return;

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
  }, [loading, adminLoading]);

  useEffect(() => {
    if (shouldRedirect && !loading && !adminLoading) {
      router.push(destination);
    }
  }, [shouldRedirect, loading, adminLoading, router, destination]);

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
          {loading || adminLoading ? (
            <p className="text-zinc-700 mb-4">Verificando sesión...</p>
          ) : (
            <p className="text-zinc-700 mb-4">
              Redirigiendo {redirectMessage} en {countdown} segundo
              {countdown !== 1 ? "s" : ""}...
            </p>
          )}

          <Link
            href={destination}
            className="inline-block bg-[#103948] text-white py-3 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
          >
            {destination === "/account"
              ? "Ir a mi cuenta ahora"
              : destination === "/admin"
                ? "Ir al panel admin"
                : "Continuar"}
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function EmailVerifiedPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-white py-12 px-4 flex items-center justify-center">
          <p className="text-zinc-600">Cargando...</p>
        </div>
      }
    >
      <EmailVerifiedContent />
    </Suspense>
  );
}
