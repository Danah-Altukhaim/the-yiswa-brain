/**
 * Single entry-point that dispatches based on CRON_JOB env var.
 * Railway cron schedules each job with its own variable.
 */
import { runPublishCron } from "./publish.js";
import { runExpireCron } from "./expire.js";
import { runGapScanCron } from "./gap-scan.js";
import { runWeeklyPdfCron } from "./weekly-pdf.js";

const job = process.env.CRON_JOB;
const dispatch: Record<string, () => Promise<void>> = {
  publish: runPublishCron,
  expire: runExpireCron,
  "gap-scan": runGapScanCron,
  "weekly-pdf": runWeeklyPdfCron,
};

async function main() {
  if (!job || !(job in dispatch)) {
    console.error(`Unknown CRON_JOB: ${job}. Expected one of: ${Object.keys(dispatch).join(", ")}`);
    process.exit(1);
  }
  const started = Date.now();
  await dispatch[job]();
  console.log(`cron ${job} done in ${Date.now() - started}ms`);
}

main().catch((err) => {
  console.error(JSON.stringify({
    level: "error",
    job,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
    timestamp: new Date().toISOString(),
  }));
  process.exit(1);
});
