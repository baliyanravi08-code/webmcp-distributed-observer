import "dotenv/config";
import { pathToFileURL } from "url";

import { GodarkClient, Environment } from "@godark/sdk";
import { logEvent } from "../../shared/logger.js";

/*
 * Leverage limits check (testnet).
 *
 *   1. connect and read the current leverage from the WebSocket push
 *   2. set the minimum (1x)            -> must be accepted
 *   3. set the maximum (10x)           -> must be accepted
 *   4. try maximum + 1 (11x)           -> must be REJECTED (LEVERAGE_EXCEEDS_MAX)
 *   5. restore the leverage you had before the check
 *
 * NOTE: this briefly changes a real setting on your testnet account.
 * Step 5 always runs if anything was changed.
 *
 * The SDK forces any value below 1 up to 1 before sending, so a "0x" test
 * through the SDK can't be done and is intentionally left out.
 *
 * Optional .env values:
 *   GODARK_TEST_SYMBOL        default BTC-USDC-PERP
 *   GODARK_MIN_LEVERAGE       default 1
 *   GODARK_MAX_LEVERAGE       default 10
 *   GODARK_RESTORE_LEVERAGE   default 10 (used only if the current value can't be read)
 */

const TARGET = "godark-leverage";
const SYMBOL = process.env.GODARK_TEST_SYMBOL || "BTC-USDC-PERP";
const MIN_LEVERAGE = Number(process.env.GODARK_MIN_LEVERAGE || 1);
const MAX_LEVERAGE = Number(process.env.GODARK_MAX_LEVERAGE || 10);
const FALLBACK_RESTORE = Number(process.env.GODARK_RESTORE_LEVERAGE || 10);
const PUSH_WAIT_MS = 2000;
const INITIAL_PUSH_WAIT_MS = 2500;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function timed(name, fn) {
  const t = Date.now();

  try {
    const info = await fn();
    return { name, ok: true, ms: Date.now() - t, info: info ?? "" };
  } catch (error) {
    return { name, ok: false, ms: Date.now() - t, error: error.message };
  }
}

const isOrderRejection = (e) =>
  e?.constructor?.name === "OrderError" || e?.errorCode !== undefined;

const describeError = (e) =>
  `${e.errorCode ?? "no code"}: ${String(e.message).slice(0, 90)}`;

