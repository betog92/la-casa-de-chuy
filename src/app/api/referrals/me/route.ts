import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
} from "@/utils/api-response";
import {
  REFERRAL_INVITEE_DISCOUNT_MXN,
  REFERRAL_REFERRER_CREDIT_MXN,
} from "@/lib/payments/referral-validation";
import {
  ensurePublicUserRow,
  syncUserToDatabase,
} from "@/lib/supabase/user-sync";
import type { Database } from "@/types/database.types";

/**
 * GET /api/referrals/me
 *
 * Devuelve el código permanente de referido del usuario logueado y
 * estadísticas de uso (cuántos amigos lo han redimido).
 *
 * El código se asegura vía RPC `ensure_user_referral_code(user_id)`, que es
 * atómica: si existe lo devuelve, si no lo crea con manejo interno de race.
 * Esto elimina la necesidad de SELECT → RPC → INSERT en TypeScript.
 */
export async function GET() {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // read-only: no setteamos cookies aquí.
          },
        },
      },
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return unauthorizedResponse("Debes iniciar sesión");
    }

    // Service-role para leer tablas con RLS habilitada sin políticas
    // específicas (referral_codes/redemptions sólo se exponen vía esta API).
    const service = createServiceRoleClient();

    // El código de referido vive en `referral_codes` (FK a auth.users), pero la
    // validación en checkout lee el email del referidor desde `public.users`.
    // Sincronizamos primero para evitar códigos "huérfanos" sin perfil público.
    const syncResult = await syncUserToDatabase(user);
    const { data: publicProfile } = await service
      .from("users")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (!publicProfile) {
      const repaired = await ensurePublicUserRow(service, user);
      if (!repaired.ok) {
        console.error(
          "[/api/referrals/me] No se pudo asegurar public.users antes del código:",
          syncResult.error,
          repaired.error,
        );
        return errorResponse(
          "No se pudo preparar tu cuenta. Intenta de nuevo en unos segundos.",
          500,
        );
      }
    }

    // RPC atómica: garantiza un código (existente o recién creado) sin race.
    const { data: ensuredCode, error: rpcErr } = await service.rpc(
      "ensure_user_referral_code",
      { p_user_id: user.id } as never,
    );

    if (rpcErr || !ensuredCode) {
      console.error(
        "[/api/referrals/me] ensure_user_referral_code falló:",
        rpcErr,
      );
      return errorResponse(
        "No se pudo obtener tu código de referido. Intenta de nuevo.",
        500,
      );
    }

    const code = String(ensuredCode);

    // Leemos metadata + count en paralelo (mismo backend, sin dependencias).
    const [metaRes, countRes] = await Promise.all([
      service
        .from("referral_codes")
        .select("id, active, created_at")
        .eq("user_id", user.id)
        .maybeSingle(),
      // El count requiere conocer el id; lo resolvemos por user_id en
      // un join implícito barato a través de filter por code.
      service
        .from("referral_redemptions")
        .select("id", { count: "exact", head: true })
        .eq("referrer_user_id", user.id)
        .eq("status", "awarded"),
    ]);

    if (metaRes.error || !metaRes.data) {
      console.error(
        "[/api/referrals/me] Error leyendo metadata del código:",
        metaRes.error,
      );
      return errorResponse("Error al cargar tu código de referido", 500);
    }

    const meta = metaRes.data as {
      id: string;
      active: boolean;
      created_at: string;
    };

    return successResponse({
      code,
      active: meta.active,
      createdAt: meta.created_at,
      stats: {
        redeemedCount: countRes.count ?? 0,
      },
      rewards: {
        inviteeDiscountAmount: REFERRAL_INVITEE_DISCOUNT_MXN,
        referrerCreditAmount: REFERRAL_REFERRER_CREDIT_MXN,
      },
    });
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Error al cargar tu código de referido";
    console.error("Error inesperado en /api/referrals/me:", error);
    return errorResponse(errorMessage, 500);
  }
}
