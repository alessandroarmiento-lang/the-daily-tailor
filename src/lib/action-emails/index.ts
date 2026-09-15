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
import type {
  ActionEmailAdapter,
  ActionEmailBriefing,
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
      return new ImapActionEmailAdapter(); // will throw clear missing-creds error
    }
  }
}

export async function getActionEmails(): Promise<
  SectionResult<ActionEmailBriefing>
> {
  const adapter = resolveAdapter();
  const useMock = adapter.id === "mock";

  try {
    const items = await adapter.getYesterdaysActionEmails();
    return {
      status: "ok",
      data: {
        items,
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        windowLabel: "Ieri · solo richieste d’azione",
        isMock: useMock,
      },
    };
  } catch (err) {
    const raw = err instanceof Error ? err.message : "Email non disponibili";
    const message =
      adapter.id === "mock" ? raw : mailAuthMessage(raw);

    // Never silently substitute mock fixtures when a real source was requested.
    if (!useMock) {
      return {
        status: "error",
        message,
        data: {
          items: [],
          fetchedAt: new Date().toISOString(),
          sourceLabel: adapter.label,
          windowLabel: "Ieri · solo richieste d’azione",
          isMock: false,
        },
      };
    }

    return {
      status: "error",
      message: raw,
      data: {
        items: [],
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        windowLabel: "Ieri · solo richieste d’azione",
        isMock: true,
      },
    };
  }
}

export type {
  ActionEmailAdapter,
  ActionEmailItem,
  ActionEmailBriefing,
} from "./types";
