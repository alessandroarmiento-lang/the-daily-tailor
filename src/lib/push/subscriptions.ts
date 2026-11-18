import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type PushSubscriptionJSON = {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
};

type StoredFile = {
  updatedAt: string;
  subscriptions: PushSubscriptionJSON[];
};

function storeRoot(): string {
  const override = process.env.EDITIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "editions");
}

function storePath(): string {
  return path.join(storeRoot(), "push-subscriptions.json");
}

async function readStore(): Promise<StoredFile> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as StoredFile;
    if (!Array.isArray(parsed.subscriptions)) {
      return { updatedAt: new Date().toISOString(), subscriptions: [] };
    }
    return parsed;
  } catch {
    return { updatedAt: new Date().toISOString(), subscriptions: [] };
  }
}

async function writeStore(subscriptions: PushSubscriptionJSON[]): Promise<void> {
  const root = storeRoot();
  await mkdir(root, { recursive: true });
  const body: StoredFile = {
    updatedAt: new Date().toISOString(),
    subscriptions,
  };
  await writeFile(storePath(), `${JSON.stringify(body, null, 2)}\n`, "utf8");
}

export async function listPushSubscriptions(): Promise<PushSubscriptionJSON[]> {
  const store = await readStore();
  return store.subscriptions;
}

export async function savePushSubscription(
  sub: PushSubscriptionJSON,
): Promise<void> {
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("Invalid push subscription");
  }
  const store = await readStore();
  const next = store.subscriptions.filter((s) => s.endpoint !== sub.endpoint);
  next.push({
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });
  await writeStore(next);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const store = await readStore();
  await writeStore(store.subscriptions.filter((s) => s.endpoint !== endpoint));
}