export async function run() {
  const start = Date.now();
  const taskId = `leverage-${start}`;
  const checks = [];

  const latestById = new Map();      // symbolId -> leverage seen in pushes
  const pushCountById = new Map();   // symbolId -> number of pushes seen

  let symbolId = null;
  let original = null;               // leverage before we touched anything
  let current = null;                // leverage we last set
  let dirty = false;                 // true once we changed anything
  let pushesWorking = true;          // flips off if a change gets no confirming push

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

  const client = new GodarkClient({
    environment: Environment.Testnet,
    apiKeyId: process.env.GODARK_API_KEY_ID,
    apiSecret: process.env.GODARK_API_SECRET,
    passphrase: process.env.GODARK_PASSPHRASE,
    autoReconnect: true,
    ...(process.env.GODARK_EDGE_URL
      ? { baseUrl: process.env.GODARK_EDGE_URL }
      : {}),
    onError: () => {}
  });

  // Registered before connect() so the opening burst of pushes isn't missed.
  client.onLeverageSettings((s) => {
    for (const row of s?.settings ?? []) {
      const id = Number(row.symbolId);
      latestById.set(id, Number(row.leverage));
      pushCountById.set(id, (pushCountById.get(id) ?? 0) + 1);
    }
  });

  /* Change leverage and (when pushes work) confirm the push agrees. */
  const setLeverage = async (value) => {
    const before = pushCountById.get(symbolId) ?? 0;

    await client.updateLeverage(SYMBOL, value); // throws if rejected
    dirty = true;
    current = value;

    if (!pushesWorking || symbolId === null) return "accepted";

    const deadline = Date.now() + PUSH_WAIT_MS;
    while (
      Date.now() < deadline &&
      (pushCountById.get(symbolId) ?? 0) === before
    ) {
      await sleep(50);
    }

    if ((pushCountById.get(symbolId) ?? 0) === before) {
      pushesWorking = false;
      return "accepted (no confirming push)";
    }

    const seen = latestById.get(symbolId);
    if (seen !== value) {
      throw new Error(
        `accepted, but the pushed leverage is ${seen}x instead of ${value}x`
      );
    }

    return "accepted · confirmed by push";
  };

  try {
    /* ---------- 1. connect + read current leverage ---------- */

    record(await timed("connect", async () => {
      await client.connect();

      try {
        symbolId = Number(client._resolveSymbol(SYMBOL));
      } catch {
        symbolId = SYMBOL === "BTC-USDC-PERP" ? 1 : null;
      }

      const deadline = Date.now() + INITIAL_PUSH_WAIT_MS;
      while (
        Date.now() < deadline &&
        (symbolId === null || !latestById.has(symbolId))
      ) {
        await sleep(100);
      }

      if (symbolId !== null && latestById.has(symbolId)) {
        original = latestById.get(symbolId);
        return `current leverage ${original}x`;
      }

      return `current leverage not received (will restore to ${FALLBACK_RESTORE}x)`;
    }));

    if (checks[0].ok) {
      /* ---------- 2. minimum ---------- */

      record(await timed(`set ${MIN_LEVERAGE}x`, () => setLeverage(MIN_LEVERAGE)));

      /* ---------- 3. maximum ---------- */

      record(await timed(`set ${MAX_LEVERAGE}x`, () => setLeverage(MAX_LEVERAGE)));

      /* ---------- 4. above maximum must be rejected ---------- */

      const tooHigh = MAX_LEVERAGE + 1;

      record(await timed(`${tooHigh}x rejected`, async () => {
        try {
          await client.updateLeverage(SYMBOL, tooHigh);
        } catch (e) {
          if (!isOrderRejection(e)) throw e; // a real failure, not a rejection

          const text = `${e.errorCode ?? ""} ${e.message ?? ""}`;
          const expected = /LEVERAGE_EXCEEDS_MAX|\b2008\b/.test(text);

          return expected
            ? `rejected: ${describeError(e)}`
            : `rejected, but not with LEVERAGE_EXCEEDS_MAX -> ${describeError(e)}`;
        }

        dirty = true;
        current = tooHigh;
        throw new Error(`${tooHigh}x was ACCEPTED (limit is ${MAX_LEVERAGE}x)`);
      }));
    }
  } catch (error) {
    record({ name: "unexpected error", ok: false, ms: 0, error: error.message });
  }

  /* ---------- 5. always put the account back ---------- */

  const restoreTo = original ?? FALLBACK_RESTORE;

  if (dirty && current !== restoreTo) {
    record(await timed(`restore to ${restoreTo}x`, async () => {
      const info = await setLeverage(restoreTo);
      return info;
    }));
  }

  await client.disconnect().catch(() => {});
  console.log("🔌 GoDark leverage check disconnected");

  const passed = checks.filter((c) => c.ok).length;
  const durationMs = Date.now() - start;

  const result = {
    status: passed === checks.length ? "healthy" : "unhealthy",
    passed,
    total: checks.length,
    responseTimeMs: durationMs,
    symbol: SYMBOL,
    originalLeverage: original,
    finalLeverage: dirty ? current : original,
    checks
  };

  logEvent({
    target: TARGET,
    taskId,
    event: "result",
    status: result.status,
    durationMs,
    detail: { passed, total: checks.length, originalLeverage: original, finalLeverage: result.finalLeverage }
  });

  return result;
}

// Allow `node checks/godark/leverage-check.js` to run it directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run()
    .then((r) => {
      const lev = (v) => (v == null ? "unknown" : `${v}x`);
      console.log(`\nPassed ${r.passed}/${r.total}   (started at ${lev(r.originalLeverage)}, ended at ${lev(r.finalLeverage)})`);
      for (const c of r.checks) {
        console.log(
          `${c.ok ? "✅" : "❌"} ${c.name.padEnd(22)} ${String(c.ms).padStart(5)} ms  ${c.ok ? c.info : c.error}`
        );
      }
      process.exitCode = r.status === "healthy" ? 0 : 1;
    })
    .catch((e) => {
      console.error("Leverage check crashed:", e.message);
      process.exitCode = 1;
    });
}