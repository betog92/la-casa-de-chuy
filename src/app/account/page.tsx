"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import axios from "axios";
import type { Reservation } from "@/types/reservation";

export default function AccountPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    if (!loading && !user) {
      // Si no está autenticado, redirigir a login
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadReservations = async () => {
      if (!user) {
        setReservationsLoading(false);
        return;
      }

      try {
        setReservationsLoading(true);
        setError("");
        const response = await axios.get("/api/reservations/user");
        if (response.data.success) {
          setReservations(response.data.reservations || []);
        } else {
          setError(response.data.error || "Error al cargar reservas");
        }
      } catch (err) {
        console.error("Error loading reservations:", err);
        setError(
          axios.isAxiosError(err)
            ? err.response?.data?.error || "Error al cargar reservas"
            : "Error al cargar reservas"
        );
      } finally {
        setReservationsLoading(false);
      }
    };

    loadReservations();
  }, [user]);

  // Funciones para formatear fecha y hora
  const formatDisplayDate = (dateString: string): string => {
    try {
      const date = parse(dateString, "yyyy-MM-dd", new Date());
      return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
    } catch {
      return dateString;
    }
  };

  const formatDisplayTime = (time: string): string => {
    try {
      const [hours, minutes] = time.split(":").slice(0, 2).map(Number);
      const date = new Date();
      date.setHours(hours, minutes, 0, 0);
      return format(date, "h:mm a", { locale: es });
    } catch {
      return time;
    }
  };

  const getStatusLabel = (status: string): string => {
    const statusLabels: Record<string, string> = {
      confirmed: "Confirmada",
      cancelled: "Cancelada",
      completed: "Completada",
    };
    return statusLabels[status] || status;
  };

  const getStatusColor = (status: string): string => {
    const statusColors: Record<string, string> = {
      confirmed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
      completed: "bg-blue-100 text-blue-800",
    };
    return statusColors[status] || "bg-zinc-100 text-zinc-800";
  };

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

          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

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
              <p className="mt-4 text-zinc-600 mb-4">Aún no tienes reservas</p>
              <Link
                href="/reservar"
                className="inline-block bg-[#103948] text-white py-2 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
              >
                Hacer una reserva
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {reservations.map((reservation) => (
                <div
                  key={reservation.id}
                  className="border border-zinc-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-[#103948]">
                          {reservation.name}
                        </h3>
                        <span
                          className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(
                            reservation.status
                          )}`}
                        >
                          {getStatusLabel(reservation.status)}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-zinc-600">
                        <div>
                          <span className="font-medium">Fecha:</span>{" "}
                          {formatDisplayDate(reservation.date)}
                        </div>
                        <div>
                          <span className="font-medium">Horario:</span>{" "}
                          {formatDisplayTime(reservation.start_time)} -{" "}
                          {formatDisplayTime(reservation.end_time)}
                        </div>
                        <div>
                          <span className="font-medium">Precio:</span> $
                          {reservation.price.toLocaleString("es-MX", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        {reservation.original_price !== reservation.price && (
                          <div>
                            <span className="font-medium">
                              Precio original:
                            </span>{" "}
                            <span className="line-through text-zinc-400">
                              $
                              {reservation.original_price.toLocaleString(
                                "es-MX",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Link
                        href={`/reservar/confirmacion?reservationId=${reservation.id}`}
                        className="px-4 py-2 text-sm font-medium text-[#103948] border border-[#103948] rounded-lg hover:bg-[#103948] hover:text-white transition-colors"
                      >
                        Ver detalles
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
