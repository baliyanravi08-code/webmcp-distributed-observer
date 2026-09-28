import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

/* =========================================================
   PATHS
========================================================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// logs/ sits next to shared/ at the project root
const LOG_DIR = path.join(__dirname, "../logs");

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/* =========================================================
   FILE PER DAY
========================================================= */

function logFilePath() {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOG_DIR, `${date}.jsonl`);
}

function writeLine(entry) {
  fs.appendFileSync(logFilePath(), JSON.stringify(entry) + "\n");
}

/* =========================================================
   PUBLIC API
========================================================= */

/**
 * Logs one structured event to disk (JSON Lines) and to console.
 *
 * @param {Object} opts
 * @param {string} opts.target     - e.g. "godark-trade-flow"
 * @param {string} [opts.taskId]
 * @param {number} [opts.workerId]
 * @param {"start"|"step"|"result"|"error"} opts.event
 * @param {string} [opts.status]   - "healthy" | "unhealthy" | "blocked" | "failed"
 * @param {number} [opts.durationMs]
 * @param {Object} [opts.detail]   - anything else worth keeping (balances, order ids, etc.)
 */
export function logEvent({
  target,
  taskId,
  workerId,
  event,
  status,
  durationMs,
  detail
}) {
  const entry = {
    ts: new Date().toISOString(),
    target,
    taskId,
    workerId,
    event,
    status,
    durationMs,
    detail
  };

  writeLine(entry);

  const tag = status ? `[${status.toUpperCase()}]` : "";
  console.log(
    `📝 ${entry.ts} ${target ?? ""} ${event} ${tag}`,
    detail ?? ""
  );

  return entry;
}

/**
 * Reads back the last N lines from today's (or a given date's) log file.
 * Useful for a "recent activity" panel on the dashboard.
 */
export function readRecentLogs(limit = 50, date) {
  const file = date
    ? path.join(LOG_DIR, `${date}.jsonl`)
    : logFilePath();

  if (!fs.existsSync(file)) {
    return [];
  }

  const lines = fs
    .readFileSync(file, "utf-8")
    .trim()
    .split("\n")
    .filter(Boolean);

  return lines
    .slice(-limit)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}