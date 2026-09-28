import "dotenv/config";
import { pathToFileURL } from "url";

import { GodarkRestClient } from "@godark/sdk";
import { logEvent } from "../../shared/logger.js";

/*
 * Endpoint check (testnet), read-only:
 *   public  : funding rates, open interest, volume  (no login needed)
 *   private : account, open orders (needs login)
 *
 * Every endpoint is timed and reported on its own, so one failing
 * endpoint doesn't hide the others.
 *
 * GET /api/v1/leverage is not checked here: the server only allows POST on
 * that route (405, Allow: POST). Setting leverage is covered by leverage-check.js.
 */

const TARGET = "godark-endpoints";

async function timed(name, fn) {
  const t = Date.now();

  try {
    const info = await fn();
    return { name, ok: true, ms: Date.now() - t, info: info ?? "" };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - t, error: error.message };
  }
}

export async function run() {
  const start = Date.now();
  const taskId = `endpoints-${start}`;
  const checks = [];

  const record = (check) => {
    checks.push(check);
    logEvent({
      target: TARGET,
      taskId,
      event: "step",
      status: check.ok ? "healthy" : "failed",
      durationMs: check.ms,
      detail: check
    });
  };

  const client = new GodarkRestClient({
    apiKeyId: process.env.GODARK_API_KEY_ID,
    apiSecret: process.env.GODARK_API_SECRET,
    passphrase: process.env.GODARK_PASSPHRASE,
    restBaseUrl: process.env.GODARK_EDGE_URL
  });

  try {
    /* ---------- public endpoints ---------- */

    record(await timed("funding rates", async () => {
      const rows = await client.getFundingRates();
      return `${rows.length} symbols`;
    }));

    record(await timed("open interest", async () => {
      const rows = await client.getOpenInterest();
      return `${rows.length} symbols`;
    }));

    record(await timed("volume", async () => {
      const vol = await client.getVolume();
      const n = Array.isArray(vol?.symbols) ? vol.symbols.length : 0;
      return `${n} symbols`;
    }));

    /* ---------- private endpoints ---------- */

    const login = await timed("login", async () => {
      await client.connect();
      return "token ok";
    });
    record(login);

    if (login.ok) {
      record(await timed("account", async () => {
        const account = await client.getAccount();
        return account?.account ? "account returned" : "empty account";
      }));

      record(await timed("open orders", async () => {
        const open = await client.getOpenOrders();
        return `${open.rows.length} open`;
      }));
    }

    const passed = checks.filter((c) => c.ok).length;
    const durationMs = Date.now() - start;

    const result = {
      status: passed === checks.length ? "healthy" : "unhealthy",
      passed,
      total: checks.length,
      responseTimeMs: durationMs,
      checks
    };

    logEvent({
      target: TARGET,
      taskId,
      event: "result",
      status: result.status,
      durationMs,
      detail: { passed, total: checks.length }
    });

    return result;
  } finally {
    await client.disconnect().catch(() => {});
    console.log("🔌 GoDark endpoint check disconnected");
  }
}

// Allow `node checks/godark/endpoints-health.js` to run it directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((r) => {
      console.log(`\nPassed ${r.passed}/${r.total}`);
      for (const c of r.checks) {
        console.log(
          `${c.ok ? "✅" : "❌"} ${c.name.padEnd(14)} ${String(c.ms).padStart(5)} ms  ${c.ok ? c.info : c.error}`
        );
      }
      process.exitCode = r.status === "healthy" ? 0 : 1;
    })
    .catch((e) => {
      console.error("Endpoint check crashed:", e.message);
      process.exitCode = 1;
    });
}