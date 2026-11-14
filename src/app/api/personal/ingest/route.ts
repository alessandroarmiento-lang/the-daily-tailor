import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { clearEditionAdapterCache } from "@/lib/apple/edition-cache";
import { getOrBuildTodayEdition } from "@/lib/build-edition";
import { savePushedCalendar } from "@/lib/calendar/pushed";
import type { CalendarEventItem } from "@/lib/calendar/types";
import {
  DAILY_TAILOR_CACHE_TAG,
  editionCacheTag,
  getEditionDateKey,
} from "@/lib/edition";
import { savePushedHealth } from "@/lib/health/pushed";
import type { HealthLine } from "@/lib/health/types";
import { withBudget } from "@/lib/with-budget";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 512 * 1024;
const WARM_BUDGET_MS = 60_000;

function expectedToken(): string {
  return (process.env.REMINDERS_INGEST_TOKEN ?? "").trim();
}

function presentedToken(request: Request): string {
  const header = request.headers.get("x-ingest-token");
  if (header?.trim()) return header.trim();
  const auth = (request.headers.get("authorization") ?? "").trim();
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  return bearer ? bearer[1].trim() : "";
}

function tokensMatch(presented: string, expected: string): boolean {
  const a = Buffer.from(presented, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asEvents(value: unknown): CalendarEventItem[] | null {
  if (!Array.isArray(value)) return null;
  const events: CalendarEventItem[] = [];
  for (const raw of value) {
    const row = asRecord(raw);
    if (!row) continue;
    const title = typeof row.title === "string" ? row.title.trim() : "";
    const startsAt = typeof row.startsAt === "string" ? row.startsAt.trim() : "";
    if (!title || !startsAt) continue;
    events.push({
      id: typeof row.id === "string" && row.id ? row.id : `cal-${startsAt}-${title}`,
      title: title.slice(0, 300),
      location: typeof row.location === "string" ? row.location.slice(0, 200) : null,
      startsAt,
      endsAt: typeof row.endsAt === "string" ? row.endsAt : null,
      isAllDay: row.isAllDay === true,
      calendarName:
        typeof row.calendarName === "string" && row.calendarName
          ? row.calendarName.slice(0, 80)
          : "Calendar",
    });
    if (events.length >= 200) break;
  }
  return events;
}

function asHealthLines(value: unknown): HealthLine[] | null {
  const body = asRecord(value);
  const list = body && Array.isArray(body.lines) ? body.lines : value;
  if (!Array.isArray(list)) return null;
  const lines: HealthLine[] = [];
  for (const raw of list) {
    const row = asRecord(raw);
    if (!row) continue;
    const label = typeof row.label === "string" ? row.label.trim() : "";
    const text = typeof row.text === "string" ? row.text.trim() : "";
    if (!label || !text) continue;
    lines.push({ label: label.slice(0, 40), text: text.slice(0, 240) });
    if (lines.length >= 4) break;
  }
  return lines;
}

/**
 * Mac push of Apple Calendar (events + scheduled reminders) and the health strip.
 * Same token as reminders ingest. `?warm=1` rebuilds today's edition.
 * The response never echoes event titles or health values.
 */
export async function POST(request: Request) {
  const expected = expectedToken();
  if (!expected) {
    return Response.json(
      { ok: false, error: "REMINDERS_INGEST_TOKEN non configurato su questo host." },
      { status: 503 },
    );
  }
  if (!tokensMatch(presentedToken(request), expected)) {
    return Response.json({ ok: false, error: "Token di ingest non valido." }, { status: 401 });
  }

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Payload troppo grande." }, { status: 413 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Body non è JSON valido." }, { status: 400 });
  }

  const body = asRecord(payload);
  if (!body) {
    return Response.json({ ok: false, error: "Atteso un oggetto JSON." }, { status: 400 });
  }

  const device =
    typeof body.device === "string" && body.device.trim()
      ? body.device.trim().slice(0, 40)
      : "Mac";

  let calendarCount = 0;
  if (body.calendar !== undefined) {
    const events = asEvents(body.calendar);
    if (!events) {
      return Response.json({ ok: false, error: "calendar non è una lista." }, { status: 400 });
    }
    await savePushedCalendar(events, device);
    calendarCount = events.length;
  }

  let healthCount = 0;
  if (body.health !== undefined) {
    const lines = asHealthLines(body.health);
    if (!lines || lines.length === 0) {
      return Response.json({ ok: false, error: "health.lines vuoto." }, { status: 400 });
    }
    await savePushedHealth(
      {
        lines,
        fetchedAt: new Date().toISOString(),
        sourceLabel: "Second brain",
      },
      device,
    );
    healthCount = lines.length;
  }

  const url = new URL(request.url);
  const shouldWarm = url.searchParams.get("warm") === "1" || body.warm === true;
  let warmed = false;
  let warmError: string | null = null;
  if (shouldWarm) {
    const dateKey = getEditionDateKey();
    revalidateTag(DAILY_TAILOR_CACHE_TAG, "max");
    revalidateTag(editionCacheTag(dateKey), "max");
    try {
      await clearEditionAdapterCache(dateKey);
      await withBudget(
        getOrBuildTodayEdition({ force: true }),
        WARM_BUDGET_MS,
        "personal-ingest-warm",
      );
      warmed = true;
    } catch (err) {
      warmError = err instanceof Error ? err.message : String(err);
    }
  }

  return Response.json({
    ok: true,
    calendarCount,
    healthCount,
    warmed,
    warmError,
  });
}
