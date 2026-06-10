import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { buildIlikePattern } from "@/lib/admin/ilike-pattern";

export type VestidoSearchHit = {
  googleEventId: string;
  displayTitle: string;
  date: string;
  description: string | null;
};

type VestidoSupabase = SupabaseClient<Database>;

function pickEmbeddedNote(raw: unknown): {
  title_override: string | null;
  description_override: string | null;
} | null {
  if (raw == null) return null;
  if (Array.isArray(raw)) {
    const first = raw[0] as
      | { title_override?: string | null; description_override?: string | null }
      | undefined;
    if (!first) return null;
    return {
      title_override: first.title_override ?? null,
      description_override: first.description_override ?? null,
    };
  }
  const o = raw as {
    title_override?: string | null;
    description_override?: string | null;
  };
  return {
    title_override: o.title_override ?? null,
    description_override: o.description_override ?? null,
  };
}

function displayTitle(
  title: string,
  note: ReturnType<typeof pickEmbeddedNote>,
): string {
  const override = note?.title_override?.trim();
  return override || title;
}

function inDateRange(
  date: string,
  dateFrom?: string | null,
  dateTo?: string | null,
): boolean {
  if (dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) && date < dateFrom) {
    return false;
  }
  if (dateTo && /^\d{4}-\d{2}-\d{2}$/.test(dateTo) && date > dateTo) {
    return false;
  }
  return true;
}

/**
 * Busca eventos del calendario de vestidos por título/descripción (incl. overrides en notas).
 */
export async function searchVestidoCalendarEvents(
  supabase: VestidoSupabase,
  search: string,
  opts?: { dateFrom?: string | null; dateTo?: string | null; limit?: number },
): Promise<VestidoSearchHit[]> {
  const term = search.trim();
  if (!term) return [];

  const quoted = buildIlikePattern(term);
  const orEvents = `title.ilike.${quoted},description.ilike.${quoted}`;
  const orNotes = `title_override.ilike.${quoted},description_override.ilike.${quoted}`;
  const limit = opts?.limit ?? 25;

  let eventsQuery = supabase
    .from("vestido_calendar_events")
    .select(
      `
          google_event_id,
          title,
          description,
          date,
          vestido_calendar_notes (
            title_override,
            description_override
          )
        `,
    )
    .or(orEvents)
    .order("date", { ascending: false })
    .limit(limit);

  if (opts?.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateFrom)) {
    eventsQuery = eventsQuery.gte("date", opts.dateFrom);
  }
  if (opts?.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateTo)) {
    eventsQuery = eventsQuery.lte("date", opts.dateTo);
  }

  let notesQuery = supabase
    .from("vestido_calendar_notes")
    .select(
      `
          title_override,
          description_override,
          vestido_calendar_events!inner (
            google_event_id,
            title,
            description,
            date
          )
        `,
    )
    .or(orNotes)
    .limit(limit);

  if (opts?.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateFrom)) {
    notesQuery = notesQuery.gte("vestido_calendar_events.date", opts.dateFrom);
  }
  if (opts?.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(opts.dateTo)) {
    notesQuery = notesQuery.lte("vestido_calendar_events.date", opts.dateTo);
  }

  const [{ data: eventRows, error: eventsErr }, { data: noteRows, error: notesErr }] =
    await Promise.all([eventsQuery, notesQuery]);

  if (eventsErr) {
    console.error("[vestido search events]", eventsErr);
  }
  if (notesErr) {
    console.error("[vestido search notes]", notesErr);
  }

  const byId = new Map<string, VestidoSearchHit>();

  for (const row of eventRows ?? []) {
    const r = row as {
      google_event_id: string;
      title: string;
      description: string | null;
      date: string;
      vestido_calendar_notes: unknown;
    };
    const note = pickEmbeddedNote(r.vestido_calendar_notes);
    byId.set(r.google_event_id, {
      googleEventId: r.google_event_id,
      displayTitle: displayTitle(r.title, note),
      date: r.date,
      description: note?.description_override?.trim() || r.description,
    });
  }

  for (const row of noteRows ?? []) {
    const r = row as {
      title_override: string | null;
      description_override: string | null;
      vestido_calendar_events: {
        google_event_id: string;
        title: string;
        description: string | null;
        date: string;
      };
    };
    const rawEv = r.vestido_calendar_events;
    const ev = Array.isArray(rawEv) ? rawEv[0] : rawEv;
    if (!ev?.google_event_id) continue;
    if (!inDateRange(ev.date, opts?.dateFrom, opts?.dateTo)) continue;
    if (byId.has(ev.google_event_id)) continue;
    byId.set(ev.google_event_id, {
      googleEventId: ev.google_event_id,
      displayTitle: displayTitle(ev.title, {
        title_override: r.title_override,
        description_override: r.description_override,
      }),
      date: ev.date,
      description:
        r.description_override?.trim() || ev.description,
    });
  }

  return [...byId.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit);
}
