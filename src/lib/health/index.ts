import { getEditionDateKey } from "@/lib/edition";
import {
  isPushedHealthFresh,
  loadPushedHealth,
} from "./pushed";
import { defaultAppleHealthDir, summarizeHealthDir } from "./summarize";
import type { HealthBriefing, SectionResult } from "./types";

function empty(message: string): SectionResult<HealthBriefing> {
  return {
    status: "error",
    message,
    data: {
      lines: [],
      fetchedAt: new Date().toISOString(),
      sourceLabel: "Second brain",
    },
  };
}

/**
 * Previous day + last night, from the second-brain Apple export when this
 * machine has it, otherwise from the Mac push on the always-on host.
 */
export async function getHealth(
  dateKey: string = getEditionDateKey(),
): Promise<SectionResult<HealthBriefing>> {
  try {
    const local = await summarizeHealthDir(defaultAppleHealthDir(), dateKey);
    if (local && local.lines.length > 0) {
      return { status: "ok", data: local };
    }
  } catch {
    // Fall through to the pushed strip.
  }

  const pushed = await loadPushedHealth();
  if (pushed && isPushedHealthFresh(pushed) && pushed.briefing.lines.length > 0) {
    return {
      status: "ok",
      data: {
        ...pushed.briefing,
        sourceLabel: pushed.briefing.sourceLabel || "Second brain",
      },
    };
  }

  return empty("Nessun dato di ieri o della notte.");
}
