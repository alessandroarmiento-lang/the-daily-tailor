import { defaultAppleHealthDir, summarizeHealthDir } from "../../src/lib/health/summarize";

const dateKey = process.argv[2];
if (!dateKey || !/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
  console.error("Usage: print-health-summary.ts YYYY-MM-DD");
  process.exit(1);
}

summarizeHealthDir(defaultAppleHealthDir(), dateKey)
  .then((brief) => {
    if (!brief || brief.lines.length === 0) {
      console.error("Nessuna riga salute per", dateKey);
      process.exit(2);
    }
    process.stdout.write(JSON.stringify({ lines: brief.lines }));
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
