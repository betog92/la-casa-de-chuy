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
      loyaltyDiscount,
      loyaltyPointsUsed,
      creditsUsed,
      referralDiscount,
      discountCode,
      discountCodeDiscount,
    } = body;

    // Usar el userId autenticado (ignorar cualquier userId del body por seguridad)
    const userId = authenticatedUserId;

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

    // Crear reserva
    const endTime = calculateEndTime(startTime);
    // Normalizar email para consistencia (mismo formato que en token de invitado)
    const normalizedEmail = email.toLowerCase().trim();
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

    const reservationId = (data as { id: string } | null)?.id;
    if (!reservationId) {
      return errorResponse(
        "No se pudo obtener el ID de la reserva creada",
        500
      );
    }

    // Si hay usuario autenticado, actualizar su perfil con name y phone si no los tiene
    if (userId) {
      try {
        const { data: existingProfile } = await supabase
          .from("users")
          .select("name, phone")
          .eq("id", userId)
          .maybeSingle();

        // Solo actualizar si el perfil existe y no tiene name o phone
        if (existingProfile) {
          const profileData = existingProfile as {
            name: string | null;
            phone: string | null;
          };

          if (!profileData.name || !profileData.phone) {
            const updateData: {
              name?: string;
              phone?: string;
              updated_at: string;
            } = {
              updated_at: new Date().toISOString(),
            };

            if (!profileData.name && name) {
              updateData.name = name;
            }
            if (!profileData.phone && phone) {
              updateData.phone = phone;
            }

            // Solo actualizar si hay algo que actualizar
            if (updateData.name || updateData.phone) {
              await supabase
                .from("users")
                .update(updateData as never)
                .eq("id", userId);
            }
          }
        }
      } catch (profileError) {
        // No fallar la reserva si hay error al actualizar perfil
        console.error("Error updating user profile:", profileError);
      }
    }

    // Si se usó un código de descuento, registrar el uso y actualizar contadores
    if (discountCode) {
      try {
        // Buscar el código de descuento
        const { data: codeData, error: codeError } = await supabase
          .from("discount_codes")
          .select("id")
          .eq("code", discountCode.toUpperCase())
          .single();

        if (!codeError && codeData && (codeData as { id: string }).id) {
          const codeId = (codeData as { id: string }).id;

          // Crear registro de uso (usar normalizedEmail para consistencia)
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
            // Continuamos aunque falle el insert, para no bloquear la reserva
          } else {
            // Incrementar contador de usos de forma atómica usando función SQL
            // Esto evita condiciones de carrera en actualizaciones concurrentes
            const { error: rpcError } = await supabase.rpc(
              "increment_discount_code_uses",
              {
                code_id: codeId,
              } as never
            );

            if (rpcError) {
              console.error(
                "Error al incrementar contador de usos del código:",
                rpcError
              );
              // Continuamos aunque falle el incremento, para no bloquear la reserva
              // El contador puede corregirse manualmente si es necesario
            }
          }
        }
      } catch (codeErr) {
        // No fallar la reserva si hay error al registrar el código
        console.error("Error al registrar uso de código:", codeErr);
      }
    }

    // Si es un invitado (no tiene userId), generar token para magic link
    let guestToken: string | null = null;
    let guestReservationUrl: string | null = null;

    if (!userId) {
      try {
        // Usar normalizedEmail para consistencia (el token también normaliza internamente)
        guestToken = await generateGuestToken(normalizedEmail, reservationId);
        guestReservationUrl = generateGuestReservationUrl(guestToken);
      } catch (tokenError) {
        // No fallar la reserva si hay error al generar el token
        console.error("Error al generar token de invitado:", tokenError);
      }
    }

    return successResponse({
      reservationId,
      guestToken, // Token JWT para invitados
      guestReservationUrl, // URL completa del magic link
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
