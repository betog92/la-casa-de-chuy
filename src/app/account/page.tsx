"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import axios from "axios";
import type { Reservation } from "@/types/reservation";

interface UserProfile {
  email: string;
  name: string | null;
  phone: string | null;
}

// Funciones helper fuera del componente para evitar recrearlas en cada render
const formatDisplayDate = (dateString: string): string => {
  try {
    const date = parse(dateString, "yyyy-MM-dd", new Date());
    const formatted = format(date, "EEEE, d 'de' MMMM 'de' yyyy", {
      locale: es,
    });
    // Capitalizar solo la primera letra (date-fns devuelve en minúsculas)
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
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

// Formatear teléfono para mejor legibilidad (ej: "8116605611" -> "81 1660 5611")
const formatPhone = (phone: string): string => {
  // Remover todos los espacios, guiones y caracteres especiales
  const cleaned = phone.replace(/\s|-|\(|\)/g, "");

  // Si tiene 10 dígitos, formatear como "XX XXXX XXXX"
  if (cleaned.length === 10) {
    return `${cleaned.slice(0, 2)} ${cleaned.slice(2, 6)} ${cleaned.slice(6)}`;
  }

  // Si tiene otro formato, retornar el original
  return phone;
};

export default function AccountPage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [reservationsLoading, setReservationsLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string>("");
  const hasLoadedRef = useRef(false);
  const profileLoadedRef = useRef(false);
  const previousUserIdForReservationsRef = useRef<string | null>(null);
  const previousUserIdForProfileRef = useRef<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      // Si no está autenticado, redirigir a login
      router.push("/auth/login");
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadReservations = async () => {
      // Resetear flag si cambió el usuario
      if (previousUserIdForReservationsRef.current !== user?.id) {
        hasLoadedRef.current = false;
        previousUserIdForReservationsRef.current = user?.id ?? null;
      }

      // Solo cargar si hay usuario y no se han cargado las reservas para este usuario
      if (!user?.id) {
        setReservationsLoading(false);
        return;
      }

      // Evitar recargar si ya se cargaron las reservas para este usuario
      if (hasLoadedRef.current) {
        return;
      }

      try {
        setReservationsLoading(true);
        setError("");
        const response = await axios.get("/api/reservations/user");
        if (response.data.success) {
          setReservations(response.data.reservations || []);
          hasLoadedRef.current = true;
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
  }, [user?.id]);

  // Cargar perfil del usuario
  useEffect(() => {
    const loadProfile = async () => {
      // Resetear flag si cambió el usuario
      if (previousUserIdForProfileRef.current !== user?.id) {
        profileLoadedRef.current = false;
        previousUserIdForProfileRef.current = user?.id ?? null;
      }

      if (!user?.id) {
        setProfile(null);
        return;
      }

      // Evitar recargar si ya se cargó el perfil para este usuario
      if (profileLoadedRef.current) {
        return;
      }

      try {
        const response = await axios.get("/api/users/profile");
        if (response.data.success) {
          // Extraer solo los datos del perfil, no el objeto completo con success
          const { email, name, phone } = response.data;
          setProfile({ email, name, phone });
          profileLoadedRef.current = true;
        }
      } catch (err) {
        // Silenciosamente fallar, no es crítico si no se puede cargar el perfil
        console.error("Error loading user profile:", err);
      }
    };

    loadProfile();
  }, [user?.id]);

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
          <h2 className="text-xl font-semibold text-[#103948] mb-6">
            Información de la cuenta
          </h2>
          <div className="space-y-5">
            {profile?.name && (
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <svg
                    className="h-5 w-5 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-zinc-600 mb-1">Nombre</p>
                  <p className="text-lg font-medium text-[#103948]">
                    {profile.name}
                  </p>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <svg
                  className="h-5 w-5 text-zinc-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm text-zinc-600 mb-1">Email</p>
                <p className="text-lg font-medium text-[#103948]">
                  {profile?.email || user.email}
                </p>
              </div>
            </div>
            {profile?.phone && (
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <svg
                    className="h-5 w-5 text-zinc-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <p className="text-sm text-zinc-600 mb-1">Teléfono</p>
                  <p className="text-lg font-medium text-[#103948]">
                    {formatPhone(profile.phone)}
                  </p>
                </div>
              </div>
            )}
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
                  <div className="flex flex-col gap-3">
                    {/* Fecha, horario y badge de estado */}
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex flex-col gap-1">
                        <p className="text-lg font-semibold text-[#103948]">
                          {formatDisplayDate(reservation.date)}
                        </p>
                        <p className="text-base text-zinc-700">
                          {formatDisplayTime(reservation.start_time)} -{" "}
                          {formatDisplayTime(reservation.end_time)}
                        </p>
                      </div>
                      <span
                        className={`px-3 py-1.5 text-sm font-medium rounded-full whitespace-nowrap self-center ${getStatusColor(
                          reservation.status
                        )}`}
                      >
                        {getStatusLabel(reservation.status)}
                      </span>
                    </div>

                    {/* Precio y botón Ver detalles */}
                    <div className="pt-3 border-t border-zinc-200">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-xl font-bold text-[#103948]">
                            $
                            {reservation.price.toLocaleString("es-MX", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </p>
                          {reservation.original_price !== reservation.price && (
                            <span className="text-sm text-zinc-400 line-through">
                              $
                              {reservation.original_price.toLocaleString(
                                "es-MX",
                                {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                }
                              )}
                            </span>
                          )}
                        </div>
                        <Link
                          href={`/reservar/confirmacion?reservationId=${reservation.id}`}
                          className="px-4 py-2 text-sm font-medium text-[#103948] border border-[#103948] rounded-lg hover:bg-[#103948] hover:text-white transition-colors whitespace-nowrap self-start sm:self-auto"
                        >
                          Ver detalles
                        </Link>
                      </div>
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
