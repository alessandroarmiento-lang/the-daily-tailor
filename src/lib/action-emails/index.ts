import { config } from "@/lib/config";
import { AppleMailActionEmailAdapter } from "./applemail";
import { ImapActionEmailAdapter } from "./imap-stub";
import { MockActionEmailAdapter } from "./mock";
import type {
  ActionEmailAdapter,
  ActionEmailBriefing,
  SectionResult,
} from "./types";

function resolveAdapter(): ActionEmailAdapter {
  switch (config.actionEmails.source) {
    case "applemail":
      return new AppleMailActionEmailAdapter();
    case "imap":
      return new ImapActionEmailAdapter();
    case "mock":
      return new MockActionEmailAdapter();
    default:
      return new MockActionEmailAdapter();
  }
}

export async function getActionEmails(): Promise<
  SectionResult<ActionEmailBriefing>
> {
  const adapter = resolveAdapter();
  try {
    const items = await adapter.getYesterdaysActionEmails();
    return {
      status: "ok",
      data: {
        items,
        fetchedAt: new Date().toISOString(),
        sourceLabel: adapter.label,
        windowLabel: "Ieri · solo richieste d’azione",
        isMock: adapter.id === "mock",
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Email non disponibili";
    const fallback = new MockActionEmailAdapter();
    const items = await fallback.getYesterdaysActionEmails();
    return {
      status: "error",
      message,
      data: {
        items,
        fetchedAt: new Date().toISOString(),
        sourceLabel: fallback.label,
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
