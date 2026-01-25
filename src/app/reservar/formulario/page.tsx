"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { createClient } from "@/lib/supabase/client";
import {
  calculatePriceWithCustom,
  calculateFinalPrice,
  applyLastMinuteDiscount,
  applyLoyaltyDiscount,
} from "@/utils/pricing";
import Link from "next/link";
import TermsModal from "@/components/TermsModal";
import ConektaPaymentForm, {
  type ConektaPaymentFormRef,
} from "@/components/ConektaPaymentForm";
import type { ReservationData } from "@/types/reservation";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";

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

function FormularioReservaContent() {
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
  const { user } = useAuth();

  // Estados para descuentos y beneficios
  const [discountCode, setDiscountCode] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<{
    code: string;
    percentage: number;
  } | null>(null);
  const [appliedReferralCode, setAppliedReferralCode] = useState<{
    code: string;
    percentage: number;
  } | null>(null);
  const [showCodeChoice, setShowCodeChoice] = useState(false);
  const [selectedCodeType, setSelectedCodeType] = useState<
    "discount" | "referral" | null
  >(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [priceCalculation, setPriceCalculation] = useState<{
    basePrice: number;
    originalPrice: number;
    finalPrice: number;
    discounts: {
      lastMinute?: { amount: number; applied: boolean };
      loyalty?: { amount: number; percentage: number };
      referral?: { amount: number; applied: boolean };
      loyaltyPoints?: { amount: number; points: number };
      discountCode?: { amount: number; percentage: number; code: string };
    };
    totalDiscount: number;
  } | null>(null);
  const [availablePoints, setAvailablePoints] = useState(0);
  const [availableCredits, setAvailableCredits] = useState(0);
  const [useLoyaltyPoints, setUseLoyaltyPoints] = useState(0);
  const [useCredits, setUseCredits] = useState(0);
  const [useLoyaltyDiscount, setUseLoyaltyDiscount] = useState(false);
  const [reservationCount, setReservationCount] = useState(0); // TODO: Obtener del usuario si está logueado (temporalmente 0 para visualización)
  const [prefilledFields, setPrefilledFields] = useState<{
    email: boolean;
    name: boolean;
    phone: boolean;
  }>({
    email: false,
    name: false,
    phone: false,
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ReservationFormData>({
    resolver: zodResolver(reservationFormSchema),
  });

  // Obtener el email actual del formulario
  const currentEmail = watch("email");

  // Extraer valores de searchParams de forma estable para evitar re-renders innecesarios
  const dateParam = searchParams.get("date");
  const timeParam = searchParams.get("time");

  // Prellenar formulario con datos del usuario si está logueado
  useEffect(() => {
    const loadUserProfile = async () => {
      if (!user?.id) return; // Solo si está logueado

      try {
        const response = await axios.get("/api/users/profile");
        if (response.data.success) {
          const profile = response.data;

          // Prellenar email siempre si está disponible y marcarlo como prellenado
          if (profile.email) {
            setValue("email", profile.email);
            setPrefilledFields((prev) => ({ ...prev, email: true }));
          }
          // Prellenar name solo si existe y marcarlo como prellenado
          if (profile.name) {
            setValue("name", profile.name);
            setPrefilledFields((prev) => ({ ...prev, name: true }));
          }
          // Prellenar phone solo si existe y marcarlo como prellenado
          if (profile.phone) {
            setValue("phone", profile.phone);
            setPrefilledFields((prev) => ({ ...prev, phone: true }));
          }
        }
      } catch (error) {
        // Silenciosamente fallar, no es crítico si no se puede cargar el perfil
        console.error("Error loading user profile:", error);
      }
    };

    loadUserProfile();
  }, [user, setValue]);

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

  // Recalcular precio cuando cambien puntos o créditos
  useEffect(() => {
    const recalculatePrice = async () => {
      if (!reservationData) return;

      try {
        const date = parse(reservationData.date, "yyyy-MM-dd", new Date());
        const supabase = createClient();
        const calculation = await calculateFinalPrice(supabase, {
          date,
          customPrice: reservationData.price,
          isLastMinute: true,
          reservationCount: useLoyaltyDiscount ? reservationCount : undefined,
          isFirstReservation: undefined, // TODO: Verificar si es primera reserva
          useLoyaltyPoints: useLoyaltyPoints,
        });

        // Aplicar código de descuento o referido (solo uno)
        let priceAfterCode = calculation.finalPrice;
        const discountsWithCode = { ...calculation.discounts };

        if (appliedDiscountCode) {
          // Aplicar código de descuento al precio base
          const codeDiscount =
            calculation.basePrice * (appliedDiscountCode.percentage / 100);
          let newBasePrice = calculation.basePrice - codeDiscount;

          // Recalcular otros descuentos sobre el nuevo precio base
          // Descuento último minuto
          if (calculation.discounts.lastMinute?.applied) {
            const lastMinute = applyLastMinuteDiscount(date, newBasePrice);
            if (lastMinute.applied) {
              newBasePrice = lastMinute.price;
              // Actualizar el monto en discountsWithCode
              discountsWithCode.lastMinute = {
                amount: lastMinute.discount,
                applied: true,
              };
            }
          }

          // Descuento fidelización
          if (useLoyaltyDiscount && reservationCount >= 1) {
            const loyalty = applyLoyaltyDiscount(
              reservationCount,
              newBasePrice
            );
            if (loyalty.percentage > 0) {
              newBasePrice = loyalty.price;
              // Actualizar el monto en discountsWithCode
              discountsWithCode.loyalty = {
                amount: loyalty.discount,
                percentage: loyalty.percentage,
              };
            }
          }
          // Preservar loyalty discount del cálculo original si no se está aplicando
          else if (calculation.discounts.loyalty) {
            discountsWithCode.loyalty = calculation.discounts.loyalty;
          }

          // Puntos de lealtad
          if (useLoyaltyPoints > 0) {
            const pointsDiscount = Math.floor(useLoyaltyPoints / 100) * 100;
            newBasePrice = Math.max(0, newBasePrice - pointsDiscount);
            // Agregar a discountsWithCode para que se muestre en la UI
            discountsWithCode.loyaltyPoints = {
              amount: pointsDiscount,
              points: useLoyaltyPoints,
            };
          }
          // Preservar loyaltyPoints del cálculo original si no se están usando nuevos
          else if (calculation.discounts.loyaltyPoints) {
            discountsWithCode.loyaltyPoints =
              calculation.discounts.loyaltyPoints;
          }

          priceAfterCode = newBasePrice;

          discountsWithCode.discountCode = {
            amount: codeDiscount,
            percentage: appliedDiscountCode.percentage,
            code: appliedDiscountCode.code,
          };
          // Remover referral si estaba aplicado (no se pueden combinar)
          delete discountsWithCode.referral;
        } else if (appliedReferralCode) {
          // Aplicar código de referido al precio final calculado
          const referralDiscount =
            calculation.finalPrice * (appliedReferralCode.percentage / 100);
          priceAfterCode = calculation.finalPrice - referralDiscount;

          discountsWithCode.referral = {
            amount: referralDiscount,
            applied: true,
          };
        }

        // Aplicar créditos al precio final
        const finalPriceWithCredits = Math.max(0, priceAfterCode - useCredits);

        setPriceCalculation({
          basePrice: calculation.basePrice,
          originalPrice: calculation.originalPrice,
          discounts: discountsWithCode,
          finalPrice: finalPriceWithCredits,
          totalDiscount: calculation.originalPrice - finalPriceWithCredits,
        });
      } catch (err) {
        console.error("Error recalculating price:", err);
      }
    };

    recalculatePrice();
  }, [
    reservationData,
    useLoyaltyPoints,
    useCredits,
    useLoyaltyDiscount,
    reservationCount,
    appliedDiscountCode,
    appliedReferralCode,
  ]);

  // Función para validar código de descuento
  const validateDiscountCode = async (code: string) => {
    if (!code.trim()) {
      setCodeError("Ingresa un código");
      return;
    }

    setValidatingCode(true);
    setCodeError(null);

    try {
      const response = await axios.post("/api/discount-codes/validate", {
        code: code.trim(),
        email:
          currentEmail && currentEmail.trim() ? currentEmail.trim() : undefined,
      });

      // La respuesta es { success: true, valid: true, code: "...", ... }
      if (response.data.success && response.data.valid) {
        const codeData = response.data;

        // Si ya hay un código de referido válido, mostrar selección
        if (appliedReferralCode) {
          setAppliedDiscountCode({
            code: codeData.code,
            percentage: codeData.discountPercentage,
          });
          setShowCodeChoice(true);
          setSelectedCodeType("discount");
        } else {
          // Aplicar directamente
          setAppliedDiscountCode({
            code: codeData.code,
            percentage: codeData.discountPercentage,
          });
          setAppliedReferralCode(null);
          setShowCodeChoice(false);
        }
      } else {
        setCodeError(response.data.error || "Código no válido");
      }
    } catch (error: unknown) {
      const errorMessage = getErrorMessage(error);
      setCodeError(errorMessage);
    } finally {
      setValidatingCode(false);
    }
  };

  // Función para validar código de referido (placeholder - implementar después)
  const validateReferralCode = async (code: string) => {
    // TODO: Implementar validación de código de referido
    // Por ahora, simular validación
    if (!code.trim()) {
      setCodeError("Ingresa un código");
      return;
    }

    setValidatingCode(true);
    setCodeError(null);

    // Simulación temporal - reemplazar con API real
    setTimeout(() => {
      const referralData = {
        code: code.trim().toUpperCase(),
        percentage: 10,
      };

      // Si ya hay un código de descuento válido, mostrar selección
      if (appliedDiscountCode) {
        setAppliedReferralCode(referralData);
        setShowCodeChoice(true);
        setSelectedCodeType("referral");
      } else {
        // Aplicar directamente
        setAppliedReferralCode(referralData);
        setAppliedDiscountCode(null);
        setShowCodeChoice(false);
      }
      setValidatingCode(false);
    }, 500);
  };

  // Función para aplicar el código seleccionado
  const handleApplySelectedCode = () => {
    if (selectedCodeType === "discount") {
      setAppliedReferralCode(null);
      setShowCodeChoice(false);
    } else if (selectedCodeType === "referral") {
      setAppliedDiscountCode(null);
      setShowCodeChoice(false);
    }
  };

  // Formatear fecha para mostrar
  const formatDisplayDate = (dateString: string): string => {
    const date = parse(dateString, "yyyy-MM-dd", new Date());
    const formatted = format(date, "EEEE, d 'de' MMMM 'de' yyyy", {
      locale: es,
    });
    // Capitalizar solo la primera letra
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
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
          amount: priceCalculation?.finalPrice || reservationData.price,
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
            price: priceCalculation?.finalPrice || reservationData.price,
            originalPrice:
              priceCalculation?.originalPrice || reservationData.price,
            paymentId: orderId,
            userId: user?.id || null,
            discountAmount: priceCalculation?.totalDiscount || 0,
            // Campos específicos de descuentos
            lastMinuteDiscount:
              priceCalculation?.discounts.lastMinute?.amount || 0,
            loyaltyDiscount: priceCalculation?.discounts.loyalty?.amount || 0,
            loyaltyPointsUsed:
              priceCalculation?.discounts.loyaltyPoints?.points || 0,
            creditsUsed: useCredits || 0,
            referralDiscount: priceCalculation?.discounts.referral?.amount || 0,
            // Código de descuento aplicado
            discountCode: appliedDiscountCode?.code || null,
            discountCodeDiscount:
              priceCalculation?.discounts.discountCode?.amount || 0,
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

        // Si es un invitado, guardar el token y URL del magic link
        if (
          reservationResponse.data.guestToken &&
          reservationResponse.data.guestReservationUrl
        ) {
          sessionStorage.setItem(
            "guestToken",
            reservationResponse.data.guestToken
          );
          sessionStorage.setItem(
            "guestReservationUrl",
            reservationResponse.data.guestReservationUrl
          );
        }

        // Paso 4: Limpiar sessionStorage y redirigir a confirmación
        // Limpiar datos temporales de reserva (se mantienen guestToken y guestReservationUrl
        // para que la página de confirmación los use)
        sessionStorage.removeItem("reservationData");

        // Construir query params para la página de confirmación
        const queryParams = new URLSearchParams({
          id: reservationId,
        });

        // Agregar información de cambio de nivel si está disponible
        if (reservationResponse.data.loyaltyLevelChanged) {
          queryParams.set("loyaltyLevelChanged", "true");
          if (reservationResponse.data.newLoyaltyLevel) {
            queryParams.set(
              "newLoyaltyLevel",
              reservationResponse.data.newLoyaltyLevel
            );
          }
        }

        router.push(`/reservar/confirmacion?${queryParams.toString()}`);
      } catch (error: unknown) {
        // Manejar errores específicos de la API de reservaciones
        const errorMessage = getErrorMessage(error);
        setError(errorMessage);
        setLoading(false);
        return;
      }
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
                    $
                    {(
                      priceCalculation?.finalPrice || reservationData.price
                    ).toLocaleString("es-MX")}
                  </span>
                </button>

                {/* Contenido del drawer (colapsable) */}
                {isSummaryOpen && (
                  <div className="border-t border-zinc-200 p-4 space-y-4">
                    {/* Detalles */}
                    <div className="space-y-3 text-sm text-zinc-700">
                      <div>
                        <p className="font-medium text-zinc-900 mb-1">Fecha:</p>
                        <p className="text-zinc-600">
                          {formatDisplayDate(reservationData.date)}
                        </p>
                        <p className="text-zinc-600">
                          {formatDisplayTime(reservationData.time)} -{" "}
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
                    </div>

                    {/* Código de Descuento/Referido */}
                    <div className="mb-4 pb-4 border-b border-zinc-200">
                      <label className="block text-sm font-medium text-zinc-700 mb-2">
                        ¿Tienes un código de descuento?
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value)}
                          placeholder="Ingresa código"
                          disabled={validatingCode || !!appliedDiscountCode}
                          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => validateDiscountCode(discountCode)}
                          disabled={
                            validatingCode ||
                            !discountCode.trim() ||
                            !!appliedDiscountCode
                          }
                          className="px-4 py-2 text-sm font-medium text-[#103948] border border-[#103948] rounded hover:bg-[#103948] hover:text-white transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {validatingCode
                            ? "Validando..."
                            : appliedDiscountCode
                            ? "Aplicado"
                            : "Aplicar"}
                        </button>
                      </div>
                      {codeError && (
                        <p className="mt-2 text-sm text-red-600">{codeError}</p>
                      )}
                      {appliedDiscountCode && (
                        <div className="mt-2 py-1 flex items-center justify-between gap-2 text-sm text-green-600">
                          <div className="flex items-center gap-2">
                            <svg
                              className="w-4 h-4 flex-shrink-0"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="2.5"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>
                              Código {appliedDiscountCode.code} aplicado (
                              {appliedDiscountCode.percentage}% de descuento)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setAppliedDiscountCode(null);
                              setDiscountCode("");
                              setCodeError(null);
                            }}
                            className="flex-shrink-0 px-1 py-0.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            aria-label="Remover código"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Selección de código cuando ambos son válidos */}
                    {showCodeChoice &&
                      appliedDiscountCode &&
                      appliedReferralCode && (
                        <div className="mb-4 pb-4 border-b border-zinc-200">
                          <p className="text-sm font-medium text-zinc-900 mb-3">
                            Tienes dos códigos válidos. Elige cuál aplicar:
                          </p>
                          <div className="space-y-2">
                            {/* Opción 1: Código de descuento */}
                            <label
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer hover:border-[#103948] ${
                                selectedCodeType === "discount"
                                  ? "border-[#103948] bg-green-50"
                                  : "border-zinc-200"
                              }`}
                            >
                              <input
                                type="radio"
                                name="codeChoice"
                                value="discount"
                                checked={selectedCodeType === "discount"}
                                onChange={() => setSelectedCodeType("discount")}
                                className="h-5 w-5 border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-zinc-900">
                                    {appliedDiscountCode.code}
                                  </span>
                                  {selectedCodeType === "discount" && (
                                    <svg
                                      className="w-4 h-4 text-green-600"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth="2.5"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {appliedDiscountCode.percentage}% de descuento
                                </p>
                              </div>
                            </label>

                            {/* Opción 2: Código de referido */}
                            <label
                              className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer hover:border-[#103948] ${
                                selectedCodeType === "referral"
                                  ? "border-[#103948] bg-green-50"
                                  : "border-zinc-200"
                              }`}
                            >
                              <input
                                type="radio"
                                name="codeChoice"
                                value="referral"
                                checked={selectedCodeType === "referral"}
                                onChange={() => setSelectedCodeType("referral")}
                                className="h-5 w-5 border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0"
                              />
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-zinc-900">
                                    {appliedReferralCode.code}
                                  </span>
                                  {selectedCodeType === "referral" && (
                                    <svg
                                      className="w-4 h-4 text-green-600"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      strokeWidth="2.5"
                                      stroke="currentColor"
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                      />
                                    </svg>
                                  )}
                                </div>
                                <p className="text-xs text-zinc-500 mt-0.5">
                                  {appliedReferralCode.percentage}% de descuento
                                  (referido)
                                </p>
                              </div>
                            </label>
                          </div>
                          <button
                            type="button"
                            onClick={handleApplySelectedCode}
                            disabled={!selectedCodeType}
                            className="mt-3 w-full rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d3a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            Aplicar código seleccionado
                          </button>
                        </div>
                      )}

                    {/* Beneficios Disponibles - Estilo Rappi */}
                    <div className="mb-6 space-y-3">
                      {/* Descuento por Fidelización - Siempre visible */}
                      <div className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              Descuento por fidelización
                            </span>
                            {useLoyaltyDiscount && (
                              <svg
                                className="w-4 h-4 text-green-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="2.5"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            )}
                          </div>
                          {reservationCount >= 1 ? (
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {reservationCount === 1 &&
                                "3% de descuento (2da reserva)"}
                              {reservationCount >= 2 &&
                                reservationCount < 4 &&
                                "3% de descuento aplicado"}
                              {reservationCount >= 4 &&
                                reservationCount < 9 &&
                                "4% de descuento (5ta reserva)"}
                              {reservationCount >= 9 &&
                                "5% de descuento (10ma reserva)"}
                            </p>
                          ) : (
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Disponible desde tu 2da reserva
                            </p>
                          )}
                        </div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={useLoyaltyDiscount}
                            disabled={reservationCount < 1}
                            onChange={(e) =>
                              setUseLoyaltyDiscount(e.target.checked)
                            }
                            className="h-5 w-5 rounded border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                        </label>
                      </div>

                      {/* Puntos de Lealtad */}
                      <div className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              Puntos de lealtad
                            </span>
                            {useLoyaltyPoints > 0 && (
                              <svg
                                className="w-4 h-4 text-green-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="2.5"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-zinc-500">
                              {availablePoints} puntos disponibles
                            </span>
                            {availablePoints >= 100 && useLoyaltyPoints > 0 && (
                              <span className="text-xs font-medium text-green-600">
                                • Usando {useLoyaltyPoints} puntos
                              </span>
                            )}
                          </div>
                          {availablePoints < 100 && (
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Gana 1 punto por cada $10 gastados
                            </p>
                          )}
                        </div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={useLoyaltyPoints > 0}
                            disabled={availablePoints < 100}
                            onChange={(e) => {
                              if (e.target.checked) {
                                const pointsToUse =
                                  Math.floor(availablePoints / 100) * 100;
                                setUseLoyaltyPoints(pointsToUse);
                              } else {
                                setUseLoyaltyPoints(0);
                              }
                            }}
                            className="h-5 w-5 rounded border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                        </label>
                      </div>

                      {/* Créditos */}
                      <div className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              Créditos disponibles
                            </span>
                            {useCredits > 0 && (
                              <svg
                                className="w-4 h-4 text-green-600"
                                fill="none"
                                viewBox="0 0 24 24"
                                strokeWidth="2.5"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                              </svg>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-zinc-500">
                              ${availableCredits.toLocaleString("es-MX")}{" "}
                              disponibles
                            </span>
                            {useCredits > 0 && (
                              <span className="text-xs font-medium text-green-600">
                                • Usando ${useCredits.toLocaleString("es-MX")}
                              </span>
                            )}
                          </div>
                          {availableCredits === 0 && (
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Gana $200 por cada amigo que refieras
                            </p>
                          )}
                        </div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={useCredits > 0}
                            disabled={availableCredits === 0}
                            onChange={(e) => {
                              setUseCredits(
                                e.target.checked ? availableCredits : 0
                              );
                            }}
                            className="h-5 w-5 rounded border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                        </label>
                      </div>
                    </div>

                    {/* Descuentos Aplicados */}
                    {priceCalculation && priceCalculation.totalDiscount > 0 && (
                      <div className="mb-4 pb-4 border-b border-zinc-200">
                        <p className="text-sm font-medium text-zinc-900 mb-2">
                          Descuentos aplicados
                        </p>
                        <div className="space-y-1 text-sm">
                          {priceCalculation.discounts.discountCode && (
                            <div className="flex justify-between text-green-600">
                              <span>
                                Código{" "}
                                {priceCalculation.discounts.discountCode.code} (
                                {
                                  priceCalculation.discounts.discountCode
                                    .percentage
                                }
                                %)
                              </span>
                              <span>
                                -$
                                {priceCalculation.discounts.discountCode.amount.toLocaleString(
                                  "es-MX"
                                )}
                              </span>
                            </div>
                          )}
                          {priceCalculation.discounts.lastMinute?.applied && (
                            <div className="flex justify-between text-green-600">
                              <span>Descuento último minuto (15%)</span>
                              <span>
                                -$
                                {priceCalculation.discounts.lastMinute.amount.toLocaleString(
                                  "es-MX"
                                )}
                              </span>
                            </div>
                          )}
                          {priceCalculation.discounts.loyalty && (
                            <div className="flex justify-between text-green-600">
                              <span>
                                Descuento por fidelización (
                                {priceCalculation.discounts.loyalty.percentage}
                                %)
                              </span>
                              <span>
                                -$
                                {priceCalculation.discounts.loyalty.amount.toLocaleString(
                                  "es-MX"
                                )}
                              </span>
                            </div>
                          )}
                          {priceCalculation.discounts.referral?.applied && (
                            <div className="flex justify-between text-green-600">
                              <span>Descuento por referido (10%)</span>
                              <span>
                                -$
                                {priceCalculation.discounts.referral.amount.toLocaleString(
                                  "es-MX"
                                )}
                              </span>
                            </div>
                          )}
                          {priceCalculation.discounts.loyaltyPoints && (
                            <div className="flex justify-between text-green-600">
                              <span>
                                Puntos aplicados (
                                {
                                  priceCalculation.discounts.loyaltyPoints
                                    .points
                                }{" "}
                                pts)
                              </span>
                              <span>
                                -$
                                {priceCalculation.discounts.loyaltyPoints.amount.toLocaleString(
                                  "es-MX"
                                )}
                              </span>
                            </div>
                          )}
                          {useCredits > 0 && (
                            <div className="flex justify-between text-green-600">
                              <span>Créditos aplicados</span>
                              <span>
                                -${useCredits.toLocaleString("es-MX")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Precio Base */}
                    <div className="mb-2">
                      <div className="flex justify-between text-sm text-zinc-600">
                        <span>Precio base</span>
                        <span>
                          $
                          {(
                            priceCalculation?.basePrice || reservationData.price
                          ).toLocaleString("es-MX")}
                        </span>
                      </div>
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                      <span className="text-base font-semibold text-zinc-900">
                        Total
                      </span>
                      <span className="text-base font-semibold text-zinc-900">
                        MXN $
                        {(
                          priceCalculation?.finalPrice || reservationData.price
                        ).toLocaleString("es-MX")}
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
                  {!user && (
                    <Link
                      href="/auth/login"
                      className="text-sm text-[#103948] hover:underline"
                    >
                      Iniciar sesión
                    </Link>
                  )}
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
                    disabled={prefilledFields.email}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-500"
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
                  <div className="p-4 sm:p-5">
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
                    disabled={prefilledFields.name}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-500"
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
                    disabled={prefilledFields.phone}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:bg-zinc-100 disabled:cursor-not-allowed disabled:text-zinc-500"
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

              {/* Detalles */}
              <div className="space-y-3 text-sm text-zinc-700 mb-4">
                <div>
                  <p className="font-medium text-zinc-900 mb-1">Fecha:</p>
                  <p className="text-zinc-600">
                    {formatDisplayDate(reservationData.date)}
                  </p>
                  <p className="text-zinc-600">
                    {formatDisplayTime(reservationData.time)} -{" "}
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
              </div>

              {/* Código de Descuento/Referido */}
              <div className="mb-4 pb-4 border-b border-zinc-200">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  ¿Tienes un código de descuento?
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder="Ingresa código"
                    disabled={validatingCode || !!appliedDiscountCode}
                    className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => validateDiscountCode(discountCode)}
                    disabled={
                      validatingCode ||
                      !discountCode.trim() ||
                      !!appliedDiscountCode
                    }
                    className="px-4 py-2 text-sm font-medium text-[#103948] border border-[#103948] rounded hover:bg-[#103948] hover:text-white transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {validatingCode
                      ? "Validando..."
                      : appliedDiscountCode
                      ? "Aplicado"
                      : "Aplicar"}
                  </button>
                </div>
                {codeError && (
                  <p className="mt-2 text-sm text-red-600">{codeError}</p>
                )}
                {appliedDiscountCode && (
                  <div className="mt-2 py-1 flex items-center justify-between gap-2 text-sm text-green-600">
                    <div className="flex items-center gap-2">
                      <svg
                        className="w-4 h-4 flex-shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth="2.5"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <span>
                        Código {appliedDiscountCode.code} aplicado (
                        {appliedDiscountCode.percentage}% de descuento)
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAppliedDiscountCode(null);
                        setDiscountCode("");
                        setCodeError(null);
                      }}
                      className="flex-shrink-0 px-1 py-0.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      aria-label="Remover código"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

              {/* Selección de código cuando ambos son válidos - Desktop */}
              {showCodeChoice && appliedDiscountCode && appliedReferralCode && (
                <div className="mb-4 pb-4 border-b border-zinc-200">
                  <p className="text-sm font-medium text-zinc-900 mb-3">
                    Tienes dos códigos válidos. Elige cuál aplicar:
                  </p>
                  <div className="space-y-2">
                    {/* Opción 1: Código de descuento */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer hover:border-[#103948] ${
                        selectedCodeType === "discount"
                          ? "border-[#103948] bg-green-50"
                          : "border-zinc-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="codeChoice"
                        value="discount"
                        checked={selectedCodeType === "discount"}
                        onChange={() => setSelectedCodeType("discount")}
                        className="h-5 w-5 border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900">
                            {appliedDiscountCode.code}
                          </span>
                          {selectedCodeType === "discount" && (
                            <svg
                              className="w-4 h-4 text-green-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="2.5"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {appliedDiscountCode.percentage}% de descuento
                        </p>
                      </div>
                    </label>

                    {/* Opción 2: Código de referido */}
                    <label
                      className={`flex items-center gap-3 p-3 rounded-lg border-2 transition-colors cursor-pointer hover:border-[#103948] ${
                        selectedCodeType === "referral"
                          ? "border-[#103948] bg-green-50"
                          : "border-zinc-200"
                      }`}
                    >
                      <input
                        type="radio"
                        name="codeChoice"
                        value="referral"
                        checked={selectedCodeType === "referral"}
                        onChange={() => setSelectedCodeType("referral")}
                        className="h-5 w-5 border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-zinc-900">
                            {appliedReferralCode.code}
                          </span>
                          {selectedCodeType === "referral" && (
                            <svg
                              className="w-4 h-4 text-green-600"
                              fill="none"
                              viewBox="0 0 24 24"
                              strokeWidth="2.5"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                          )}
                        </div>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {appliedReferralCode.percentage}% de descuento
                          (referido)
                        </p>
                      </div>
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplySelectedCode}
                    disabled={!selectedCodeType}
                    className="mt-3 w-full rounded-lg bg-[#103948] px-4 py-2 text-sm font-medium text-white hover:bg-[#0d2d3a] transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    Aplicar código seleccionado
                  </button>
                </div>
              )}

              {/* Beneficios Disponibles - Estilo Rappi */}
              <div className="mb-6 space-y-3">
                {/* Descuento por Fidelización - Siempre visible */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        Descuento por fidelización
                      </span>
                      {useLoyaltyDiscount && (
                        <svg
                          className="w-4 h-4 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </div>
                    {reservationCount >= 1 ? (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        {reservationCount === 1 &&
                          "3% de descuento (2da reserva)"}
                        {reservationCount >= 2 &&
                          reservationCount < 4 &&
                          "3% de descuento aplicado"}
                        {reservationCount >= 4 &&
                          reservationCount < 9 &&
                          "4% de descuento (5ta reserva)"}
                        {reservationCount >= 9 &&
                          "5% de descuento (10ma reserva)"}
                      </p>
                    ) : (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Disponible desde tu 2da reserva
                      </p>
                    )}
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={useLoyaltyDiscount}
                      disabled={reservationCount < 1}
                      onChange={(e) => setUseLoyaltyDiscount(e.target.checked)}
                      className="h-5 w-5 rounded border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                    />
                  </label>
                </div>

                {/* Puntos de Lealtad */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        Puntos de lealtad
                      </span>
                      {useLoyaltyPoints > 0 && (
                        <svg
                          className="w-4 h-4 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-zinc-500">
                        {availablePoints} puntos disponibles
                      </span>
                      {availablePoints >= 100 && useLoyaltyPoints > 0 && (
                        <span className="text-xs font-medium text-green-600">
                          • Usando {useLoyaltyPoints} puntos
                        </span>
                      )}
                    </div>
                    {availablePoints < 100 && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Gana 1 punto por cada $10 gastados
                      </p>
                    )}
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={useLoyaltyPoints > 0}
                      disabled={availablePoints < 100}
                      onChange={(e) => {
                        if (e.target.checked) {
                          const pointsToUse =
                            Math.floor(availablePoints / 100) * 100;
                          setUseLoyaltyPoints(pointsToUse);
                        } else {
                          setUseLoyaltyPoints(0);
                        }
                      }}
                      className="h-5 w-5 rounded border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                    />
                  </label>
                </div>

                {/* Créditos */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        Créditos disponibles
                      </span>
                      {useCredits > 0 && (
                        <svg
                          className="w-4 h-4 text-green-600"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2.5"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-xs text-zinc-500">
                        ${availableCredits.toLocaleString("es-MX")} disponibles
                      </span>
                      {useCredits > 0 && (
                        <span className="text-xs font-medium text-green-600">
                          • Usando ${useCredits.toLocaleString("es-MX")}
                        </span>
                      )}
                    </div>
                    {availableCredits === 0 && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Gana $200 por cada amigo que refieras
                      </p>
                    )}
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={useCredits > 0}
                      disabled={availableCredits === 0}
                      onChange={(e) => {
                        setUseCredits(e.target.checked ? availableCredits : 0);
                      }}
                      className="h-5 w-5 rounded border-2 border-zinc-300 text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                    />
                  </label>
                </div>
              </div>

              {/* Descuentos Aplicados */}
              {priceCalculation && priceCalculation.totalDiscount > 0 && (
                <div className="mb-4 pb-4 border-b border-zinc-200">
                  <p className="text-sm font-medium text-zinc-900 mb-2">
                    Descuentos aplicados
                  </p>
                  <div className="space-y-1 text-sm">
                    {priceCalculation.discounts.discountCode && (
                      <div className="flex justify-between text-green-600">
                        <span>
                          Código {priceCalculation.discounts.discountCode.code}{" "}
                          ({priceCalculation.discounts.discountCode.percentage}
                          %)
                        </span>
                        <span>
                          -$
                          {priceCalculation.discounts.discountCode.amount.toLocaleString(
                            "es-MX"
                          )}
                        </span>
                      </div>
                    )}
                    {priceCalculation.discounts.lastMinute?.applied && (
                      <div className="flex justify-between text-green-600">
                        <span>Descuento último minuto (15%)</span>
                        <span>
                          -$
                          {priceCalculation.discounts.lastMinute.amount.toLocaleString(
                            "es-MX"
                          )}
                        </span>
                      </div>
                    )}
                    {priceCalculation.discounts.loyalty && (
                      <div className="flex justify-between text-green-600">
                        <span>
                          Descuento por fidelización (
                          {priceCalculation.discounts.loyalty.percentage}%)
                        </span>
                        <span>
                          -$
                          {priceCalculation.discounts.loyalty.amount.toLocaleString(
                            "es-MX"
                          )}
                        </span>
                      </div>
                    )}
                    {priceCalculation.discounts.referral?.applied && (
                      <div className="flex justify-between text-green-600">
                        <span>Descuento por referido (10%)</span>
                        <span>
                          -$
                          {priceCalculation.discounts.referral.amount.toLocaleString(
                            "es-MX"
                          )}
                        </span>
                      </div>
                    )}
                    {priceCalculation.discounts.loyaltyPoints && (
                      <div className="flex justify-between text-green-600">
                        <span>
                          Puntos aplicados (
                          {priceCalculation.discounts.loyaltyPoints.points} pts)
                        </span>
                        <span>
                          -$
                          {priceCalculation.discounts.loyaltyPoints.amount.toLocaleString(
                            "es-MX"
                          )}
                        </span>
                      </div>
                    )}
                    {useCredits > 0 && (
                      <div className="flex justify-between text-green-600">
                        <span>Créditos aplicados</span>
                        <span>-${useCredits.toLocaleString("es-MX")}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Precio Base */}
              <div className="mb-2">
                <div className="flex justify-between text-sm text-zinc-600">
                  <span>Precio base</span>
                  <span>
                    $
                    {(
                      priceCalculation?.basePrice || reservationData.price
                    ).toLocaleString("es-MX")}
                  </span>
                </div>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
                <span className="text-base font-semibold text-zinc-900">
                  Total
                </span>
                <span className="text-base font-semibold text-zinc-900">
                  MXN $
                  {(
                    priceCalculation?.finalPrice || reservationData.price
                  ).toLocaleString("es-MX")}
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

export default function FormularioReservaPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto"></div>
            <p className="mt-4 text-zinc-600">Cargando formulario...</p>
          </div>
        </div>
      }
    >
      <FormularioReservaContent />
    </Suspense>
  );
}
