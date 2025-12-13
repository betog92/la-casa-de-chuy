"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import { calculatePriceWithCustom } from "@/utils/pricing";
import TermsModal from "@/components/TermsModal";

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

interface ReservationData {
  date: string;
  time: string;
  price: number;
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

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ReservationFormData>({
    resolver: zodResolver(reservationFormSchema),
  });

  // Cargar datos de la reserva desde sessionStorage o query params
  useEffect(() => {
    const loadReservationData = async () => {
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
          const dateParam = searchParams.get("date");
          const timeParam = searchParams.get("time");

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
  }, [searchParams, router]);

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
      // Por ahora solo mostramos los datos
      // En el siguiente paso integraremos Conekta aquí
      console.log("Form data:", data);
      console.log("Reservation data:", reservationData);

      // TODO: Integrar Conekta aquí
      alert(
        "Formulario enviado correctamente. En el siguiente paso integraremos Conekta."
      );
    } catch (err) {
      console.error("Error:", err);
      setError("Ocurrió un error al procesar la reserva");
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
    <div className="min-h-screen bg-gradient-to-b from-zinc-50 to-white py-6 sm:py-12">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="mb-2 text-3xl font-bold text-zinc-900 sm:text-4xl">
            Completa tu Reserva
          </h1>
          <p className="text-zinc-600">
            Confirma tus datos para continuar con el pago
          </p>
        </div>

        {/* Resumen de Reserva */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">
            Resumen de tu Reserva
          </h2>
          <div className="space-y-3 text-zinc-700">
            <div className="flex justify-between">
              <span className="font-medium">Fecha:</span>
              <span className="capitalize">
                {formatDisplayDate(reservationData.date)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="font-medium">Hora:</span>
              <span>{formatDisplayTime(reservationData.time)}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 pt-3">
              <span className="font-semibold text-lg">Total:</span>
              <span className="font-semibold text-lg">
                ${reservationData.price.toLocaleString("es-MX")} MXN
              </span>
            </div>
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900">
              Tus Datos
            </h2>

            {/* Nombre */}
            <div className="mb-4">
              <label
                htmlFor="name"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Nombre completo *
              </label>
              <input
                id="name"
                type="text"
                {...register("name")}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                placeholder="Juan Pérez"
              />
              {errors.name && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.name.message}
                </p>
              )}
            </div>

            {/* Email */}
            <div className="mb-4">
              <label
                htmlFor="email"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Email *
              </label>
              <input
                id="email"
                type="email"
                {...register("email")}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
                placeholder="juan@ejemplo.com"
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            {/* Teléfono */}
            <div className="mb-4">
              <label
                htmlFor="phone"
                className="mb-2 block text-sm font-medium text-zinc-700"
              >
                Teléfono *
              </label>
              <input
                id="phone"
                type="tel"
                {...register("phone")}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500"
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
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900">
              Términos y Condiciones
            </h2>

            <div className="mb-4 space-y-2 text-sm text-zinc-600">
              <p>
                Al confirmar tu reserva, aceptas las siguientes condiciones:
              </p>
              <ul className="ml-4 list-disc space-y-1">
                <li>
                  <strong>Re-agendamiento:</strong> Mínimo 5 días hábiles de
                  anticipación
                </li>
                <li>
                  <strong>Cancelación:</strong> Mínimo 5 días hábiles para
                  reembolso del 80%
                </li>
                <li>
                  <strong>No-show:</strong> Sin reembolso
                </li>
                <li>
                  <strong>Sesión:</strong> 1 hora (si usas vestidor, llega 25
                  min antes)
                </li>
                <li>
                  <strong>Días festivos:</strong> Cargo adicional de $500 MXN en
                  efectivo
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => setShowTermsModal(true)}
              className="mb-4 text-sm font-medium text-zinc-900 underline hover:text-zinc-700"
            >
              Ver términos y condiciones completos
            </button>

            <div className="flex items-start">
              <input
                id="acceptTerms"
                type="checkbox"
                {...register("acceptTerms")}
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-2 focus:ring-zinc-500"
              />
              <label
                htmlFor="acceptTerms"
                className="ml-3 text-sm text-zinc-700"
              >
                Acepto los términos y condiciones *
              </label>
            </div>
            {errors.acceptTerms && (
              <p className="mt-2 text-sm text-red-600">
                {errors.acceptTerms.message}
              </p>
            )}
          </div>

          {/* Sección de Pago - Preparada para Conekta */}
          <div className="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold text-zinc-900">
              Método de Pago
            </h2>
            <div className="py-8 text-center text-zinc-500">
              {/* Aquí irá el checkout de Conekta */}
              <p>Checkout de Conekta se integrará aquí</p>
            </div>
          </div>

          {/* Error general */}
          {error && (
            <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-6 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Volver
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 rounded-lg bg-zinc-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Procesando..." : "Confirmar y Pagar"}
            </button>
          </div>
        </form>
      </div>

      {/* Modal de Términos y Condiciones Completos */}
      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
    </div>
  );
}
