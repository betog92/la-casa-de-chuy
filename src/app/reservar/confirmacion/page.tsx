"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  formatDisplayDate,
  formatCurrency,
  formatReservationId,
} from "@/utils/formatters";
import { ReservationSpaceUsage } from "@/components/ReservationSpaceUsage";
import type { Reservation } from "@/types/reservation";
import axios from "axios";
import { buildRegisterHref } from "@/utils/register-url";
import { AccountReservationNextStep } from "@/components/reservar/AccountReservationNextStep";
import { GuestReservationNextStep } from "@/components/reservar/GuestReservationNextStep";
import { LoyaltyCongratulationsBanner } from "@/components/reservar/LoyaltyCongratulationsBanner";

function ConfirmacionContent() {
  const searchParams = useSearchParams();
  const reservationId = searchParams.get("id");
  const rescheduled = searchParams.get("rescheduled");
  const paid = searchParams.get("paid");
  const additionalAmountParam = searchParams.get("additionalAmount");
  const loyaltyLevelChanged =
    searchParams.get("loyaltyLevelChanged") === "true";
  const newLoyaltyLevelFromParams = searchParams.get("newLoyaltyLevel");
  const guestTokenFromParams = searchParams.get("token");
  const { user, loading: authLoading } = useAuth();
  const [reservation, setReservation] = useState<Reservation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [guestReservationUrl, setGuestReservationUrl] = useState<string | null>(
    null
  );
  const [hasAccount, setHasAccount] = useState<boolean | null>(null);
  const [loyaltyLevelName, setLoyaltyLevelName] = useState<string | null>(null);

  useEffect(() => {
    const loadReservation = async () => {
      if (!reservationId) {
        setError("No se proporcionó un ID de reserva");
        setLoading(false);
        return;
      }

      // Verificar si es invitado: sessionStorage (nueva reserva) o token en URL (reagendamiento + pago)
      if (!user) {
        const savedGuestUrl = sessionStorage.getItem("guestReservationUrl");
        if (savedGuestUrl) {
          setGuestReservationUrl(savedGuestUrl);
          sessionStorage.removeItem("guestReservationUrl");
          sessionStorage.removeItem("guestToken");
        } else if (guestTokenFromParams && typeof window !== "undefined") {
          setGuestReservationUrl(
            `${window.location.origin}/reservas/${guestTokenFromParams}`
          );
        }
      }

      // Limpiar reservationData si existe (datos temporales de selección de fecha/hora)
      sessionStorage.removeItem("reservationData");

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
        setHasAccount(
          typeof result.hasAccount === "boolean" ? result.hasAccount : null
        );
      } catch (err) {
        console.error("Error loading reservation:", err);
        setError("Ocurrió un error al cargar la reserva");
      } finally {
        setLoading(false);
      }
    };

    // Esperar a que se cargue el estado de autenticación
    if (!authLoading) {
      loadReservation();
    }
  }, [reservationId, user, authLoading, guestTokenFromParams]);

  // Scroll al top cuando la página se monta o cambia el reservationId
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [reservationId]);

  // Cargar nivel de fidelización para usuarios logueados
  useEffect(() => {
    const loadLoyalty = async () => {
      if (!user) return;
      try {
        const res = await axios.get("/api/users/profile");
        if (res.data?.success) {
          setLoyaltyLevelName(res.data.loyaltyLevelName || null);
        }
      } catch (err) {
        console.error("Error loading loyalty level:", err);
      }
    };
    loadLoyalty();
  }, [user]);

  // Invitado: por sessionStorage (nueva reserva) o por token en URL (reagendamiento + pago)
  const guestReservationLink =
    guestReservationUrl ??
    (guestTokenFromParams ? `/reservas/${guestTokenFromParams}` : null);
  const isGuest =
    !user && (guestReservationUrl || guestTokenFromParams) && hasAccount === false;
  const urlToCopy =
    guestReservationUrl ??
    (typeof window !== "undefined" && guestReservationLink
      ? `${window.location.origin}${guestReservationLink}`
      : "");
  const showGuestNextStep =
    isGuest && !guestTokenFromParams && Boolean(guestReservationLink);
  const showAccountNextStep = user || hasAccount === true;
  const isReschedule = rescheduled === "true";
  // Solo invitado sin cuenta en reagendo con token; si hasAccount/user, el módulo de cuenta basta
  const showBottomFooter = Boolean(
    guestTokenFromParams &&
      guestReservationLink &&
      !user &&
      hasAccount !== true,
  );
  const pointsEarned = Math.floor(Number(reservation?.price || 0) / 10);

  // Usar el nivel de los query params si está disponible, sino usar el cargado desde la API
  const displayLoyaltyLevel = newLoyaltyLevelFromParams || loyaltyLevelName;

  // Monto adicional de ESTE reagendo (solo desde URL); si viene en URL, este reagendo generó pago/pendiente
  const rawFromParam = additionalAmountParam
    ? parseFloat(additionalAmountParam)
    : NaN;
  const additionalAmountThisReschedule =
    Number.isFinite(rawFromParam) &&
    rawFromParam > 0 &&
    rawFromParam <= 1_000_000
      ? rawFromParam
      : 0;
  // Deuda pendiente anterior (reserva tiene additional_payment_amount pero este reagendo no añadió pago)
  const reservationAdditional = Number(
    (
      reservation as Reservation & {
        additional_payment_amount?: number | null;
        additional_payment_method?: string | null;
      }
    )?.additional_payment_amount ?? 0
  );
  const additionalPaymentMethod = (
    reservation as Reservation & { additional_payment_method?: string | null }
  )?.additional_payment_method;
  const hasPendingFromBefore =
    rescheduled === "true" &&
    additionalAmountThisReschedule === 0 &&
    reservationAdditional > 0 &&
    additionalPaymentMethod === "pendiente";
  const additionalPaymentId = (
    reservation as Reservation & {
      additional_payment_id?: string | null;
    }
  )?.additional_payment_id;

  if (loading || authLoading) {
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

  const showAdditionalPayment =
    rescheduled === "true" && additionalAmountThisReschedule > 0;
  const showTotalPaid = rescheduled !== "true" && !hasPendingFromBefore;
  const showPaymentId =
    rescheduled !== "true" && Boolean(reservation.payment_id);
  const showAdditionalPaymentId =
    showAdditionalPayment && Boolean(additionalPaymentId);
  const showPaymentFooter =
    showAdditionalPayment ||
    showTotalPaid ||
    showPaymentId ||
    showAdditionalPaymentId;

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
          <h1 className="mb-2 text-3xl font-bold text-[#103948] sm:text-4xl">
            {rescheduled === "true"
              ? "¡Reserva Reagendada!"
              : "¡Reserva Confirmada!"}
          </h1>
          <p className="text-zinc-700">
            {rescheduled === "true"
              ? paid === "true"
                ? "Tu reserva ha sido reagendada exitosamente. Se ha procesado el pago adicional."
                : "Tu reserva ha sido reagendada exitosamente."
              : "Tu reserva ha sido procesada exitosamente"}
          </p>
        </div>

        {/* Monedas / nivel: solo con sesión (las monedas se acreditan con user_id) */}
        {user && rescheduled !== "true" && (
          <LoyaltyCongratulationsBanner
            pointsEarned={pointsEarned}
            levelChanged={loyaltyLevelChanged}
            newLevelName={
              loyaltyLevelChanged ? displayLoyaltyLevel : null
            }
          />
        )}

        {/* Detalles de la Reserva */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-[#103948]">
            Detalles de tu Reserva
          </h2>
          <div className="divide-y divide-zinc-100">
            <div className="space-y-4 pb-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-600">Reserva ID:</span>
                <span className="font-mono text-zinc-700">
                  {formatReservationId(reservation.id)}
                </span>
              </div>
              {/* Nombre, email y teléfono solo para invitados (usuarios con cuenta ya los conocen) */}
              {rescheduled !== "true" && isGuest && (
                <>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium text-zinc-600">Nombre:</span>
                    <span className="text-right text-zinc-800">
                      {reservation.name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium text-zinc-600">Email:</span>
                    <span className="text-right text-zinc-800">
                      {reservation.email}
                    </span>
                  </div>
                  <div className="flex justify-between gap-3 text-sm">
                    <span className="font-medium text-zinc-600">Teléfono:</span>
                    <span className="text-right text-zinc-800">
                      {reservation.phone}
                    </span>
                  </div>
                </>
              )}
              {reservation.photographer_studio ? (
                <div className="flex justify-between gap-4 text-sm">
                  <span className="shrink-0 font-medium text-zinc-600">
                    Fotógrafo / estudio:
                  </span>
                  <span className="text-right text-zinc-800">
                    {reservation.photographer_studio}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="space-y-3 py-4">
              <div className="flex justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-600">Fecha:</span>
                <span className="text-right text-zinc-800">
                  {formatDisplayDate(reservation.date)}
                </span>
              </div>
              <ReservationSpaceUsage
                startTime={reservation.start_time}
                calendarDate={reservation.date}
                variant="confirm"
              />
            </div>

            {showPaymentFooter && (
              <div className="pt-4">
                <div className="rounded-lg bg-zinc-50/90 px-4 py-3.5 ring-1 ring-inset ring-zinc-100">
                  {showAdditionalPayment && (
                    <div className="flex justify-between gap-3">
                      <span className="text-base font-semibold text-zinc-800">
                        Pago adicional:
                      </span>
                      <span className="text-base font-semibold tabular-nums text-[#103948]">
                        ${formatCurrency(additionalAmountThisReschedule)} MXN
                      </span>
                    </div>
                  )}
                  {showTotalPaid && (
                    <div className="flex justify-between gap-3">
                      <span className="text-base font-semibold text-zinc-800">
                        Total pagado:
                      </span>
                      <span className="text-base font-semibold tabular-nums text-[#103948]">
                        ${formatCurrency(reservation.price)} MXN
                      </span>
                    </div>
                  )}
                  {showAdditionalPaymentId && (
                    <div className="mt-2 flex justify-between gap-3 text-sm">
                      <span className="text-zinc-500">ID de pago:</span>
                      <span className="max-w-[58%] shrink-0 break-all text-right font-mono text-zinc-500">
                        {additionalPaymentId}
                      </span>
                    </div>
                  )}
                  {showPaymentId && (
                    <div className="mt-2 flex justify-between gap-3 text-sm">
                      <span className="text-zinc-500">ID de pago:</span>
                      <span className="max-w-[58%] shrink-0 break-all text-right font-mono text-zinc-500">
                        {reservation.payment_id}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Recordatorio: pago pendiente por reagendamiento anterior (fuera de detalles, solo informativo) */}
        {hasPendingFromBefore && (
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <svg
                  className="h-4 w-4 text-amber-700"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-amber-900">
                  Recordatorio
                </h3>
                <p className="mt-1 text-sm text-amber-800">
                  Tienes un pago pendiente de{" "}
                  <span className="font-medium">
                    ${formatCurrency(reservationAdditional)} MXN
                  </span>{" "}
                  por un reagendamiento anterior. No corresponde a este cambio de
                  fecha.
                </p>
              </div>
            </div>
          </div>
        )}

        {showGuestNextStep && guestReservationLink && (
          <GuestReservationNextStep
            manageHref={guestReservationLink}
            urlToCopy={urlToCopy}
            guestEmail={reservation.email}
          />
        )}

        {showAccountNextStep && (
          <AccountReservationNextStep
            reservationId={reservation.id}
            variant={isReschedule ? "reschedule" : "new"}
            requiresLogin={!user}
          />
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
            {rescheduled !== "true" && !showGuestNextStep && (
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>
                  Puedes reagendar sin costo desde el enlace de tu reserva, con
                  mínimo 5 días hábiles de anticipación.
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Invitación a crear cuenta (solo para invitados en nueva reserva, no en reagendamiento) */}
        {isGuest && !guestTokenFromParams && reservation && (
          <div className="mb-6 rounded-lg border border-[#103948] bg-[#103948]/5 p-6">
            <h3 className="mb-2 text-lg font-semibold text-[#103948]">
              ¿Quieres acceder a más beneficios?
            </h3>
            <p className="mb-4 text-sm text-zinc-700">
              Crea una cuenta para acceder a descuentos por fidelización,
              Monedas Chuy, créditos y más.
            </p>
            <Link
              href={buildRegisterHref({
                email: reservation.email,
                name: reservation.name,
                phone: reservation.phone,
              })}
              className="inline-block bg-[#103948] text-white py-2 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        )}

        {showBottomFooter && guestReservationLink && (
          <Link
            href={guestReservationLink}
            className="flex w-full items-center justify-center rounded-lg bg-[#103948] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-[#0d2d38]"
          >
            Volver a mi reserva
          </Link>
        )}
      </div>
    </div>
  );
}

export default function ConfirmacionPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-zinc-50 to-white">
          <div className="text-center">
            <p className="text-zinc-600">Cargando información de tu reserva...</p>
          </div>
        </div>
      }
    >
      <ConfirmacionContent />
    </Suspense>
  );
}
