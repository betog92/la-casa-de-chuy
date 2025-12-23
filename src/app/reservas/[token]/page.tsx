"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import AuthError from "@/components/auth/AuthError";

interface Reservation {
  id: string;
  email: string;
  name: string;
  phone: string;
  date: string;
  start_time: string;
  end_time: string;
  price: number;
  original_price: number;
  status: "confirmed" | "cancelled" | "completed";
  payment_id: string | null;
  created_at: string;
}

export default function GuestReservationPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Token inválido");
      setLoading(false);
      return;
    }

    const fetchReservation = async () => {
      try {
        const response = await fetch(`/api/guest-reservations/${token}`);
        const data = await response.json();

        if (!response.ok) {
          setError(data.error || "Error al cargar la reserva");
          setLoading(false);
          return;
        }

        setReservation(data.data.reservation);
      } catch (err) {
        setError("Error inesperado al cargar la reserva");
      } finally {
        setLoading(false);
      }
    };

    fetchReservation();
  }, [token]);

  const handleCancel = async () => {
    if (
      !reservation ||
      !confirm("¿Estás seguro de que deseas cancelar esta reserva?")
    ) {
      return;
    }

    setCancelling(true);
    try {
      const response = await fetch(
        `/api/reservations/${reservation.id}/cancel`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token, // Enviar token para validación
          }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || "Error al cancelar la reserva");
        setCancelling(false);
        return;
      }

      // Actualizar estado local
      setReservation({ ...reservation, status: "cancelled" });
    } catch (err) {
      setError("Error inesperado al cancelar la reserva");
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto"></div>
            <p className="mt-4 text-zinc-600">Cargando reserva...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8">
            <AuthError message={error || "No se pudo cargar la reserva"} />
            <div className="mt-6 text-center">
              <Link
                href="/"
                className="text-[#103948] hover:text-[#0d2d38] font-medium"
              >
                Volver al inicio
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const reservationDate = new Date(reservation.date);
  const formattedDate = format(reservationDate, "EEEE, d 'de' MMMM 'de' yyyy", {
    locale: es,
  });

  return (
    <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1
            className="text-3xl font-bold text-[#103948] mb-2"
            style={{ fontFamily: "var(--font-cormorant), serif" }}
          >
            Mi Reserva
          </h1>
          <p className="text-zinc-600">Gestiona tu reserva desde aquí</p>
        </div>

        <div className="bg-white rounded-lg border border-zinc-200 shadow-sm p-8 space-y-6">
          {/* Estado de la reserva */}
          <div className="flex items-center justify-between pb-4 border-b border-zinc-200">
            <div>
              <p className="text-sm text-zinc-600">Estado</p>
              <p
                className={`text-lg font-semibold ${
                  reservation.status === "confirmed"
                    ? "text-green-600"
                    : reservation.status === "cancelled"
                    ? "text-red-600"
                    : "text-zinc-600"
                }`}
              >
                {reservation.status === "confirmed"
                  ? "Confirmada"
                  : reservation.status === "cancelled"
                  ? "Cancelada"
                  : "Completada"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-zinc-600">ID de Reserva</p>
              <p className="text-sm font-mono text-[#103948]">
                {reservation.id.slice(0, 8)}...
              </p>
            </div>
          </div>

          {/* Información de la reserva */}
          <div className="space-y-4">
            <div>
              <p className="text-sm text-zinc-600 mb-1">Fecha</p>
              <p className="text-lg font-medium text-[#103948] capitalize">
                {formattedDate}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-600 mb-1">Horario</p>
              <p className="text-lg font-medium text-[#103948]">
                {reservation.start_time} - {reservation.end_time}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-600 mb-1">Nombre</p>
              <p className="text-lg font-medium text-[#103948]">
                {reservation.name}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-600 mb-1">Email</p>
              <p className="text-lg font-medium text-[#103948]">
                {reservation.email}
              </p>
            </div>

            <div>
              <p className="text-sm text-zinc-600 mb-1">Teléfono</p>
              <p className="text-lg font-medium text-[#103948]">
                {reservation.phone}
              </p>
            </div>

            <div className="pt-4 border-t border-zinc-200">
              <p className="text-sm text-zinc-600 mb-1">Precio total</p>
              <p className="text-2xl font-bold text-[#103948]">
                $
                {reservation.price.toLocaleString("es-MX", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
              {reservation.original_price > reservation.price && (
                <p className="text-sm text-zinc-500 line-through mt-1">
                  $
                  {reservation.original_price.toLocaleString("es-MX", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
              )}
            </div>
          </div>

          {/* Acciones */}
          {reservation.status === "confirmed" && (
            <div className="pt-6 border-t border-zinc-200 space-y-3">
              <button
                onClick={handleCancel}
                disabled={cancelling}
                className="w-full bg-red-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {cancelling ? "Cancelando..." : "Cancelar Reserva"}
              </button>
              <p className="text-xs text-zinc-500 text-center">
                Al cancelar, recibirás un reembolso del 80% del monto pagado.
              </p>
            </div>
          )}

          {/* Invitación a crear cuenta */}
          <div className="pt-6 border-t border-zinc-200 bg-green-50 rounded-lg p-4">
            <p className="text-sm text-green-800 mb-3">
              <strong>¿Quieres acceder a más beneficios?</strong>
            </p>
            <p className="text-sm text-green-700 mb-4">
              Crea una cuenta para acceder a descuentos por fidelización, puntos
              de lealtad, créditos y más.
            </p>
            <Link
              href={`/auth/register?email=${encodeURIComponent(
                reservation.email
              )}`}
              className="inline-block w-full text-center bg-[#103948] text-white py-2 px-4 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
