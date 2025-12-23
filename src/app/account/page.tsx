"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";

export default function AccountPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [reservations, setReservations] = useState<any[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);

  useEffect(() => {
    if (!loading && !user) {
      // Si no está autenticado, redirigir a login
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      // TODO: Cargar reservas del usuario desde la API
      // Por ahora solo marcamos como cargado
      setReservationsLoading(false);
    }
  }, [user]);

  if (loading || reservationsLoading) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto"></div>
            <p className="mt-4 text-zinc-600">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null; // Se redirige automáticamente
  }

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Mi Cuenta
          </h1>
          <p className="text-zinc-600">
            Gestiona tus reservas y datos de cuenta
          </p>
        </div>

        {/* Información del usuario */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-6 mb-6">
          <h2 className="text-xl font-semibold text-[#103948] mb-4">
            Información de la cuenta
          </h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-zinc-600 mb-1">Email</p>
              <p className="text-lg font-medium text-[#103948]">{user.email}</p>
            </div>
          </div>
        </div>

        {/* Historial de reservas */}
        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-6">
          <h2 className="text-xl font-semibold text-[#103948] mb-4">
            Mis Reservas
          </h2>
          
          {reservations.length === 0 ? (
            <div className="text-center py-8">
              <svg
                className="mx-auto h-12 w-12 text-zinc-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              <p className="mt-4 text-zinc-600 mb-4">
                Aún no tienes reservas
              </p>
              <Link
                href="/reservar"
                className="inline-block bg-[#103948] text-white py-2 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
              >
                Hacer una reserva
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {/* TODO: Listar reservas aquí */}
              <p className="text-zinc-600">Las reservas aparecerán aquí...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


