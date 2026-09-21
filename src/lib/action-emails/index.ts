/**
 * Action emails — rolling latest actionable messages (to-do / request).
 * Prefer headless IMAP (iCloud + Gmail app passwords) so editions generate
 * with Mac off. Apple Mail automation is a Mac-awake fallback only.
 */
import { config } from "@/lib/config";
import { mailAuthMessage } from "@/lib/apple/permissions";
import { AppleMailActionEmailAdapter } from "./applemail";
import {
  hasImapCredentials,
  ImapActionEmailAdapter,
} from "./imap";
import { MockActionEmailAdapter } from "./mock";
import { toActionEmailItemsWithOverflow } from "./actionable";
import type {
  ActionEmailAdapter,
  ActionEmailBriefing,
  ActionEmailItem,
  SectionResult,
} from "./types";

function resolveAdapter(): ActionEmailAdapter {
  const source = config.actionEmails.source;
  const onDarwin = process.platform === "darwin";

  // Linux / Fly: never Apple Mail — always IMAP for Mac-off.
  if (!onDarwin && source !== "mock") {
    return new ImapActionEmailAdapter();
  }

  switch (source) {
    case "imap":
      return new ImapActionEmailAdapter();
    case "applemail":
      return new AppleMailActionEmailAdapter();
    case "mock":
      return new MockActionEmailAdapter();
    case "auto":
    default: {
      if (hasImapCredentials()) return new ImapActionEmailAdapter();
      if (onDarwin) {
        return new AppleMailActionEmailAdapter();
      }
      return new ImapActionEmailAdapter();
    }
  }
}

const WINDOW_LABEL = "Ultime · richieste d’azione";

function emptyBriefing(
  adapter: ActionEmailAdapter,
  isMock: boolean,
): ActionEmailBriefing {
  return {
    items: [],
    hiddenCount: 0,
    fetchedAt: new Date().toISOString(),
    sourceLabel: adapter.label,
    windowLabel: WINDOW_LABEL,
    isMock,
  };
}

/**
 * Adapters may return a ranked pool larger than the visible slot.
 * Cap here; rolling last-N does not show a +N overflow row.
 */
function briefingFromPool(
  pool: ActionEmailItem[],
  adapter: ActionEmailAdapter,
  isMock: boolean,
): ActionEmailBriefing {
  const max = config.actionEmails.maxItems;
  const items = pool.slice(0, max);
  return {
    items,
    hiddenCount: 0,
    fetchedAt: new Date().toISOString(),
    sourceLabel: adapter.label,
    windowLabel: WINDOW_LABEL,
    isMock,
  };
}

export async function getActionEmails(): Promise<
  SectionResult<ActionEmailBriefing>
> {
  const adapter = resolveAdapter();
  const useMock = adapter.id === "mock";

  try {
    const pool = await adapter.getRecentActionEmails();
    return {
      status: "ok",
      data: briefingFromPool(pool, adapter, useMock),
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Email non disponibili";
    const message =
      useMock || adapter.id === "imap" ? raw : mailAuthMessage(raw);

    return {
      status: "error",
      message,
      data: emptyBriefing(adapter, useMock),
    };
  }
}

export type {
  ActionEmailAdapter,
  ActionEmailItem,
  ActionEmailBriefing,
} from "./types";

// Re-export for adapters that build overflow-aware pools.
export { toActionEmailItemsWithOverflow };
