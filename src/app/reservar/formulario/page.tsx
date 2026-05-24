"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { parse } from "date-fns";
import { createClient } from "@/lib/supabase/client";
import {
  calculatePriceWithCustom,
  calculateFinalPrice,
  applyLastMinuteDiscount,
  applyLoyaltyDiscount,
} from "@/utils/pricing";
import Link from "next/link";
import TermsModal from "@/components/TermsModal";
import PayTermsConsentModal from "@/components/PayTermsConsentModal";
import ConektaPaymentForm, {
  type ConektaPaymentFormRef,
} from "@/components/ConektaPaymentForm";
import type { ReservationData } from "@/types/reservation";
import axios from "axios";
import { useAuth } from "@/hooks/useAuth";
import { isSessionType } from "@/utils/session-type";
import { ReservationSpaceUsage } from "@/components/ReservationSpaceUsage";
import { formatDisplayDate } from "@/utils/formatters";

// Schema de validación
const reservationFormSchema = z.object({
  name: z.string().min(2, "El nombre debe tener al menos 2 caracteres"),
  email: z.string().email("Email inválido"),
  phone: z.string().min(10, "El teléfono debe tener al menos 10 dígitos"),
  sessionType: z
    .string()
    .min(1, "Selecciona el tipo de sesión")
    .refine((v) => isSessionType(v), "Selecciona el tipo de sesión"),
  photographerStudio: z
    .string()
    .max(500, "Máximo 500 caracteres"),
});

type ReservationFormData = z.infer<typeof reservationFormSchema>;

