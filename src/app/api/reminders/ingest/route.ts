import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { clearEditionAdapterCache } from "@/lib/apple/edition-cache";
import { getOrBuildTodayEdition } from "@/lib/build-edition";
import {
  DAILY_TAILOR_CACHE_TAG,
  editionCacheTag,
  getEditionDateKey,
} from "@/lib/edition";
import {
  isPushedSnapshotFresh,
  loadPushedReminders,
  normalizePushedReminders,
  pushedSnapshotAgeHours,
  pushedSnapshotMaxAgeHours,
  PUSHED_DEVICE_LABEL,
  savePushedReminders,
} from "@/lib/reminders/ingest-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Roughly 200 reminders with notes; anything larger is a mistake. */
const MAX_BODY_BYTES = 256 * 1024;

function expectedToken(): string {
  return (process.env.REMINDERS_INGEST_TOKEN ?? "").trim();
}

/** `X-Ingest-Token: …` or `Authorization: Bearer …`. */
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

type Guard = { ok: true } | { ok: false; response: Response };

function guard(request: Request): Guard {
  const expected = expectedToken();
  if (!expected) {
    return {
      ok: false,
      response: Response.json(
        {
          ok: false,
          error:
            "REMINDERS_INGEST_TOKEN non configurato su questo host (fly secrets set).",
        },
        { status: 503 },
      ),
    };
  }
  if (!tokensMatch(presentedToken(request), expected)) {
    return {
      ok: false,
      response: Response.json(
        { ok: false, error: "Token di ingest non valido." },
        { status: 401 },
      ),
    };
  }
  return { ok: true };
}

/**
 * Snapshot status for the phone / Mac (same token as POST).
 * Never echoes the token or reminder contents.
 */
export async function GET(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  const snapshot = await loadPushedReminders();
  return Response.json({
    ok: true,
    hasSnapshot: Boolean(snapshot),
    receivedAt: snapshot?.receivedAt ?? null,
    deviceLabel: snapshot?.deviceLabel ?? null,
    count: snapshot?.items.length ?? 0,
    ageHours: snapshot
      ? Number(pushedSnapshotAgeHours(snapshot).toFixed(2))
      : null,
    fresh: snapshot ? isPushedSnapshotFresh(snapshot) : false,
    staleAfterHours: pushedSnapshotMaxAgeHours(),
  });
}

/**
 * Receive today's open reminders from the iPhone Shortcut.
 * Apple Reminders are CloudKit-only, so this push is the Mac-off source.
 * Add `?warm=1` to rebuild the edition immediately (manual runs).
 */
export async function POST(request: Request) {
  const auth = guard(request);
  if (!auth.ok) return auth.response;

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return Response.json(
      { ok: false, error: "Payload troppo grande (max 256 KB)." },
      { status: 413 },
    );
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return Response.json(
      { ok: false, error: "Body non è JSON valido." },
      { status: 400 },
    );
  }

  const deviceLabel =
    (payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    typeof (payload as Record<string, unknown>).device === "string"
      ? ((payload as Record<string, unknown>).device as string)
      : "") || PUSHED_DEVICE_LABEL;

  const normalized = normalizePushedReminders(payload);
  if (!normalized.valid) {
    return Response.json(
      {
        ok: false,
        error:
          'Attesa una lista JSON di promemoria (array, oppure {"reminders": [...]}).',
      },
      { status: 400 },
    );
  }

  const snapshot = await savePushedReminders(normalized.items, deviceLabel);

  const url = new URL(request.url);
  const bodyWarm =
    payload &&
    typeof payload === "object" &&
    !Array.isArray(payload) &&
    (payload as Record<string, unknown>).warm === true;
  const shouldWarm = url.searchParams.get("warm") === "1" || bodyWarm === true;

  let warmed = false;
  if (shouldWarm) {
    const dateKey = getEditionDateKey();
    revalidateTag(DAILY_TAILOR_CACHE_TAG, "max");
    revalidateTag(editionCacheTag(dateKey), "max");
    await clearEditionAdapterCache(dateKey);
    await getOrBuildTodayEdition({ force: true });
    warmed = true;
  }

  return Response.json({
    ok: true,
    stored: snapshot.items.length,
    received: normalized.received,
    skipped: normalized.skipped,
    receivedAt: snapshot.receivedAt,
    deviceLabel: snapshot.deviceLabel,
    staleAfterHours: pushedSnapshotMaxAgeHours(),
    warmed,
  });
}
