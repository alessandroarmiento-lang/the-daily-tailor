/**
 * iCloud Contacts via CardDAV — headless, works with Mac off.
 * Used only to match "real people" senders for actionable email filter.
 */
import { createDAVClient } from "tsdav";

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

export function hasIcloudCardDavCredentials(): boolean {
  return Boolean(
    (env("ICLOUD_CARDDAV_USER") || env("ICLOUD_MAIL_USER") || env("ICLOUD_CALDAV_USER")) &&
      (env("ICLOUD_CARDDAV_APP_PASSWORD") ||
        env("ICLOUD_MAIL_APP_PASSWORD") ||
        env("ICLOUD_CALDAV_APP_PASSWORD")),
  );
}

function cardDavAuth(): { username: string; password: string } | null {
  const username =
    env("ICLOUD_CARDDAV_USER") ||
    env("ICLOUD_MAIL_USER") ||
    env("ICLOUD_CALDAV_USER");
  const password =
    env("ICLOUD_CARDDAV_APP_PASSWORD") ||
    env("ICLOUD_MAIL_APP_PASSWORD") ||
    env("ICLOUD_CALDAV_APP_PASSWORD");
  if (!username || !password) return null;
  return { username, password };
}

/** Extract EMAIL lines from a vCard body. */
function emailsFromVcard(text: string): string[] {
  const out: string[] = [];
  const re = /^EMAIL[^:]*:(.+)$/gim;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const addr = m[1].trim().toLowerCase();
    if (addr.includes("@")) out.push(addr);
  }
  return out;
}

/**
 * Load contact email addresses from iCloud CardDAV.
 * Returns empty set (not throw) when credentials missing — filter still works
 * without Contacts match.
 */
export async function loadContactEmails(): Promise<Set<string>> {
  const auth = cardDavAuth();
  if (!auth) return new Set();

  try {
    const client = await createDAVClient({
      serverUrl: "https://contacts.icloud.com",
      credentials: auth,
      authMethod: "Basic",
      defaultAccountType: "carddav",
    });

    const addressBooks = await client.fetchAddressBooks();
    const emails = new Set<string>();

    for (const book of addressBooks) {
      const objects = await client.fetchVCards({ addressBook: book });
      for (const obj of objects) {
        const data = typeof obj.data === "string" ? obj.data : "";
        for (const e of emailsFromVcard(data)) emails.add(e);
      }
    }
    return emails;
  } catch {
    // Contacts enricher is best-effort; never block the edition.
    return new Set();
  }
}
