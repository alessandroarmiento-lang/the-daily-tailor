import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export function macosScriptsDir(): string {
  return path.join(process.cwd(), "scripts", "macos");
}

export async function runOsascriptJson<T>(
  scriptName: string,
  args: string[] = [],
  timeoutMs = 120_000,
): Promise<T> {
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
    // Surface TCC / Automation denials clearly for UI.
    if (/not authorized|-1743|not allowed to send|osascript.*failed/i.test(msg)) {
      throw new Error(
        `Permesso Automazione mancante per ${scriptName}: ${msg.slice(0, 200)}`,
      );
    }
    throw err instanceof Error ? err : new Error(msg);
  }
}
