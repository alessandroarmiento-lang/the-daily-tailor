import { buildEdition } from "@/lib/build-edition";
import { getEditionDateKey } from "@/lib/edition";
import { isValidDateKey } from "@/lib/edition";
import { loadEdition, saveEdition } from "@/lib/edition-store";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ date: string }>;
};

/**
 * GET a dated edition.
 * Past days: only from disk. Today: build+save if missing.
 * Future dates: 404.
 */
export async function GET(_request: Request, context: RouteContext) {
  const { date } = await context.params;
  if (!isValidDateKey(date)) {
    return Response.json({ error: "Data non valida" }, { status: 400 });
  }

  const todayKey = getEditionDateKey();
  if (date > todayKey) {
    return Response.json(
      { error: "Edizione futura non disponibile" },
      { status: 404 },
    );
  }

  const existing = await loadEdition(date);
  if (existing) {
    return Response.json({ edition: existing, created: false });
  }

  if (date === todayKey) {
    const edition = await buildEdition(date);
    await saveEdition(edition);
    return Response.json({ edition, created: true });
  }

  return Response.json(
    { error: "Edizione non trovata in archivio" },
    { status: 404 },
  );
}
