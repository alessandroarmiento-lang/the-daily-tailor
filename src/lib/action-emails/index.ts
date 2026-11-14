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
import type {
  ActionEmailAdapter,
  ActionEmailBriefing,
  MailScan,
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

const WINDOW_LABEL = "Richieste e posta che conta";

function emptyBriefing(
  adapter: ActionEmailAdapter,
  isMock: boolean,
): ActionEmailBriefing {
  return {
    items: [],
    notable: [],
    analysis: "",
    hiddenCount: 0,
    fetchedAt: new Date().toISOString(),
    sourceLabel: adapter.label,
    windowLabel: WINDOW_LABEL,
    isMock,
  };
}

/**
 * Adapters may return a ranked pool larger than the A4 slot.
 * Cap here and expose hiddenCount for «+N».
 */
function briefingFromScan(
  scan: MailScan,
  adapter: ActionEmailAdapter,
  isMock: boolean,
): ActionEmailBriefing {
  const max = config.actionEmails.maxItems;
  const notableMax = config.actionEmails.notableMax;
  const items = scan.items.slice(0, max);
  const notable = (scan.notable ?? []).slice(0, notableMax);
  const hiddenCount = Math.max(0, scan.items.length - items.length);
  return {
    items,
    notable,
    analysis: scan.analysis,
    hiddenCount,
    fetchedAt: new Date().toISOString(),
    sourceLabel: adapter.label,
    windowLabel: WINDOW_LABEL,
    isMock,
  };
}

export async function getActionEmails(
  editionDateKey?: string,
): Promise<SectionResult<ActionEmailBriefing>> {
  const adapter = resolveAdapter();
  const useMock = adapter.id === "mock";

  try {
    const scan = await adapter.getRecentActionEmails(editionDateKey);
    return {
      status: "ok",
      data: briefingFromScan(scan, adapter, useMock),
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
  MailScan,
} from "./types";
