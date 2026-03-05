import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { requireAdmin } from "@/lib/auth/admin";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database.types";
import {
  successResponse,
  errorResponse,
  unauthorizedResponse,
  validationErrorResponse,
} from "@/utils/api-response";

/**
 * GET /api/admin/vestido-notes/[googleEventId]
 * Devuelve título editable y "última edición" para un evento del calendario de vestidos.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ googleEventId: string }> }
) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

  try {
    const { googleEventId } = await params;
    const id = decodeURIComponent(googleEventId ?? "").trim();
    if (!id) {
      return validationErrorResponse("google_event_id requerido");
    }

    const supabase = createServiceRoleClient();
    const { data: row, error } = await supabase
      .from("vestido_calendar_notes")
      .select("title_override, last_edited_at, last_edited_by_user_id")
      .eq("google_event_id", id)
      .maybeSingle();

    if (error) {
      console.error("Error fetching vestido notes:", error);
      return errorResponse("Error al cargar notas", 500);
    }

    if (!row) {
      return successResponse({
        title_override: null,
        last_edited_at: null,
        last_edited_by: null,
      });
    }

    const typedRow = row as {
      title_override: string | null;
      last_edited_at: string | null;
      last_edited_by_user_id: string | null;
    };
    const editedByUserId = typedRow.last_edited_by_user_id;
    let last_edited_by: { id: string; name: string | null; email: string } | null =
      null;
    if (editedByUserId) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("id", editedByUserId)
        .single();
      if (userRow) {
        last_edited_by = {
          id: (userRow as { id: string }).id,
          name: (userRow as { name: string | null }).name ?? null,
          email: (userRow as { email: string }).email,
        };
      }
    }

    return successResponse({
      title_override: typedRow.title_override ?? null,
      last_edited_at: typedRow.last_edited_at ?? null,
      last_edited_by,
    });
  } catch (err) {
    console.error("Error in vestido-notes GET:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Error al cargar datos",
      500
    );
  }
}

/**
 * PATCH /api/admin/vestido-notes/[googleEventId]
 * Actualiza el título/descripción y registra última edición (admin actual).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ googleEventId: string }> }
) {
  const { isAdmin } = await requireAdmin();
  if (!isAdmin) {
    return unauthorizedResponse("No tienes permisos de administrador");
  }

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
    }
  );
  const {
    data: { user },
  } = await authClient.auth.getUser();

  try {
    const { googleEventId } = await params;
    const id = decodeURIComponent(googleEventId ?? "").trim();
    if (!id) {
      return validationErrorResponse("google_event_id requerido");
    }

    const body = await request.json();
    const title_override =
      typeof body.title_override === "string"
        ? (body.title_override.trim() || null)
        : body.title_override === null
          ? null
          : undefined;

    const supabase = createServiceRoleClient();
    const payload: {
      google_event_id: string;
      title_override?: string | null;
      last_edited_at: string;
      last_edited_by_user_id: string | null;
    } = {
      google_event_id: id,
      last_edited_at: new Date().toISOString(),
      last_edited_by_user_id: user?.id ?? null,
    };
    if (title_override !== undefined) payload.title_override = title_override;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upsertError } = await (supabase as any)
      .from("vestido_calendar_notes")
      .upsert(payload, { onConflict: "google_event_id" });

    if (upsertError) {
      console.error("Error upserting vestido notes:", upsertError);
      return errorResponse("Error al guardar notas", 500);
    }

    const { data: rawRow } = await supabase
      .from("vestido_calendar_notes")
      .select("title_override, last_edited_at, last_edited_by_user_id")
      .eq("google_event_id", id)
      .single();

    type VestidoNoteRow = {
      title_override: string | null;
      last_edited_at: string | null;
      last_edited_by_user_id: string | null;
    };
    const row = rawRow as VestidoNoteRow | null;
    const editedByUserId = row?.last_edited_by_user_id ?? null;
    let last_edited_by: { id: string; name: string | null; email: string } | null =
      null;
    if (editedByUserId) {
      const { data: userRow } = await supabase
        .from("users")
        .select("id, name, email")
        .eq("id", editedByUserId)
        .single();
      if (userRow) {
        last_edited_by = {
          id: (userRow as { id: string }).id,
          name: (userRow as { name: string | null }).name ?? null,
          email: (userRow as { email: string }).email,
        };
      }
    }

    return successResponse({
      title_override: row?.title_override ?? null,
      last_edited_at: row?.last_edited_at ?? null,
      last_edited_by,
    });
  } catch (err) {
    console.error("Error in vestido-notes PATCH:", err);
    return errorResponse(
      err instanceof Error ? err.message : "Error al guardar",
      500
    );
  }
}