// Helper para extraer mensaje de error de axios
/** Correo mínimo para validar cupón o referido en checkout (referido lo exige el servidor). */
function isCheckoutEmailReady(email: string | undefined): boolean {
  return z.string().email().safeParse((email || "").trim()).success;
}

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
  const [conektaError, setConektaError] = useState<string | null>(null);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPayConsentModal, setShowPayConsentModal] = useState(false);
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const paymentFormRef = useRef<ConektaPaymentFormRef>(null);
  /** Evita doble envío: segundo clic en Aceptar o en Pagar mientras corre handleSubmit/onSubmit */
  const paymentFlowLockRef = useRef(false);
  const { user } = useAuth();

  // Código único en checkout (cupón o referido; el servidor clasifica)
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscountCode, setAppliedDiscountCode] = useState<{
    code: string;
    percentage: number;
  } | null>(null);
  // Referido V2: monto FIJO descontado al invitado (no es porcentaje).
  // `referrerCreditAmount` es solo informativo (no afecta el precio que paga
  // el invitado), se usa para mostrar "gana $200 tu amigo" si se quiere.
  const [appliedReferralCode, setAppliedReferralCode] = useState<{
    code: string;
    inviteeDiscountAmount: number;
    referrerCreditAmount: number;
  } | null>(null);
  /** Correo con el que se validó el código (cupón o referido); si cambia, se invalida. */
  const [codeValidatedForEmail, setCodeValidatedForEmail] = useState<
    string | null
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
  const [reservationCount, setReservationCount] = useState(0);
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
    trigger,
    formState: { errors },
    watch,
    setValue,
  } = useForm<ReservationFormData>({
    resolver: zodResolver(reservationFormSchema),
    defaultValues: {
      sessionType: "",
      photographerStudio: "",
    },
  });

  // Obtener el email actual del formulario
  const currentEmail = watch("email");
  const checkoutEmailReady = isCheckoutEmailReady(currentEmail);

  const hasAppliedCheckoutCode =
    !!appliedDiscountCode || !!appliedReferralCode;

  // Si validó un código con correo y luego lo cambia o lo vacía, el preview
  // y el servidor ya no coincidirían con `/api/codes/validate`. Importante:
  // tratamos email vacío también como "ya no coincide" para evitar que el
  // badge "código aplicado" siga en la UI sin un correo válido detrás.
  useEffect(() => {
    if (!codeValidatedForEmail || !hasAppliedCheckoutCode) return;
    const e = (currentEmail || "").trim().toLowerCase();
    if (e !== codeValidatedForEmail) {
      setAppliedDiscountCode(null);
      setAppliedReferralCode(null);
      setCodeValidatedForEmail(null);
      setDiscountCode("");
      setCodeError(
        e
          ? "El correo cambió respecto al que usaste al aplicar el código. Vuelve a validarlo si aplica."
          : "Borraste el correo. Captúralo de nuevo y vuelve a aplicar el código si quieres usarlo.",
      );
    }
  }, [currentEmail, codeValidatedForEmail, hasAppliedCheckoutCode]);

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
            setValue(
              "email",
              String(profile.email).trim().toLowerCase(),
            );
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
          // Conectar fidelización, puntos y créditos desde el perfil
          if (typeof profile.loyaltyPoints === "number") {
            setAvailablePoints(profile.loyaltyPoints);
          }
          if (typeof profile.credits === "number") {
            setAvailableCredits(profile.credits);
          }
          const tierCount =
            typeof profile.loyaltyTierReservationCount === "number"
              ? profile.loyaltyTierReservationCount
              : typeof profile.confirmedReservationCount === "number"
                ? profile.confirmedReservationCount
                : undefined;
          if (typeof tierCount === "number") {
            setReservationCount(tierCount);
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
          useLoyaltyPoints: useLoyaltyPoints,
        });

        // Aplicar cupón o referido (mutuamente excluyentes; un solo campo en UI).
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

          // Puntos de lealtad (1 punto = $1 MXN; no superar el precio)
          if (useLoyaltyPoints > 0) {
            const pointsDiscount = Math.min(useLoyaltyPoints, newBasePrice);
            newBasePrice = Math.max(0, newBasePrice - pointsDiscount);
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
          // Referido V2: descuento FIJO (no %), topado al subtotal para
          // no permitir precios negativos. Mismo cálculo que pricing-server.
          const referralDiscount = Math.min(
            appliedReferralCode.inviteeDiscountAmount,
            calculation.finalPrice,
          );
          priceAfterCode = Math.max(
            0,
            calculation.finalPrice - referralDiscount,
          );

          discountsWithCode.referral = {
            amount: referralDiscount,
            applied: true,
          };
          delete discountsWithCode.discountCode;
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

  const clearAppliedCheckoutCode = () => {
    setAppliedDiscountCode(null);
    setAppliedReferralCode(null);
    setCodeValidatedForEmail(null);
    setDiscountCode("");
    setCodeError(null);
  };

  /** Un campo "Código": `/api/codes/validate` decide cupón vs referido. */
  const applyCheckoutCode = async (code: string) => {
    if (!code.trim()) {
      setCodeError("Ingresa un código");
      return;
    }

    const emailTrim = (currentEmail || "").trim().toLowerCase();
    if (!isCheckoutEmailReady(emailTrim)) {
      setCodeError(
        "Captura tu correo en el formulario antes de validar el código.",
      );
      return;
    }

    setValidatingCode(true);
    setCodeError(null);

    try {
      const response = await axios.post("/api/codes/validate", {
        code: code.trim(),
        email: emailTrim || undefined,
      });

      if (response.data?.success && response.data?.valid) {
        const code = String(response.data.code || "").toUpperCase();
        if (!code) {
          setCodeError("Respuesta inválida del servidor. Intenta de nuevo.");
          return;
        }

        if (response.data.type === "referral") {
          const inviteeAmount = Number(response.data.inviteeDiscountAmount);
          const referrerAmount = Number(response.data.referrerCreditAmount);
          if (!Number.isFinite(inviteeAmount) || inviteeAmount <= 0) {
            setCodeError("No se pudo leer el descuento. Intenta de nuevo.");
            return;
          }
          setAppliedReferralCode({
            code,
            inviteeDiscountAmount: inviteeAmount,
            referrerCreditAmount: Number.isFinite(referrerAmount)
              ? referrerAmount
              : 0,
          });
          setAppliedDiscountCode(null);
        } else {
          const pct = Number(response.data.discountPercentage);
          if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
            setCodeError(
              "No se pudo leer el descuento del código. Intenta de nuevo.",
            );
            return;
          }
          setAppliedDiscountCode({ code, percentage: pct });
          setAppliedReferralCode(null);
        }
        setCodeValidatedForEmail(emailTrim || null);
        setDiscountCode(code);
      } else {
        setCodeError(response.data?.error || "Código no válido");
      }
    } catch (error: unknown) {
      setCodeError(getErrorMessage(error));
    } finally {
      setValidatingCode(false);
    }
  };

  const discountCodeForRequest = appliedDiscountCode?.code ?? null;
  const referralCodeForRequest = appliedReferralCode?.code ?? null;

  const handlePayClick = async () => {
    if (loading || paymentFlowLockRef.current) return;
    const emailAtPay = (currentEmail || "").trim().toLowerCase();
    if (
      hasAppliedCheckoutCode &&
      codeValidatedForEmail &&
      emailAtPay !== codeValidatedForEmail
    ) {
      setError(
        "El correo no coincide con el que usaste al aplicar el código. Corrige el correo o valida de nuevo.",
      );
      return;
    }
    const ok = await trigger([
      "email",
      "name",
      "phone",
      "sessionType",
      "photographerStudio",
    ]);
    if (!ok) return;
    setShowPayConsentModal(true);
  };

  const handlePayConsentConfirm = () => {
    if (paymentFlowLockRef.current) return;
    paymentFlowLockRef.current = true;
    setShowPayConsentModal(false);
    void Promise.resolve(handleSubmit(onSubmit)()).finally(() => {
      paymentFlowLockRef.current = false;
    });
  };

  const onSubmit = async (data: ReservationFormData) => {
    if (!reservationData) {
      setError("No se encontraron los datos de la reserva");
      return;
    }

    setLoading(true);
    setError(null);
    setConektaError(null);

    const emailNorm = data.email.trim().toLowerCase();
    if (
      hasAppliedCheckoutCode &&
      codeValidatedForEmail &&
      emailNorm !== codeValidatedForEmail
    ) {
      setError(
        "El correo no coincide con el que usaste al aplicar el código. Corrige el correo o valida de nuevo.",
      );
      setLoading(false);
      return;
    }

    try {
      // Paso 1: Crear token de tarjeta con Conekta
      if (!paymentFormRef.current) {
        setError("Error: formulario de pago no disponible");
        setLoading(false);
        return;
      }

      const token = await paymentFormRef.current.createToken();
      if (!token) {
        // Errores de Conekta (token) los maneja onError → conektaError
        setLoading(false);
        return;
      }

      // Paso 2: Crear orden en Conekta (el servidor calcula el monto autoritativo
      // y, ANTES de cobrar, valida disponibilidad del slot y datos requeridos
      // para minimizar cobros que después haya que reembolsar).
      let orderId: string;
      try {
        const orderResponse = await axios.post("/api/conekta/create-order", {
          intent: "reservation",
          token,
          reservation: {
            date: reservationData.date,
            startTime: reservationData.time,
            contact: {
              name: data.name,
              email: emailNorm,
              phone: data.phone,
            },
            sessionType: data.sessionType,
            photographerStudio: data.photographerStudio.trim()
              ? data.photographerStudio.trim()
              : null,
            useLoyaltyDiscount: useLoyaltyDiscount,
            useLoyaltyPoints: useLoyaltyPoints || 0,
            useCredits: useCredits || 0,
            discountCode: discountCodeForRequest,
            referralCode: referralCodeForRequest,
          },
        });

        if (!orderResponse.data.success) {
          setConektaError(
            orderResponse.data.error || "Error al procesar el pago"
          );
          setLoading(false);
          return;
        }

        orderId = orderResponse.data.orderId;
      } catch (err: unknown) {
        const errorMessage = getErrorMessage(err);
        setConektaError(errorMessage);
        setLoading(false);
        return;
      }

      // Paso 3: Crear reserva en Supabase. El servidor reverifica el paymentId
      // contra Conekta y recalcula el precio antes de guardar (anti-fraude).
      let reservationId: number;
      try {
        const reservationResponse = await axios.post(
          "/api/reservations/create",
          {
            email: emailNorm,
            name: data.name,
            phone: data.phone,
            date: reservationData.date,
            startTime: reservationData.time,
            paymentId: orderId,
            sessionType: data.sessionType,
            photographerStudio: data.photographerStudio.trim()
              ? data.photographerStudio.trim()
              : null,
            // Beneficios solicitados (el servidor revalida saldos y vigencia)
            useLoyaltyDiscount: useLoyaltyDiscount,
            useLoyaltyPoints: useLoyaltyPoints || 0,
            useCredits: useCredits || 0,
            discountCode: discountCodeForRequest,
            referralCode: referralCodeForRequest,
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
          id: String(reservationId),
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
    <div className="min-h-screen bg-[#F6F6F7] py-6 sm:py-8 relative">
      {/* Overlay: loading o error de Conekta (token/create-order) */}
      {(loading || conektaError) && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-8 shadow-xl max-w-sm w-full mx-4">
            <div className="text-center">
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#103948] mx-auto mb-4"></div>
                  <p className="text-lg font-medium text-zinc-900 mb-2">
                    Procesando pago...
                  </p>
                  <p className="text-sm text-zinc-600">
                    Por favor espera, no cierres esta página
                  </p>
                </>
              ) : (
                <>
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                    <svg
                      className="h-6 w-6 text-red-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                      />
                    </svg>
                  </div>
                  <p className="text-lg font-medium text-zinc-900 mb-2">
                    Error en el pago
                  </p>
                  <p className="text-sm text-zinc-600 mb-5">{conektaError}</p>
                  <button
                    type="button"
                    onClick={() => setConektaError(null)}
                    className="w-full rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d38]"
                  >
                    Entendido
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
                        <div className="mt-3">
                          <ReservationSpaceUsage
                            startTime={reservationData.time}
                            calendarDate={reservationData.date}
                            variant="checkout"
                            compact
                          />
                        </div>
                      </div>
                    </div>

                    {/* Código de Descuento/Referido */}
                    <div className="mb-4 pb-4 border-b border-zinc-200">
                      <label className="block text-sm font-medium text-zinc-700 mb-2">
                        ¿Tienes un código?
                      </label>
                      <p className="mb-2 text-xs text-zinc-500">
                        Primero ingresa tu correo; los códigos de referido lo
                        requieren para validarse.
                      </p>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={discountCode}
                          onChange={(e) => setDiscountCode(e.target.value)}
                          placeholder="Cupón o código de referido"
                          disabled={validatingCode || hasAppliedCheckoutCode}
                          className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                        />
                        <button
                          type="button"
                          onClick={() => void applyCheckoutCode(discountCode)}
                          disabled={
                            validatingCode ||
                            !discountCode.trim() ||
                            hasAppliedCheckoutCode ||
                            !checkoutEmailReady
                          }
                          className="px-4 py-2 text-sm font-medium text-[#103948] border border-[#103948] rounded hover:bg-[#103948] hover:text-white transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {validatingCode
                            ? "Validando..."
                            : hasAppliedCheckoutCode
                            ? "Aplicado"
                            : "Aplicar"}
                        </button>
                      </div>
                      {codeError && (
                        <p className="mt-2 text-sm text-red-600">{codeError}</p>
                      )}
                      {hasAppliedCheckoutCode && (
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
                              {appliedReferralCode ? (
                                <>
                                  Código {appliedReferralCode.code} aplicado: $
                                  {appliedReferralCode.inviteeDiscountAmount.toLocaleString(
                                    "es-MX",
                                  )}{" "}
                                  de descuento en tu primera reserva
                                </>
                              ) : appliedDiscountCode ? (
                                <>
                                  Cupón {appliedDiscountCode.code} aplicado (
                                  {appliedDiscountCode.percentage}% de descuento)
                                </>
                              ) : null}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={clearAppliedCheckoutCode}
                            className="flex-shrink-0 px-1 py-0.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                            aria-label="Quitar código"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>

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
                            className="h-5 w-5 rounded border-2 border-zinc-300 accent-[#103948] text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                        </label>
                      </div>

                      {/* Monedas Chuy */}
                      <div className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              Monedas Chuy
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
                              {availablePoints} disponible{availablePoints === 1 ? "" : "s"}
                            </span>
                            {useLoyaltyPoints > 0 && (
                              <span className="text-xs font-medium text-green-600">
                                • Usando {useLoyaltyPoints}
                              </span>
                            )}
                          </div>
                          {availablePoints <= 0 && (
                            <p className="text-xs text-zinc-500 mt-0.5">
                              Gana 1 Moneda Chuy por cada $10 gastados
                            </p>
                          )}
                        </div>
                        <label className="flex items-center">
                          <input
                            type="checkbox"
                            checked={useLoyaltyPoints > 0}
                            disabled={availablePoints <= 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setUseLoyaltyPoints(availablePoints);
                              } else {
                                setUseLoyaltyPoints(0);
                              }
                            }}
                            className="h-5 w-5 rounded border-2 border-zinc-300 accent-[#103948] text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                          />
                        </label>
                      </div>

                      {/* Créditos */}
                      <div className="flex items-center justify-between py-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-900">
                              Créditos
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
                            className="h-5 w-5 rounded border-2 border-zinc-300 accent-[#103948] text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
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
                                Monedas Chuy aplicadas (
                                {
                                  priceCalculation.discounts.loyaltyPoints
                                    .points
                                }
                                )
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
                              <span>
                                Créditos aplicados (
                                {Math.round(useCredits).toLocaleString("es-MX")}
                                )
                              </span>
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

                    {!user && (
                      <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                        <svg
                          className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500"
                          fill="none"
                          viewBox="0 0 24 24"
                          strokeWidth="2"
                          stroke="currentColor"
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                          />
                        </svg>
                        <span>
                          <Link
                            href="/auth/login"
                            className="text-[#103948] hover:underline"
                          >
                            Inicia sesión
                          </Link>{" "}
                          para disfrutar de descuentos, Monedas Chuy y
                          créditos.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <form
              onSubmit={(e) => e.preventDefault()}
              className="space-y-4"
            >
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
                      onError={(msg) => {
                        if (msg !== "Por favor corrige los errores en el formulario de pago") {
                          setConektaError(msg);
                        }
                      }}
                      disabled={loading}
                    />
                  </div>
                </div>
              </div>

              {/* Sección: Datos de contacto */}
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-4">
                  Datos de contacto
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

              {/* Sección: Tu sesión (después de datos de contacto: primero quién eres, luego qué sesión es) */}
              <div className="bg-white rounded-lg border border-zinc-200 p-6">
                <h2 className="text-lg font-semibold text-zinc-900 mb-1">
                  Tu sesión
                </h2>
                <p className="text-sm text-zinc-500 mb-4">
                  Indica el tipo de sesión. Si ya sabes quién te acompaña como
                  fotógrafo o estudio, puedes anotarlo; si no, déjalo en blanco.
                </p>
                <div className="mb-4">
                  <label
                    htmlFor="sessionType"
                    className="mb-2 block text-sm font-medium text-zinc-700"
                  >
                    Tipo de sesión <span className="text-red-600">*</span>
                  </label>
                  <select
                    id="sessionType"
                    {...register("sessionType")}
                    className="w-full rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                  >
                    <option value="">Selecciona una opción</option>
                    <option value="xv_anos">XV años</option>
                    <option value="boda">Boda</option>
                    <option value="casual">Casual</option>
                  </select>
                  {errors.sessionType && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.sessionType.message}
                    </p>
                  )}
                </div>
                <div>
                  <label
                    htmlFor="photographerStudio"
                    className="mb-2 block text-sm font-medium text-zinc-700"
                  >
                    Nombre del fotógrafo / estudio (opcional)
                  </label>
                  <input
                    id="photographerStudio"
                    type="text"
                    maxLength={500}
                    {...register("photographerStudio")}
                    className="w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948]"
                    placeholder="Ej. Estudio Luz o nombre del fotógrafo"
                  />
                  {errors.photographerStudio && (
                    <p className="mt-1 text-sm text-red-600">
                      {errors.photographerStudio.message}
                    </p>
                  )}
                </div>
              </div>

              <p className="text-center text-sm text-zinc-600 px-1">
                Al pulsar &quot;Pagar ahora&quot; podrás leer los términos y
                condiciones y aceptarlos antes del cobro.{" "}
                <button
                  type="button"
                  onClick={() => setShowTermsModal(true)}
                  className="text-[#103948] font-medium hover:underline"
                >
                  Ver términos completos
                </button>
              </p>

              {/* Error general (no Conekta: reserva, formulario, etc.) */}
              {error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-red-800 text-sm">
                  {error}
                </div>
              )}

              {/* Botón de pago */}
              <button
                type="button"
                onClick={() => void handlePayClick()}
                disabled={loading}
                className="w-full rounded-lg bg-[#103948] px-6 py-3 font-semibold text-white transition-colors hover:bg-[#0d2d3a] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pagar ahora
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
                  <div className="mt-3">
                    <ReservationSpaceUsage
                      startTime={reservationData.time}
                      calendarDate={reservationData.date}
                      variant="checkout"
                    />
                  </div>
                </div>
              </div>

              {/* Código de Descuento/Referido */}
              <div className="mb-4 pb-4 border-b border-zinc-200">
                <label className="block text-sm font-medium text-zinc-700 mb-2">
                  ¿Tienes un código?
                </label>
                <p className="mb-2 text-xs text-zinc-500">
                  Primero ingresa tu correo; los códigos de referido lo requieren
                  para validarse.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={discountCode}
                    onChange={(e) => setDiscountCode(e.target.value)}
                    placeholder="Cupón o código de referido"
                    disabled={validatingCode || hasAppliedCheckoutCode}
                    className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-[#103948] focus:outline-none focus:ring-1 focus:ring-[#103948] disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                  />
                  <button
                    type="button"
                    onClick={() => void applyCheckoutCode(discountCode)}
                    disabled={
                      validatingCode ||
                      !discountCode.trim() ||
                      hasAppliedCheckoutCode ||
                      !checkoutEmailReady
                    }
                    className="px-4 py-2 text-sm font-medium text-[#103948] border border-[#103948] rounded hover:bg-[#103948] hover:text-white transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {validatingCode
                      ? "Validando..."
                      : hasAppliedCheckoutCode
                      ? "Aplicado"
                      : "Aplicar"}
                  </button>
                </div>
                {codeError && (
                  <p className="mt-2 text-sm text-red-600">{codeError}</p>
                )}
                {hasAppliedCheckoutCode && (
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
                        {appliedReferralCode ? (
                          <>
                            Código {appliedReferralCode.code} aplicado: $
                            {appliedReferralCode.inviteeDiscountAmount.toLocaleString(
                              "es-MX",
                            )}{" "}
                            de descuento en tu primera reserva
                          </>
                        ) : appliedDiscountCode ? (
                          <>
                            Cupón {appliedDiscountCode.code} aplicado (
                            {appliedDiscountCode.percentage}% de descuento)
                          </>
                        ) : null}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={clearAppliedCheckoutCode}
                      className="flex-shrink-0 px-1 py-0.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                      aria-label="Quitar código"
                    >
                      ✕
                    </button>
                  </div>
                )}
              </div>

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
                      className="h-5 w-5 rounded border-2 border-zinc-300 accent-[#103948] text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                    />
                  </label>
                </div>

                {/* Monedas Chuy */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        Monedas Chuy
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
                        {availablePoints} disponible{availablePoints === 1 ? "" : "s"}
                      </span>
                      {useLoyaltyPoints > 0 && (
                        <span className="text-xs font-medium text-green-600">
                          • Usando {useLoyaltyPoints}
                        </span>
                      )}
                    </div>
                    {availablePoints <= 0 && (
                      <p className="text-xs text-zinc-500 mt-0.5">
                        Gana 1 Moneda Chuy por cada $10 gastados
                      </p>
                    )}
                  </div>
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={useLoyaltyPoints > 0}
                      disabled={availablePoints <= 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setUseLoyaltyPoints(availablePoints);
                        } else {
                          setUseLoyaltyPoints(0);
                        }
                      }}
                      className="h-5 w-5 rounded border-2 border-zinc-300 accent-[#103948] text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
                    />
                  </label>
                </div>

                {/* Créditos */}
                <div className="flex items-center justify-between py-2">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        Créditos
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
                      className="h-5 w-5 rounded border-2 border-zinc-300 accent-[#103948] text-[#103948] focus:ring-2 focus:ring-[#103948] focus:ring-offset-0 transition-colors disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-zinc-100"
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
                          Monedas Chuy aplicadas (
                          {priceCalculation.discounts.loyaltyPoints.points})
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
                        <span>
                          Créditos aplicados (
                          {Math.round(useCredits).toLocaleString("es-MX")})
                        </span>
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

              {!user && (
                <div className="mt-3 pt-2 border-t border-zinc-100 flex items-center justify-center gap-1.5 text-xs text-zinc-500">
                  <svg
                    className="w-3.5 h-3.5 flex-shrink-0 text-zinc-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth="2"
                    stroke="currentColor"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                    />
                  </svg>
                  <span>
                    <Link
                      href="/auth/login"
                      className="text-[#103948] hover:underline"
                    >
                      Inicia sesión
                    </Link>{" "}
                    para disfrutar de descuentos, Monedas Chuy y créditos.
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <TermsModal
        isOpen={showTermsModal}
        onClose={() => setShowTermsModal(false)}
      />
      {showPayConsentModal && (
        <PayTermsConsentModal
          isOpen={showPayConsentModal}
          onCancel={() => setShowPayConsentModal(false)}
          onConfirm={handlePayConsentConfirm}
        />
      )}
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
