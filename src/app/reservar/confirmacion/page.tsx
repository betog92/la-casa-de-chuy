"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import {
  formatDisplayDate,
  formatTimeRange,
  formatCurrency,
  formatReservationId,
} from "@/utils/formatters";
import type { Reservation } from "@/types/reservation";
import axios from "axios";

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
  const displayGuestUrl = guestReservationUrl ?? "";
  const isGuest =
    !user && (guestReservationUrl || guestTokenFromParams) && hasAccount === false;
  const showNormalAccountBlock = user || !!hasAccount;
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
            {rescheduled === "true"
              ? "¡Reserva Reagendada!"
              : "¡Reserva Confirmada!"}
          </h1>
          <p className="text-zinc-600">
            {rescheduled === "true"
              ? paid === "true"
                ? "Tu reserva ha sido reagendada exitosamente. Se ha procesado el pago adicional."
                : "Tu reserva ha sido reagendada exitosamente."
              : "Tu reserva ha sido procesada exitosamente"}
          </p>
        </div>

        {/* Banner de puntos: usuario logueado o reserva creada como usuario (email ya registrado) */}
        {(user || hasAccount) && rescheduled !== "true" && (
          <div className="mt-3 mb-4 inline-flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800 border border-green-200">
            <span className="font-semibold">🎉 ¡Felicidades!</span>
            <span>Ganaste {pointsEarned} puntos de lealtad.</span>
            {loyaltyLevelChanged && displayLoyaltyLevel && (
              <>
                <span className="font-semibold">¡Subiste de nivel!</span>
                <span className="font-semibold">
                  Ahora eres: {displayLoyaltyLevel}
                </span>
              </>
            )}
          </div>
        )}

        {/* Detalles de la Reserva */}
        <div className="mb-6 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-zinc-900">
            Detalles de tu Reserva
          </h2>
          <div className="space-y-4 text-zinc-700">
            <div className="flex justify-between">
              <span className="font-medium">Reserva ID:</span>
              <span className="font-mono text-sm text-zinc-600">
                {formatReservationId(reservation.id)}
              </span>
            </div>
            {/* Nombre, email y teléfono solo para invitados (usuarios con cuenta ya los conocen) */}
            {rescheduled !== "true" && isGuest && (
              <>
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
              </>
            )}
            <div className="border-t border-zinc-200 pt-4">
              <div className="mb-3 flex justify-between">
                <span className="font-medium">Fecha:</span>
                <span>{formatDisplayDate(reservation.date)}</span>
              </div>
              <div className="mb-3 flex justify-between">
                <span className="font-medium">Hora:</span>
                <span>{formatTimeRange(reservation.start_time)}</span>
              </div>
              {(() => {
                // Este reagendo generó pago/pendiente: mostrar "Pago adicional"
                if (rescheduled === "true" && additionalAmountThisReschedule > 0) {
                  return (
                    <div className="flex justify-between border-t border-zinc-200 pt-3">
                      <span className="font-semibold text-lg">
                        Pago Adicional:
                      </span>
                      <span className="font-semibold text-lg">
                        ${formatCurrency(additionalAmountThisReschedule)} MXN
                      </span>
                    </div>
                  );
                }

                // Este reagendo no generó pago pero hay deuda anterior: no mostrar aquí (va en callout abajo)
                if (hasPendingFromBefore) return null;

                // Si no es reagendado, mostrar total pagado
                if (rescheduled !== "true") {
                  return (
                    <div className="flex justify-between border-t border-zinc-200 pt-3">
                      <span className="font-semibold text-lg">
                        Total Pagado:
                      </span>
                      <span className="font-semibold text-lg">
                        ${formatCurrency(reservation.price)} MXN
                      </span>
                    </div>
                  );
                }

                // Reagendado sin pago adicional ni pendiente anterior: no mostrar bloque de pago
                return null;
              })()}
            </div>
            {(() => {
              // Reagendado con pago adicional (de este movimiento): mostrar ID de pago adicional si existe
              if (
                rescheduled === "true" &&
                additionalAmountThisReschedule > 0 &&
                additionalPaymentId
              ) {
                return (
                  <div className="border-t border-zinc-200 pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">
                        ID de Pago Adicional:
                      </span>
                      <span className="font-mono text-zinc-600">
                        {additionalPaymentId}
                      </span>
                    </div>
                  </div>
                );
              }

              // Reserva normal: mostrar ID de pago original si existe
              if (rescheduled !== "true" && reservation.payment_id) {
                return (
                  <div className="border-t border-zinc-200 pt-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-zinc-500">ID de Pago:</span>
                      <span className="font-mono text-zinc-600">
                        {reservation.payment_id}
                      </span>
                    </div>
                  </div>
                );
              }

              // Reagendado sin pago adicional: no mostrar ID de pago
              return null;
            })()}
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

        {/* Magic Link para Invitados - Solo en nueva reserva (no en reagendamiento; ahí ya tienen el enlace del correo) */}
        {isGuest && !guestTokenFromParams && (
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
              Guarda este enlace para gestionar tu reserva (cancelar, reagendar,
              etc.):
            </p>
            <div className="flex items-center gap-2 p-3 bg-white rounded border border-green-200">
              <input
                type="text"
                readOnly
                value={displayGuestUrl}
                className="flex-1 text-sm text-zinc-700 bg-transparent border-none outline-none"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <button
                onClick={() => {
                  if (displayGuestUrl) {
                    navigator.clipboard.writeText(displayGuestUrl);
                    alert("Enlace copiado al portapapeles");
                  }
                }}
                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition-colors"
              >
                Copiar
              </button>
            </div>
            <Link
              href={guestReservationLink ?? "#"}
              className="mt-3 inline-block text-sm text-green-700 hover:text-green-900 font-medium underline"
            >
              Abrir página de gestión →
            </Link>
          </div>
        )}

        {/* Invitación a crear cuenta (solo para invitados en nueva reserva, no en reagendamiento) */}
        {isGuest && !guestTokenFromParams && reservation && (
          <div className="mb-6 rounded-lg border border-[#103948] bg-[#103948]/5 p-6">
            <h3 className="mb-2 text-lg font-semibold text-[#103948]">
              ¿Quieres acceder a más beneficios?
            </h3>
            <p className="mb-4 text-sm text-zinc-700">
              Crea una cuenta para acceder a descuentos por fidelización, puntos
              de lealtad, créditos y más.
            </p>
            <Link
              href={`/auth/register?email=${encodeURIComponent(
                reservation.email
              )}`}
              className="inline-block bg-[#103948] text-white py-2 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
            >
              Crear cuenta
            </Link>
          </div>
        )}

        {/* Para usuarios autenticados o invitados cuyo email ya tiene cuenta: mostrar enlace a su cuenta */}
        {showNormalAccountBlock && (
          <div className="mb-6 rounded-lg border border-[#103948] bg-[#103948]/5 p-6">
            <h3 className="mb-2 text-lg font-semibold text-[#103948]">
              ¡Reserva agregada a tu cuenta!
            </h3>
            <p className="mb-4 text-sm text-zinc-700">
              Puedes ver y gestionar todas tus reservas desde tu cuenta.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href={`/reservaciones/${reservation.id}`}
                className="inline-block bg-[#103948] text-white py-2 px-6 rounded-lg font-medium hover:bg-[#0d2d38] transition-colors"
              >
                Gestionar mi reserva
              </Link>
            </div>
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
            {rescheduled !== "true" && (
              <li className="flex items-start">
                <span className="mr-2">•</span>
                <span>
                  Puedes reagendar sin costo con mínimo 5 días hábiles de
                  anticipación.
                </span>
              </li>
            )}
          </ul>
        </div>

        {/* Botón de Acción: invitado → Ver/Volver a mi reserva; con cuenta → Ver mis reservas */}
        <div className="flex flex-col gap-4 sm:flex-row">
          {isGuest && guestReservationLink ? (
            <Link
              href={guestReservationLink}
              className="flex-1 rounded-lg bg-[#103948] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-[#0d2d38]"
            >
              {guestTokenFromParams ? "Volver a mi reserva" : "Ver mi reserva"}
            </Link>
          ) : (
            <Link
              href="/account"
              className="flex-1 rounded-lg border border-zinc-300 bg-white px-6 py-3 text-center font-semibold text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Ver mis reservas
            </Link>
          )}
        </div>
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
