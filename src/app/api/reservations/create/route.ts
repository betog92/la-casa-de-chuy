import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  calculateEndTime,
  validateSlotAvailability,
  formatTimeToSeconds,
} from "@/utils/reservation-helpers";
import { validateReservationFields } from "@/utils/validation";
import {
  successResponse,
  errorResponse,
  validationErrorResponse,
  conflictResponse,
} from "@/utils/api-response";
import {
  generateGuestToken,
  generateGuestReservationUrl,
} from "@/lib/auth/guest-tokens";
import { sendReservationConfirmation } from "@/lib/email";
import { calculateLoyaltyLevel } from "@/utils/loyalty";
import type { Database } from "@/types/database.types";

export async function POST(request: NextRequest) {
  try {
    // Obtener el usuario autenticado desde las cookies (si existe)
    // Importante: Ignoramos cualquier userId del body por seguridad
    let authenticatedUserId: string | null = null;
    try {
      const cookieStore = await cookies();
      const authClient = createServerClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return cookieStore.getAll();
            },
            setAll() {
              // No necesitamos establecer cookies aquí
            },
          },
        }
      );

      const {
        data: { user },
      } = await authClient.auth.getUser();

      // Si hay usuario autenticado, usar su ID
      if (user?.id) {
        authenticatedUserId = user.id;
      }
    } catch {
      // Si hay error al obtener el usuario, es una reserva de invitado
      // No es un error crítico, solo significa que no hay sesión activa
      authenticatedUserId = null;
    }

    const supabase = createServiceRoleClient();
    const body = await request.json();

    // Validar campos
    const validation = validateReservationFields(body);
    if (!validation.isValid) {
      return validationErrorResponse(validation.error!);
    }

    const {
      email,
      name,
      phone,
      date,
      startTime,
      price,
      originalPrice,
      paymentId,
      discountAmount,
      lastMinuteDiscount,
      creditsUsed,
      referralDiscount,
      discountCode,
      discountCodeDiscount,
    } = body;

    const normalizedEmail = (email || "").toLowerCase().trim();

    // Usar el userId autenticado; si no hay sesión pero el email tiene cuenta, crear como usuario igual
    let userId: string | null = authenticatedUserId;
    if (!userId && normalizedEmail) {
      const { data: userByEmail } = await supabase
        .from("users")
        .select("id")
        .eq("email", normalizedEmail)
        .limit(1)
        .maybeSingle();
      if (userByEmail && (userByEmail as { id: string }).id) {
        userId = (userByEmail as { id: string }).id;
      }
    }

    // Invitados (sin userId) no pueden usar beneficios de fidelización
    let loyaltyDiscount = 0;
    let loyaltyPointsUsed = 0;
    if (userId) {
      loyaltyDiscount = Number(body.loyaltyDiscount) || 0;
      loyaltyPointsUsed = Number(body.loyaltyPointsUsed) || 0;
    }

    // Validar disponibilidad
    const isAvailable = await validateSlotAvailability(
      supabase,
      date,
      startTime
    );
    if (!isAvailable) {
      return conflictResponse(
        "El horario seleccionado ya no está disponible. Por favor selecciona otro horario."
      );
    }

    // Calcular nivel de fidelización anterior (antes de insertar la nueva reserva)
    let newLoyaltyLevel: string | null = null;
    let loyaltyLevelChanged = false;

    if (userId) {
      try {
        const { count: previousCount } = await supabase
          .from("reservations")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("status", "confirmed");

        const previousCountNum = previousCount || 0;
        const previousLoyaltyLevel = calculateLoyaltyLevel(previousCountNum);

        // El nivel nuevo será con una reserva más
        const newCount = previousCountNum + 1;
        newLoyaltyLevel = calculateLoyaltyLevel(newCount);

        loyaltyLevelChanged = previousLoyaltyLevel !== newLoyaltyLevel;
      } catch (levelError) {
        // No fallar la reserva si hay error al calcular el nivel
        console.error("Error calculating loyalty level:", levelError);
      }
    }

    // Crear reserva
    const endTime = calculateEndTime(startTime);
    const reservationData = {
      email: normalizedEmail,
      name,
      phone,
      date,
      start_time: formatTimeToSeconds(startTime),
      end_time: endTime,
      price,
      original_price: originalPrice,
      payment_id: paymentId,
      status: "confirmed" as const,
      user_id: userId || null,
      discount_amount: discountAmount || 0,
      // Campos específicos de descuentos
      last_minute_discount: lastMinuteDiscount || 0,
      loyalty_discount: loyaltyDiscount || 0,
      loyalty_points_used: loyaltyPointsUsed || 0,
      credits_used: creditsUsed || 0,
      referral_discount: referralDiscount || 0,
      // Código de descuento
      discount_code: discountCode || null,
      discount_code_discount: discountCodeDiscount || 0,
    };

    const { data, error } = await supabase
      .from("reservations")
      .insert(reservationData as never)
      .select("id")
      .single();

    if (error) {
      console.error("Error al crear reserva:", error);

      if (error.code === "23505" || error.message?.includes("UNIQUE")) {
        return conflictResponse(
          "El horario fue reservado por otro usuario. Por favor selecciona otro horario."
        );
      }

      return errorResponse(error.message || "Error al crear la reserva", 500);
    }

    const reservationId = (data as { id: number } | null)?.id;
    if (reservationId == null || typeof reservationId !== "number") {
      return errorResponse(
        "No se pudo obtener el ID de la reserva creada",
        500
      );
    }

    // Tareas post-insert independientes: ejecutar en paralelo para reducir latencia
    let guestToken: string | null = null;
    let guestReservationUrl: string | null = null;

    const pointsToGrant =
      userId && price && Number(price) > 0
        ? Math.floor(Number(price) / 10)
        : 0;

    const postInsertTasks: Promise<void>[] = [];

    if (userId && pointsToGrant > 0) {
      postInsertTasks.push(
        (async () => {
          try {
            const expiresAt = new Date();
            expiresAt.setFullYear(expiresAt.getFullYear() + 1);
            const { error: e } = await supabase.from("loyalty_points").insert({
              user_id: userId,
              points: pointsToGrant,
              expires_at: expiresAt.toISOString().slice(0, 10),
              reservation_id: reservationId,
              used: false,
              revoked: false,
            } as never);
            if (e) {
              console.error("Error otorgando puntos de lealtad:", e);
            }
          } catch (err) {
            console.error("Error inesperado otorgando puntos de lealtad:", err);
          }
        })()
      );
    }

    if (userId) {
      postInsertTasks.push(
        (async () => {
          try {
            const { data: existingProfile } = await supabase
              .from("users")
              .select("name, phone")
              .eq("id", userId)
              .maybeSingle();
            if (!existingProfile) return;
            const p = existingProfile as {
              name: string | null;
              phone: string | null;
            };
            if (p.name && p.phone) return;
            const updateData: {
              name?: string;
              phone?: string;
              updated_at: string;
            } = { updated_at: new Date().toISOString() };
            if (!p.name && name) updateData.name = name;
            if (!p.phone && phone) updateData.phone = phone;
            if (updateData.name || updateData.phone) {
              await supabase
                .from("users")
                .update(updateData as never)
                .eq("id", userId);
            }
          } catch (err) {
            console.error("Error updating user profile:", err);
          }
        })()
      );
    }

    if (discountCode) {
      postInsertTasks.push(
        (async () => {
          try {
            const { data: codeData, error: codeError } = await supabase
              .from("discount_codes")
              .select("id")
              .eq("code", discountCode.toUpperCase())
              .single();
            if (codeError || !codeData || !(codeData as { id: string }).id)
              return;
            const codeId = (codeData as { id: string }).id;
            const { error: insertError } = await supabase
              .from("discount_code_uses")
              .insert({
                discount_code_id: codeId,
                user_id: userId || null,
                email: normalizedEmail,
                reservation_id: reservationId,
              } as never);
            if (insertError) {
              console.error("Error al insertar uso de código:", insertError);
              return;
            }
            const { error: rpcError } = await supabase.rpc(
              "increment_discount_code_uses",
              { code_id: codeId } as never
            );
            if (rpcError) {
              console.error(
                "Error al incrementar contador de usos del código:",
                rpcError
              );
            }
          } catch (err) {
            console.error("Error al registrar uso de código:", err);
          }
        })()
      );
    }

    if (!userId) {
      postInsertTasks.push(
        (async () => {
          try {
            const tok = await generateGuestToken(
              normalizedEmail,
              String(reservationId)
            );
            guestToken = tok;
            guestReservationUrl = generateGuestReservationUrl(tok);
          } catch (err) {
            console.error("Error al generar token de invitado:", err);
          }
        })()
      );
    }

    await Promise.all(postInsertTasks);

    // Email de confirmación en segundo plano (no bloquear la respuesta ni el loading)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const manageUrl = guestReservationUrl
      ? guestReservationUrl
      : `${baseUrl}/reservaciones/${reservationId}`;
    if (normalizedEmail) {
      sendReservationConfirmation({
        to: normalizedEmail,
        name,
        date,
        startTime,
        price: Number.isFinite(Number(price)) ? Number(price) : 0,
        reservationId,
        manageUrl,
      })
        .then((r) => {
          if (!r.ok) {
            console.error("Error al enviar email de confirmación:", r.error);
          }
        })
        .catch((e) => {
          console.error("Error inesperado al enviar email de confirmación:", e);
        });
    }

    return successResponse({
      reservationId,
      guestToken, // Token JWT para invitados
      guestReservationUrl, // URL completa del magic link
      loyaltyLevelChanged, // Si el nivel cambió
      newLoyaltyLevel, // Nuevo nivel de fidelización
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error inesperado al crear la reserva";
    console.error("Error inesperado:", error);
    return errorResponse(errorMessage, 500);
  }
}
