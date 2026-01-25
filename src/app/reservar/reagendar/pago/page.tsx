"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import Link from "next/link";
import axios from "axios";
import ConektaPaymentForm, {
  type ConektaPaymentFormRef,
} from "@/components/ConektaPaymentForm";
import {
  formatDisplayDate,
  formatTimeRange,
  formatCurrency,
} from "@/utils/formatters";
import type { Reservation } from "@/types/reservation";

// Helper para extraer mensaje de error de axios
function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    if (error.message) {
      return error.message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Ocurrió un error inesperado";
}

function ReschedulePaymentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const paymentFormRef = useRef<ConektaPaymentFormRef>(null);

  // Parámetros de query
  const reservationId = searchParams.get("reservationId");
  const newDate = searchParams.get("newDate");
  const newStartTime = searchParams.get("newStartTime");
  const additionalAmountParam = searchParams.get("additionalAmount");

  // Estados
  const [currentReservation, setCurrentReservation] =
    useState<Reservation | null>(null);
  const [additionalAmount, setAdditionalAmount] = useState<number | null>(null);

  // Cargar datos de la reserva actual
  useEffect(() => {
    const loadReservation = async () => {
      if (!reservationId) {
        setError("ID de reserva no proporcionado");
        setLoadingData(false);
        return;
      }

      if (!newDate || !newStartTime || !additionalAmountParam) {
        setError("Parámetros de reagendamiento incompletos");
        setLoadingData(false);
        return;
      }

      try {
        const amount = parseFloat(additionalAmountParam);
        if (isNaN(amount) || amount <= 0) {
          setError("Monto adicional inválido");
          setLoadingData(false);
          return;
        }
        setAdditionalAmount(amount);

        // Cargar la reserva actual
        const response = await axios.get(`/api/reservations/${reservationId}`);
        if (!response.data.success || !response.data.reservation) {
          setError("No se pudo cargar la información de la reserva");
          setLoadingData(false);
          return;
        }

        setCurrentReservation(response.data.reservation);
      } catch (err) {
        console.error("Error loading reservation:", err);
        setError("Error al cargar la información de la reserva");
      } finally {
        setLoadingData(false);
      }
    };

    if (!authLoading) {
      loadReservation();
    }
  }, [
    reservationId,
    newDate,
    newStartTime,
    additionalAmountParam,
    authLoading,
  ]);

  // Verificar autenticación
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!reservationId || !newDate || !newStartTime || !additionalAmount) {
      setError("Faltan datos necesarios para el reagendamiento");
      return;
    }

    if (!currentReservation) {
      setError("No se encontraron los datos de la reserva");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Paso 1: Crear token de tarjeta con Conekta
      if (!paymentFormRef.current) {
        setError("Error: formulario de pago no disponible");
        setLoading(false);
        return;
      }

      const token = await paymentFormRef.current.createToken();
      if (!token) {
        setLoading(false);
        return;
      }

      // Paso 2: Crear orden en Conekta para el pago adicional
      let orderId: string;
      try {
        const orderResponse = await axios.post("/api/conekta/create-order", {
          token,
          amount: additionalAmount,
          currency: "MXN",
          customerInfo: {
            name: currentReservation.name,
            email: currentReservation.email,
            phone: currentReservation.phone,
          },
          description: `Pago adicional por reagendamiento - ${formatDisplayDate(
            newDate
          )} ${formatTimeRange(newStartTime)}`,
        });

        if (!orderResponse.data.success) {
          setError(orderResponse.data.error || "Error al procesar el pago");
          setLoading(false);
          return;
        }

        orderId = orderResponse.data.orderId;
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Paso 3: Completar el reagendamiento con el pago
      try {
        const rescheduleResponse = await axios.post(
          `/api/reservations/${reservationId}/reschedule/complete`,
          {
            date: newDate,
            startTime: newStartTime,
            paymentId: orderId,
            additionalAmount: additionalAmount,
          }
        );

        if (!rescheduleResponse.data.success) {
          setError(
            rescheduleResponse.data.error ||
              "Error al completar el reagendamiento. Por favor contacta soporte."
          );
          setLoading(false);
          return;
        }

        // Redirigir a la página de confirmación con el monto adicional
        // Asegurar que additionalAmount sea un número válido y formatearlo correctamente
        if (additionalAmount === null || additionalAmount === undefined) {
          setError("Error: monto adicional no disponible");
          setLoading(false);
          return;
        }
        router.push(
          `/reservar/confirmacion?id=${reservationId}&rescheduled=true&paid=true&additionalAmount=${additionalAmount.toString()}`
        );
      } catch (error: unknown) {
        const errorMessage = getErrorMessage(error);
        setError(errorMessage);
        setLoading(false);
        return;
      }
    } catch (err) {
      console.error("Error inesperado:", err);
      setError("Ocurrió un error inesperado");
      setLoading(false);
    }
  };

  if (authLoading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto"></div>
          <p className="mt-4 text-zinc-600">Cargando información...</p>
        </div>
      </div>
    );
  }

  if (error && !currentReservation) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold text-zinc-900">{error}</h1>
            <Link
              href="/account"
              className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              Volver a mis reservas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!currentReservation || !additionalAmount || !newDate || !newStartTime) {
    return (
      <div className="min-h-screen bg-white py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <div className="text-center">
            <h1 className="mb-4 text-2xl font-bold text-zinc-900">
              Datos incompletos
            </h1>
            <p className="mb-6 text-zinc-600">
              No se pudieron cargar todos los datos necesarios para el
              reagendamiento.
            </p>
            <Link
              href="/account"
              className="inline-block rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              Volver a mis reservas
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white py-6 sm:py-12 relative">
      {/* Overlay de loading */}
      {loading && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto mb-4"></div>
              <p className="text-lg font-medium text-zinc-900 mb-2">
                Procesando pago...
              </p>
              <p className="text-sm text-zinc-600">
                Por favor espera, no cierres esta página
              </p>
            </div>
          </div>
        </div>
      )}
      <div className="container mx-auto px-4 max-w-4xl">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="mb-2 text-3xl font-bold text-zinc-900 sm:text-4xl">
            Pago adicional por reagendamiento
          </h1>
          <p className="text-zinc-600">
            Completa el pago para confirmar el cambio de fecha y hora
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-stretch">
          {/* Columna izquierda: Formulario de pago */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6 flex flex-col">
            <h2 className="text-xl font-semibold text-zinc-900 mb-6">
              Información de pago
            </h2>

            <form onSubmit={handleSubmit} className="flex flex-col flex-1">
              <div className="space-y-6 flex-1">
                {/* Método de pago: Tarjeta de crédito */}
                <div className="rounded border border-zinc-200 overflow-hidden bg-white">
                  <div className="flex items-center justify-between px-4 sm:px-5 py-4 bg-green-50 border-2 border-green-200 -mx-[1px] -mt-[1px]">
                    <span className="text-sm font-semibold text-zinc-900">
                      Tarjeta de crédito o débito
                    </span>
                    <div className="flex items-center gap-2.5">
                      <div className="flex items-center justify-center w-10 h-6 bg-[#1A1F71] rounded text-white text-xs font-bold">
                        VISA
                      </div>
                      <div className="relative w-10 h-6">
                        <svg
                          viewBox="0 0 24 16"
                          className="w-full h-full"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <rect width="24" height="16" rx="2" fill="#EB001B" />
                          <circle cx="9" cy="8" r="5" fill="#F79E1B" />
                          <circle cx="15" cy="8" r="5" fill="#FF5F00" />
                        </svg>
                      </div>
                      <div className="flex items-center justify-center w-10 h-6 bg-[#006FCF] rounded text-white text-[10px] font-bold">
                        AMEX
                      </div>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5">
                    <ConektaPaymentForm
                      ref={paymentFormRef}
                      onError={(error) => setError(error)}
                      disabled={loading}
                    />
                  </div>
                </div>

                {/* Mensaje de error */}
                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}
              </div>

              {/* Botón de pago - Al final del contenedor */}
              <div className="pt-6 mt-6">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d3a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? "Procesando..."
                    : `Pagar ${formatCurrency(additionalAmount)}`}
                </button>
              </div>
            </form>
          </div>

          {/* Columna derecha: Resumen */}
          <div className="bg-white rounded-lg border border-zinc-200 p-6 lg:sticky lg:top-6 flex flex-col">
            <h2 className="text-lg font-medium text-zinc-700 mb-5">
              Resumen del reagendamiento
            </h2>

            {/* Fecha y hora actual */}
            <div className="mb-5 pb-5 border-b border-zinc-100">
              <h3 className="text-xs font-medium text-zinc-600 mb-3">
                Fecha y hora actuales
              </h3>
              <div className="space-y-2.5">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Fecha</p>
                  <p className="text-sm text-zinc-700">
                    {formatDisplayDate(currentReservation.date)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Horario</p>
                  <p className="text-sm text-zinc-700">
                    {formatTimeRange(
                      currentReservation.start_time.includes(":")
                        ? currentReservation.start_time
                            .split(":")
                            .slice(0, 2)
                            .join(":")
                        : currentReservation.start_time
                    )}
                  </p>
                </div>
              </div>
            </div>

            {/* Nueva fecha y hora */}
            <div className="mb-5 pb-5 border-b border-zinc-100">
              <h3 className="text-xs font-medium text-zinc-600 mb-3">
                Nueva fecha y hora
              </h3>
              <div className="space-y-2.5">
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Fecha</p>
                  <p className="text-sm text-zinc-800">
                    {formatDisplayDate(newDate)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-zinc-500 mb-0.5">Horario</p>
                  <p className="text-sm text-zinc-800">
                    {formatTimeRange(newStartTime)}
                  </p>
                </div>
              </div>
            </div>

            {/* Monto adicional */}
            <div className="space-y-3">
              <div className="flex justify-between items-center py-1.5">
                <span className="text-sm text-zinc-500">Monto adicional</span>
                <span className="text-sm font-medium text-zinc-700">
                  ${formatCurrency(additionalAmount)}
                </span>
              </div>
              <div className="pt-3 border-t border-zinc-200 flex justify-between items-center">
                <span className="text-sm font-medium text-zinc-700">
                  Total a pagar
                </span>
                <span className="text-base font-semibold text-zinc-900">
                  ${formatCurrency(additionalAmount)}
                </span>
              </div>
            </div>

            {/* Información adicional */}
            <div className="mt-5 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-xs leading-relaxed text-blue-800">
                <span className="font-medium">Nota:</span> Este pago adicional
                es requerido porque la nueva fecha seleccionada tiene un costo
                mayor. El reagendamiento se completará una vez que el pago sea
                procesado exitosamente.
              </p>
            </div>
          </div>
        </div>

        {/* Link de regreso */}
        <div className="mt-6 text-center">
          <Link
            href={`/reservaciones/${reservationId}`}
            className="text-sm text-[#103948] hover:underline"
          >
            ← Volver a los detalles de la reserva
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function ReschedulePaymentPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto"></div>
            <p className="mt-4 text-zinc-600">Cargando...</p>
          </div>
        </div>
      }
    >
      <ReschedulePaymentContent />
    </Suspense>
  );
}
