"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { calculatePriceWithCustom } from "@/utils/pricing";
import Link from "next/link";
import Image from "next/image";
import TermsModal from "@/components/TermsModal";
import ConektaPaymentForm, {
  type ConektaPaymentFormRef,
} from "@/components/ConektaPaymentForm";
import type { ReservationData } from "@/types/reservation";
import axios from "axios";

// Schema de validación
const reservationFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(10, "El teléfono debe tener al menos 10 dígitos"),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: "Debes aceptar los términos y condiciones para continuar",
  }),
});

type ReservationFormData = z.infer<typeof reservationFormSchema>;

// Helper para extraer mensaje de error de axios
function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    // Si hay una respuesta del servidor con un mensaje de error
    if (error.response?.data?.error) {
      return error.response.data.error;
    }
    // Si hay un mensaje en response.data pero sin campo 'error'
    if (error.response?.data?.message) {
      return error.response.data.message;
    }
    // Fallback al mensaje del error de axios
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Ocurrió un error al procesar la reserva. Por favor intenta nuevamente.";
}

export default function FormularioReservaPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [reservationData, setReservationData] =
    useState<ReservationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const paymentFormRef = useRef<ConektaPaymentFormRef>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReservationFormData>({
    resolver: zodResolver(reservationFormSchema),
  });

  // Extraer valores de searchParams de forma estable para evitar re-renders innecesarios
  const dateParam = searchParams.get("date");
  const timeParam = searchParams.get("time");

  // Cargar datos de la reserva desde sessionStorage o query params
  useEffect(() => {
    const loadReservationData = async () => {
      // Verificación defensiva para SSR (aunque este componente es "use client")
      if (typeof window === "undefined") return;

      try {
        // Intentar obtener de sessionStorage primero
        const stored = sessionStorage.getItem("reservationData");
        let data: ReservationData | null = null;

        if (stored) {
          try {
            data = JSON.parse(stored);
          } catch (e) {
            console.error(
              "Error parsing reservation data from sessionStorage:",
              e
            );
          }
        }

        // Si no hay en sessionStorage o falta el precio, obtener de query params
        if (!data || !data.price) {
          if (dateParam && timeParam) {
            // Calcular el precio si no está disponible
            const date = parse(dateParam, "yyyy-MM-dd", new Date());
            const supabase = createClient();
            const price = await calculatePriceWithCustom(supabase, date);

            data = {
              date: dateParam,
              time: timeParam,
              price,
            };

            // Guardar en sessionStorage para futuras referencias
            sessionStorage.setItem("reservationData", JSON.stringify(data));
          } else {
            // No hay datos suficientes, redirigir a selección
            router.push("/reservar");
            return;
          }
        }

        setReservationData(data);
      } catch (err) {
        console.error("Error loading reservation data:", err);
        setError("Error al cargar los datos de la reserva");
        router.push("/reservar");
      } finally {
        setLoadingData(false);
      }
    };

    loadReservationData();
  }, [dateParam, timeParam, router]);

  // Formatear fecha para mostrar
  const formatDisplayDate = (dateString: string): string => {
    const date = parse(dateString, "yyyy-MM-dd", new Date());
    return format(date, "EEEE, d 'de' MMMM 'de' yyyy", { locale: es });
  };

  // Formatear hora para mostrar
  const formatDisplayTime = (time: string): string => {
    const [hours, minutes] = time.split(":").map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return format(date, "h:mm a", { locale: es });
  };

  const onSubmit = async (data: ReservationFormData) => {
    if (!reservationData) {
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
        // El error ya fue manejado por el componente de pago (se muestra en errors.general del componente)
        // No necesitamos mostrar otro error aquí para evitar duplicación
        setLoading(false);
        return;
      }

      // Paso 2: Crear orden en Conekta (usando API route)
      let orderId: string;
      try {
        const orderResponse = await axios.post("/api/conekta/create-order", {
          token,
          amount: reservationData.price,
          currency: "MXN",
          customerInfo: {
            name: data.name,
            email: data.email,
            phone: data.phone,
          },
          description: `Reserva - ${formatDisplayDate(
            reservationData.date
          )} ${formatDisplayTime(reservationData.time)}`,
        });

        if (!orderResponse.data.success) {
          setError(orderResponse.data.error || "Error al procesar el pago");
          setLoading(false);
          return;
        }

        orderId = orderResponse.data.orderId;
      } catch (error: unknown) {
        // Manejar errores específicos de la API de Conekta
        const errorMessage = getErrorMessage(error);
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Paso 3: Crear reserva en Supabase (usando API route)
      let reservationId: string;
      try {
        const reservationResponse = await axios.post(
          "/api/reservations/create",
          {
            email: data.email,
            name: data.name,
            phone: data.phone,
            date: reservationData.date,
            startTime: reservationData.time,
            price: reservationData.price,
            originalPrice: reservationData.price,
            paymentId: orderId,
          }
        );

        if (!reservationResponse.data.success) {
          setError(
            reservationResponse.data.error ||
              "Error al crear la reserva. Por favor contacta soporte."
          );
          setLoading(false);
          return;
        }

        reservationId = reservationResponse.data.reservationId;
      } catch (error: unknown) {
        // Manejar errores específicos de la API de reservaciones
        const errorMessage = getErrorMessage(error);
        setError(errorMessage);
        setLoading(false);
        return;
      }

      // Paso 4: Limpiar sessionStorage y redirigir a confirmación
      sessionStorage.removeItem("reservationData");
      router.push(`/reservar/confirmacion?id=${reservationId}`);
    } catch (err: unknown) {
      // Catch genérico para errores inesperados
      const errorMessage = getErrorMessage(err);
      console.error("Error en proceso de reserva:", err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
        <div className="text-center">
          <p className="text-zinc-600">Cargando datos de la reserva...</p>
        </div>
      </div>
    );
  }

  if (!reservationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
        <div className="text-center">
          <p className="text-zinc-600 mb-4">
            No se encontraron datos de la reserva
          </p>
          <button
            onClick={() => router.push("/reservar")}
            className="rounded-lg bg-zinc-900 px-6 py-2 text-white hover:bg-zinc-800"
          >
            Volver a seleccionar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F6F6F7] py-6 sm:py-8">
      <div className="container mx-auto px-4 max-w-7xl">
        {/* Layout de dos columnas */}
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
          {/* Columna izquierda: Formulario (60-65%) */}
          <div className="flex-1 lg:max-w-[65%]">
            {/* Resumen móvil (drawer colapsable) - Solo visible en mobile */}
            <div className="lg:hidden mb-6">
              <div className="bg-white rounded-lg border border-zinc-200 overflow-hidden">
                {/* Header del drawer */}
                <button
                  type="button"
                  onClick={() => setIsSummaryOpen(!isSummaryOpen)}
                  className="w-full flex items-center justify-between p-4 hover:bg-zinc-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[#103948]">
                      Resumen del pedido
                    </h2>
                    <svg
                      className={`w-4 h-4 text-[#103948] transition-transform ${
                        isSummaryOpen ? "rotate-180" : ""
                      }`}
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth="2"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                  <span className="text-base font-semibold text-zinc-900">
                    ${reservationData.price.toLocaleString("es-MX")}
                  </span>
                </button>

                {/* Contenido del drawer (colapsable) */}
                {isSummaryOpen && (
                  <div className="border-t border-zinc-200 p-4 space-y-4">
                    {/* Thumbnail/Imagen */}
                    <div className="rounded-lg overflow-hidden aspect-video relative bg-zinc-100">
                      <Image
                        src="/reservation-thumbnail.png"
                        alt="Estudio de Locación Fotográfica - La Casa de Chuy el Rico"
                        fill
                        className="object-cover"
                        sizes="100vw"
                        priority
                      />
                    </div>

                    {/* Detalles */}
                    <div className="space-y-3 text-sm text-zinc-700">
                      <div>
                        <p className="font-medium text-zinc-900">Fecha:</p>
                        <p className="capitalize">
                          Día: {formatDisplayDate(reservationData.date)}
                        </p>
                        <p>
                          Hora: {formatDisplayTime(reservationData.time)} -{" "}
                          {(() => {
                            const [hours, minutes] = reservationData.time
                              .split(":")
                              .map(Number);
                            const endTime = new Date();
                            endTime.setHours(hours + 1, minutes, 0, 0);
                            return format(endTime, "h:mm a", { locale: es });
                          })()}
                        </p>
                      </div>
                      <div>
                        <p className="font-medium text-zinc-900">Dirección:</p>
                        <p className="text-zinc-600">
                          Jose Maria Arteaga 1111, Centro, 64000 Monterrey, N.L,
                          MX.
                        </p>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                      <span className="text-base font-semibold text-zinc-900">
                        Total
                      </span>
                      <span className="text-base font-semibold text-zinc-900">
                        MXN ${reservationData.price.toLocaleString("es-MX")}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {/* Sección: Contacto */}
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-zinc-900">
                    Contacto
                  </h2>
                  <button
                    type="button"
                    className="text-sm text-[#103948] hover:underline"
                    onClick={() => {
                      // Placeholder - implementar login después
                    }}
                  >
                    Iniciar sesión
                  </button>
                </div>
                <div className="mb-4">
                  <label
                    htmlFor="email"
                    className="mb-2 block text-sm font-medium text-zinc-700"
                  >
                    Correo electrónico <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="email"
                    type="email"
                    {...register("email")}
                    autoComplete="email"
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                    placeholder="correo@ejemplo.com"
                  />
                  {errors.email && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.email.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Sección: Pago */}
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-2">
                  Pago
                </h2>
                <div className="flex items-center gap-2 text-sm text-zinc-600 mb-4">
                  <svg
                    className="w-4 h-4 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                  <span>
                    Todas las transacciones son seguras y están encriptadas.
                  </span>
                </div>

                {/* Método de pago: Tarjeta de crédito */}
                <div className="mb-4 rounded border border-zinc-200 overflow-hidden bg-white">
                  <div className="flex items-center justify-between px-4 sm:px-5 py-4 bg-green-50 border-2 border-green-200 -mx-[1px] -mt-[1px]">
                    <span className="text-sm font-semibold text-zinc-900">
                      Tarjeta de crédito o débito
                    </span>
                    <div className="flex items-center gap-2.5">
                      {/* Visa */}
                      <div className="flex items-center justify-center w-10 h-6 bg-[#1A1F71] rounded text-white text-xs font-bold">
                        VISA
                      </div>
                      {/* Mastercard */}
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
                      {/* American Express */}
                      <div className="flex items-center justify-center w-10 h-6 bg-[#006FCF] rounded text-white text-[10px] font-bold">
                        AMEX
                      </div>
                    </div>
                  </div>
                  <div className="p-4 sm:p-5 bg-gray-50">
                    <ConektaPaymentForm
                      ref={paymentFormRef}
                      onError={(error) => setError(error)}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {/* Sección: Información de facturación */}
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                  Información de facturación
                </h2>

                {/* Nombre */}
                <div className="mb-4">
                  <label
                    htmlFor="name"
                    className="mb-2 block text-sm font-medium text-zinc-700"
                  >
                    Nombre completo <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="name"
                    type="text"
                    {...register("name")}
                    autoComplete="name"
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                    placeholder="Juan Pérez"
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* Teléfono */}
                <div className="mb-4">
                  <label
                    htmlFor="phone"
                    className="mb-2 block text-sm font-medium text-zinc-700"
                  >
                    Teléfono <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    {...register("phone")}
                    autoComplete="tel"
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                    placeholder="81 1234 5678"
                  />
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.phone.message}
                    </p>
                  )}
                </div>
              </div>

              {/* Términos y Condiciones */}
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <div className="flex items-start">
                  <input
                    id="acceptTerms"
                    type="checkbox"
                    {...register("acceptTerms")}
                    className="mt-1 h-4 w-4 rounded border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948]"
                  />
                  <label
                    htmlFor="acceptTerms"
                    className="ml-3 text-sm text-zinc-700"
                  >
                    Acepto los{" "}
                    <button
                      type="button"
                      onClick={() => setShowTermsModal(true)}
                      className="text-[#103948] hover:underline"
                    >
                      términos y condiciones
                    </button>{" "}
                    y la{" "}
                    <Link
                      href="/privacidad"
                      className="text-[#103948] hover:underline"
                    >
                      política de privacidad
                    </Link>
                  </label>
                </div>
                {errors.acceptTerms && (
                  <p className="mt-2 text-sm text-red-600">
                    {errors.acceptTerms.message}
                  </p>
                )}
              </div>

              {/* Error general */}
              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 text-sm">
                  {error}
                </div>
              )}

              {/* Botón de pago */}
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d3a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Procesando..." : "Pagar ahora"}
              </button>

              {/* Links de política y términos */}
              <div className="flex items-center justify-center gap-4 text-sm">
                <Link
                  href="/privacidad"
                  className="text-[#103948] hover:underline"
                >
                  Política de privacidad
                </Link>
                <span className="text-zinc-400">•</span>
                <Link
                  href="/terminos"
                  className="text-[#103948] hover:underline"
                >
                  Términos del servicio
                </Link>
              </div>
            </form>
          </div>

          {/* Columna derecha: Resumen (35-40%) - Solo visible en desktop */}
          <div className="hidden lg:block lg:w-[35%] lg:max-w-md">
            <div className="bg-white rounded-lg border border-zinc-200 p-6 sticky top-6">
              <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                Reservación
              </h2>

              {/* Thumbnail/Imagen */}
              <div className="mb-4 rounded-lg overflow-hidden aspect-video relative bg-zinc-100">
                <Image
                  src="/reservation-thumbnail.png"
                  alt="Estudio de Locación Fotográfica - La Casa de Chuy el Rico"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 35vw"
                  priority
                />
              </div>

              {/* Detalles */}
              <div className="space-y-3 text-sm text-zinc-700 mb-4">
                <div>
                  <p className="font-medium text-zinc-900">Fecha:</p>
                  <p className="capitalize">
                    Día: {formatDisplayDate(reservationData.date)}
                  </p>
                  <p>
                    Hora: {formatDisplayTime(reservationData.time)} -{" "}
                    {(() => {
                      const [hours, minutes] = reservationData.time
                        .split(":")
                        .map(Number);
                      const endTime = new Date();
                      endTime.setHours(hours + 1, minutes, 0, 0);
                      return format(endTime, "h:mm a", { locale: es });
                    })()}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-zinc-900">Dirección:</p>
                  <p className="text-zinc-600">
                    Jose Maria Arteaga 1111, Centro, 64000 Monterrey, N.L, MX.
                  </p>
                </div>
              </div>

              {/* Precio */}
              <div className="mb-4">
                <p className="text-sm font-medium text-zinc-900 mb-1">
                  ${reservationData.price.toLocaleString("es-MX")}
                </p>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                <span className="text-base font-semibold text-zinc-900">
                  Total
                </span>
                <span className="text-base font-semibold text-zinc-900">
                  MXN ${reservationData.price.toLocaleString("es-MX")}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal de Términos y Condiciones Completos */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </div>
  );
}
