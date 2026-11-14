import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { HealthBriefing } from "./types";

export const PUSHED_HEALTH_SCHEMA = 1;
const MAX_AGE_HOURS = 36;

export type PushedHealthSnapshot = {
  schemaVersion: number;
  receivedAt: string;
  deviceLabel: string;
  briefing: HealthBriefing;
};

function snapshotRoot(): string {
  const override = process.env.EDITIONS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "editions");
}

function snapshotPath(): string {
  return path.join(snapshotRoot(), "pushed-health.json");
}

export async function savePushedHealth(
  briefing: HealthBriefing,
  deviceLabel = "Mac",
): Promise<PushedHealthSnapshot> {
  const snapshot: PushedHealthSnapshot = {
    schemaVersion: PUSHED_HEALTH_SCHEMA,
    receivedAt: new Date().toISOString(),
    deviceLabel: deviceLabel.slice(0, 40) || "Mac",
    briefing,
  };
  const root = snapshotRoot();
  await mkdir(root, { recursive: true });
  await writeFile(snapshotPath(), `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  return snapshot;
}

export async function loadPushedHealth(): Promise<PushedHealthSnapshot | null> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const parsed = JSON.parse(raw) as PushedHealthSnapshot;
    if (parsed?.schemaVersion !== PUSHED_HEALTH_SCHEMA) return null;
    if (!parsed.briefing?.lines?.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isPushedHealthFresh(snapshot: PushedHealthSnapshot): boolean {
  const age = Date.now() - Date.parse(snapshot.receivedAt);
  return Number.isFinite(age) && age >= 0 && age < MAX_AGE_HOURS * 3_600_000;
}
