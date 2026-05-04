import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createServiceRoleClient } from "@/lib/supabase/server";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
  notFoundResponse,
  forbiddenResponse,
  conflictResponse,
} from "@/utils/api-response";
import type { Database } from "@/types/database.types";
import { materializeTransfer } from "@/utils/transfer-materialization";

// =====================================================
// /api/fotografos/reclamar/[token]
// =====================================================
// Magic link para que un fotógrafo/estudio que no tenía cuenta
// al momento de materializar la transferencia reclame las
// Monedas Chuy que le regaló un cliente.
//
// GET: información pública mínima de la transferencia (para
//      mostrar en la página de reclamo). No revela datos
//      personales del cliente más allá de su nombre.
// POST: reclama. Requiere sesión activa cuyo email coincida
//      con el to_email de la transferencia.
// =====================================================

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseToken(raw: string): string | null {
  const t = (raw || "").trim().toLowerCase();
  if (!UUID_REGEX.test(t)) return null;
  return t;
}

interface TransferRow {
  id: string;
  reservation_id: number;
  from_user_id: string | null;
  from_email: string;
  to_email: string;
  to_user_id: string | null;
  to_studio_name: string | null;
  status: string;
  transferred_points: number | null;
  claim_token: string | null;
  created_at: string;
  materialized_at: string | null;
  claimed_at: string | null;
}

async function loadTransferByToken(
  supabase: ReturnType<typeof createServiceRoleClient>,
  claimToken: string,
): Promise<TransferRow | null> {
  const { data, error } = await supabase
    .from("benefit_transfers")
    .select(
      "id, reservation_id, from_user_id, from_email, to_email, to_user_id, to_studio_name, status, transferred_points, claim_token, created_at, materialized_at, claimed_at",
    )
    .eq("claim_token", claimToken)
    .maybeSingle();
  if (error) {
    console.error("Error cargando transferencia por token:", error);
    return null;
  }
  return (data as TransferRow | null) ?? null;
}

// =====================================================
// GET: información para mostrar en la página de reclamo
// =====================================================
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    const claimToken = parseToken(rawToken);
    if (!claimToken) {
      return validationErrorResponse("Token de reclamo inválido");
    }

    const supabase = createServiceRoleClient();
    const transfer = await loadTransferByToken(supabase, claimToken);
    if (!transfer) {
      return notFoundResponse("Transferencia");
    }

    // Cargar nombre del cliente que regaló (si tiene cuenta)
    let fromName: string | null = null;
    if (transfer.from_user_id) {
      const { data: fromUser } = await supabase
        .from("users")
        .select("name")
        .eq("id", transfer.from_user_id)
        .maybeSingle();
      if (fromUser) {
        fromName =
          (fromUser as { name: string | null }).name?.trim() || null;
      }
    }

    return successResponse({
      transfer: {
        status: transfer.status,
        transferredPoints: transfer.transferred_points || 0,
        toEmail: transfer.to_email,
        toStudioName: transfer.to_studio_name,
        fromName,
        materializedAt: transfer.materialized_at,
        claimedAt: transfer.claimed_at,
      },
    });
  } catch (err) {
    console.error("Error inesperado en GET reclamar:", err);
    return errorResponse("Error inesperado", 500);
  }
}

// =====================================================
// POST: reclamar las Monedas Chuy
// =====================================================
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const { token: rawToken } = await params;
    const claimToken = parseToken(rawToken);
    if (!claimToken) {
      return validationErrorResponse("Token de reclamo inválido");
    }

    // Sesión activa
    const cookieStore = await cookies();
    const authClient = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {},
        },
      },
    );
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user?.id || !user.email) {
      return unauthorizedResponse(
        "Inicia sesión con el correo al que te regalaron las Monedas Chuy.",
      );
    }

    const supabase = createServiceRoleClient();
    const transfer = await loadTransferByToken(supabase, claimToken);
    if (!transfer) {
      return notFoundResponse("Transferencia");
    }

    // Solo en pending_claim se puede reclamar
    if (transfer.status === "claimed") {
      return conflictResponse(
        "Esta transferencia ya fue reclamada.",
      );
    }
    if (transfer.status !== "pending_claim") {
      return errorResponse(
        "Esta transferencia no está disponible para reclamo.",
        400,
      );
    }

    // El email del usuario debe coincidir con to_email
    const userEmail = user.email.toLowerCase().trim();
    const toEmail = (transfer.to_email || "").toLowerCase().trim();
    if (userEmail !== toEmail) {
      return forbiddenResponse(
        `Para reclamar estas Monedas Chuy debes iniciar sesión con el correo ${toEmail}.`,
      );
    }

    if (!transfer.from_user_id) {
      // Defensa: una transferencia sin from_user_id no debería existir.
      return errorResponse(
        "Esta transferencia está en un estado inválido. Contacta a soporte.",
        500,
      );
    }

    // Las Monedas del cliente ya están revocadas desde que se creó el
    // pending. Aquí solo cambiamos status atómicamente y acreditamos al
    // fotógrafo. Atómico contra carreras (doble click / múltiples tabs)
    // gracias al UPDATE eq pending_claim.
    const snapshotPoints = Math.max(
      0,
      Math.floor(Number(transfer.transferred_points) || 0),
    );
    const result = await materializeTransfer({
      supabase,
      transferId: transfer.id,
      toUserId: user.id,
      pointsToCredit: snapshotPoints,
      targetStatus: "claimed",
      fromStatus: "pending_claim",
    });

    if (!result.ok) {
      if (result.reason === "race") {
        return conflictResponse("Esta transferencia ya fue reclamada.");
      }
      if (result.reason === "no_points") {
        return errorResponse(
          "Esta transferencia no tiene Monedas Chuy disponibles para reclamar.",
          400,
        );
      }
      console.error("Error materializando claim:", result.error);
      return errorResponse(
        "No se pudieron reclamar las Monedas Chuy. Intenta de nuevo.",
        500,
      );
    }

    // Marcar al usuario como fotógrafo (no bloquea el reclamo si falla)
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ is_photographer: true } as never)
      .eq("id", user.id);
    if (updateUserError) {
      console.error(
        "Error marcando is_photographer en usuario:",
        updateUserError,
      );
    }

    return successResponse({
      message: "Reclamaste tus Monedas Chuy",
      pointsCredited: result.pointsTransferred,
    });
  } catch (err) {
    console.error("Error inesperado en POST reclamar:", err);
    return errorResponse("Error inesperado", 500);
  }
}
