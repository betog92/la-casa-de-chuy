"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import Link from "next/link";
import type { Reservation } from "@/types/reservation";

export default function ConfirmacionPage() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get("id");
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guestReservationUrl, setGuestReservationUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadReservation = async () => {
      if (!reservationId) {
        setError("No se proporcionó un ID de reserva");
        setLoading(false);
        return;
      }

      // Verificar si hay un token de invitado guardado
      const savedGuestUrl = sessionStorage.getItem("guestReservationUrl");
      if (savedGuestUrl) {
        setGuestReservationUrl(savedGuestUrl);
        sessionStorage.removeItem("guestReservationUrl");
        sessionStorage.removeItem("guestToken");
      }

      try {
        // Usar API route en lugar de cliente directo (evita problemas de RLS)
        const response = await fetch(`/api/reservations/${reservationId}`);
        const result = await response.json();

        if (!result.success) {
          setError(
            result.error || "No se pudo cargar la información de la reserva"
          );
          return;
        }

        if (!result.reservation) {
          setError("Reserva no encontrada");
          return;
        }

        setReservation(result.reservation as Reservation);
      } catch (err) {
        console.error("Error loading reservation:", err);
        setError("Ocurrió un error al cargar la reserva");
      } finally {
        setLoading(false);
      }
    };

    loadReservation();
  }, [reservationId]);

  // Formatear fecha para mostrar
  const formatDisplayDate = (dateString: string): string => {
    const date = parse(dateString, "yyyy-MM-dd", new Date());
    return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
  };

  // Formatear hora para mostrar
  const formatDisplayTime = (time: string): string => {
    const [hours, minutes] = time.split(":").slice(0, 2).map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return format(date, "h:mm a", { locale: es });
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
        <div className="text-center">
          <p className="text-zinc-600">Cargando información de tu reserva...</p>
        </div>
      </div>
    );
  }

  if (error || !reservation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
        <div className="text-center max-w-md mx-auto px-4">
          <div className="mb-6">
            <svg
              className="mx-auto h-16 w-16 text-red-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h1 className="mb-4 text-2xl font-bold text-zinc-900">
            {error || "Reserva no encontrada"}
          </h1>
          <p className="mb-6 text-zinc-600">
            {error ||
              "No se pudo encontrar la información de tu reserva. Por favor verifica el enlace o contacta soporte."}
          </p>
          <Link
            href="/reservar"
            className="inline-block rounded-lg bg-zinc-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Volver a Reservar
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white py-6 sm:py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Header con ícono de éxito */}
        <div className="mb-8 text-center">
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
          <h1 className="mb-2 text-3xl font-bold text-zinc-900 sm:text-4xl">
            ¡Reserva Confirmada!
          </h1>
          <p className="text-zinc-600">
            Tu reserva ha sido procesada exitosamente
          </p>
        </div>

        {/* Detalles de la Reserva */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">
            Detalles de tu Reserva
          </h2>
          <div className="space-y-4 text-zinc-700">
            <div className="flex justify-between">
              <span className="font-medium">Reserva ID:</span>
              <span className="font-mono text-sm text-zinc-600">
                {reservation.id.substring(0, 8)}...
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Nombre:</span>
              <span>{reservation.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Email:</span>
              <span>{reservation.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Teléfono:</span>
              <span>{reservation.phone}</span>
            </div>
            <div className="border-t border-zinc-200 pt-4">
              <div className="mb-3 flex justify-between">
                <span className="font-medium">Fecha:</span>
                <span className="capitalize">
                  {formatDisplayDate(reservation.date)}
                </span>
              </div>
              <div className="mb-3 flex justify-between">
                <span className="font-medium">Hora:</span>
                <span>
                  {formatDisplayTime(reservation.start_time)} -{" "}
                  {formatDisplayTime(reservation.end_time)}
                </span>
              </div>
              <div className="flex justify-between border-t border-zinc-200 pt-3">
                <span className="font-semibold text-lg">Total Pagado:</span>
                <span className="font-semibold text-lg">
                  ${reservation.price.toLocaleString("es-MX")} MXN
                </span>
              </div>
            </div>
            {reservation.payment_id && (
              <div className="border-t border-zinc-200 pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">ID de Pago:</span>
                  <span className="font-mono text-zinc-600">
                    {reservation.payment_id}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Magic Link para Invitados */}
        {guestReservationUrl && (
          <div className="mb-6 rounded-lg border border-green-200 bg-green-50 p-6">
            <h3 className="mb-3 flex items-center text-lg font-semibold text-green-900">
              <svg
                className="mr-2 h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                />
              </svg>
              Enlace de gestión de reserva
            </h3>
            <p className="mb-4 text-sm text-green-800">
              Guarda este enlace para gestionar tu reserva (cancelar, reagendar, etc.):
            </p>
            <div className="flex items-center gap-2 p-3 bg-white rounded border border-green-200">
              <input
                type="text"
                readOnly
                value={guestReservationUrl}
                className="flex-1 text-sm text-zinc-700 bg-transparent border-none outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(guestReservationUrl);
                  alert("Enlace copiado al portapapeles");
                }}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Copiar
              </button>
            </div>
            <Link
              href={guestReservationUrl}
              className="mt-3 inline-block text-sm text-green-700 hover:text-green-900 font-medium underline"
            >
              Abrir página de gestión →
            </Link>
          </div>
        )}

        {/* Invitación a crear cuenta (solo para invitados) */}
        {guestReservationUrl && (
          <div className="mb-6 rounded-lg border border-[#103948] bg-[#103948]/5 p-6">
            <h3 className="mb-2 text-lg font-semibold text-[#103948]">
              ¿Quieres acceder a más beneficios?
            </h3>
            <p className="mb-4 text-sm text-zinc-700">
              Crea una cuenta para acceder a descuentos por fidelización, puntos de lealtad, créditos y más.
            </p>
            <Link
              href={`/auth/register?email=${encodeURIComponent(reservation.email)}`}
              className="inline-block bg-[#103948] text-white py-2 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        )}

        {/* Información Importante */}
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-6">
          <h3 className="mb-3 flex items-center text-lg font-semibold text-blue-900">
            <svg
              className="mr-2 h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Información Importante
          </h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>
                Recibirás un correo de confirmación con todos los detalles de tu
                reserva.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>
                Si utilizarás el vestidor, te recomendamos llegar 25 minutos
                antes de tu cita.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>
                Puedes reagendar sin costo con mínimo 5 días hábiles de
                anticipación.
              </span>
            </li>
            <li className="flex items-start">
              <span className="mr-2">•</span>
              <span>
                Si tienes alguna pregunta, contáctanos al teléfono proporcionado
                o por email.
              </span>
            </li>
          </ul>
        </div>

        {/* Botones de Acción */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <Link
            href="/reservar"
            className="flex-1 rounded-lg border border-zinc-300 bg-white px-6 py-3 text-center font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            Hacer Otra Reserva
          </Link>
          <Link
            href="/"
            className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-zinc-800"
          >
            Volver al Inicio
          </Link>
        </div>
      </div>
    </div>
  );
}
