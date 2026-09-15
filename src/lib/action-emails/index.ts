/**
 * Action emails — yesterday messages that imply a to-do.
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
      if (process.platform === "darwin") {
        return new AppleMailActionEmailAdapter();
      }
      return new ImapActionEmailAdapter();
    }
  }
}

function emptyBriefing(
  adapter: ActionEmailAdapter,
  isMock: boolean,
): ActionEmailBriefing {
  return {
    items: [],
    hiddenCount: 0,
    fetchedAt: new Date().toISOString(),
    sourceLabel: adapter.label,
    windowLabel: "Ieri · solo richieste d’azione",
    isMock,
  };
}

/**
 * Adapters may return a ranked pool larger than the A4 slot.
 * Cap here and expose hiddenCount for «+N altre email».
 */
function briefingFromPool(
  pool: ActionEmailItem[],
  adapter: ActionEmailAdapter,
  isMock: boolean,
): ActionEmailBriefing {
  // Pool is already actionable; re-cap by list order (adapters rank first).
  const max = config.actionEmails.maxItems;
  const items = pool.slice(0, max);
  const hiddenCount = Math.max(0, pool.length - items.length);
  return {
    items,
    hiddenCount,
    fetchedAt: new Date().toISOString(),
    sourceLabel: adapter.label,
    windowLabel: "Ieri · solo richieste d’azione",
    isMock,
  };
}

export async function getActionEmails(): Promise<
  SectionResult<ActionEmailBriefing>
> {
  const adapter = resolveAdapter();
  const useMock = adapter.id === "mock";

  try {
    const pool = await adapter.getYesterdaysActionEmails();
    return {
      status: "ok",
      data: briefingFromPool(pool, adapter, useMock),
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Email non disponibili";
    const message =
      adapter.id === "mock" ? raw : mailAuthMessage(raw);

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
