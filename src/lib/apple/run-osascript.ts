import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";

const execFileAsync = promisify(execFile);

/** Serialize all osascript / EventKit CLI calls — parallel AppleScript hangs on macOS. */
let appleGate: Promise<void> = Promise.resolve();

function withAppleGate<T>(fn: () => Promise<T>): Promise<T> {
  const run = appleGate.then(fn, fn);
  appleGate = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function macosScriptsDir(): string {
  return path.join(process.cwd(), "scripts", "macos");
}

export function macosBinDir(): string {
  return path.join(macosScriptsDir(), "bin");
}

export async function runOsascriptJson<T>(
  scriptName: string,
  args: string[] = [],
  timeoutMs = 120_000,
): Promise<T> {
  return withAppleGate(async () => {
    const scriptPath = path.join(macosScriptsDir(), scriptName);
    try {
      const { stdout, stderr } = await execFileAsync(
        "/usr/bin/osascript",
        [scriptPath, ...args],
        {
          timeout: timeoutMs,
          maxBuffer: 4 * 1024 * 1024,
          env: process.env,
        },
      );

      const text = stdout.trim();
      if (!text) {
        throw new Error(
          `osascript ${scriptName}: empty stdout${stderr ? ` (${stderr.trim()})` : ""}`,
        );
      }

      try {
        return JSON.parse(text) as T;
      } catch {
        throw new Error(
          `osascript ${scriptName}: invalid JSON: ${text.slice(0, 240)}`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not authorized|-1743|not allowed to send|osascript.*failed/i.test(msg)) {
        throw new Error(
          `Permesso Automazione mancante per ${scriptName}: ${msg.slice(0, 200)}`,
        );
      }
      throw err instanceof Error ? err : new Error(msg);
    }
  });
}

/**
 * Run a compiled EventKit helper from scripts/macos/bin/.
 * Returns parsed JSON.
 */
export async function runEventKitBinJson<T>(
  binName: string,
  args: string[] = [],
  timeoutMs = 60_000,
): Promise<T> {
  return withAppleGate(async () => {
    const binPath = path.join(macosBinDir(), binName);
    try {
      await access(binPath, fsConstants.X_OK);
    } catch {
      throw new Error(
        `EventKit tool mancante: ${binPath}. Esegui scripts/macos/build-eventkit-tools.sh`,
      );
    }

    try {
      const { stdout, stderr } = await execFileAsync(binPath, args, {
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: process.env,
      });
      const text = stdout.trim();
      if (!text) {
        throw new Error(
          `${binName}: empty stdout${stderr ? ` (${stderr.trim()})` : ""}`,
        );
      }
      return JSON.parse(text) as T;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw err instanceof Error ? err : new Error(msg);
    }
  });
}
