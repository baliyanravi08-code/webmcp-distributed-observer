import "dotenv/config";
import { pathToFileURL } from "url";

import { GodarkClient, Environment } from "@godark/sdk";
import { logEvent } from "../../shared/logger.js";

/*
 * Order-types check (testnet). One small order per type on SYMBOL:
 *
 *   resting orders (must rest on the book, then cancel cleanly)
 *     - limit GTC
 *     - limit post-only
 *     - peg GTC
 *   non-fillable orders (must end with NO fill)
 *     - limit IOC  (buy far below market)
 *     - limit FOK  (buy far below market)
 *   must be rejected
 *     - limit reduce-only with no open position
 *
 *   - limit GTD (expiryTime = now + 1 day)
 *
 * Optional .env values:
 *   GODARK_TEST_SYMBOL          default BTC-USDC-PERP
 *   GODARK_TEST_SIZE            default 0.01
 *   GODARK_E2E_PRICE            rough current price, default 85000
 *   GODARK_GTD_EXPIRY_UNIT      "ns" (default), "ms" or "s" for expiryTime
 */

const TARGET = "godark-order-types";
const SYMBOL = process.env.GODARK_TEST_SYMBOL || "BTC-USDC-PERP";
const SIZE = Number(process.env.GODARK_TEST_SIZE || 0.01);
const REF_PRICE = Number(process.env.GODARK_E2E_PRICE || 85000);
const SELL_PRICE = Math.round(REF_PRICE * 1.03 * 10) / 10; // 3% above, never fills
const BUY_PRICE = Math.round(REF_PRICE * 0.97 * 10) / 10; // 3% below, never fills
const GTD_UNIT = (process.env.GODARK_GTD_EXPIRY_UNIT || "ns").toLowerCase();
const STEP_TIMEOUT_MS = 15000;

const OPEN_SET = ["OPEN", "NEW", "RESTING"];
const CANCEL_SET = ["CANCELLED", "CANCELED"];
const TERMINAL_SET = ["CANCELLED", "CANCELED", "EXPIRED", "REJECTED"];
const FILL_SET = ["FILLED", "PARTIALLY_FILLED", "PARTIAL_FILL"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run() {
  const start = Date.now();
  const taskId = `order-types-${start}`;
  const updatesByOrder = new Map();
  const checks = [];
  const skipped = [];

  const log = (event, extra = {}) =>
    logEvent({ target: TARGET, taskId, event, ...extra });

  const client = new GodarkClient({
    environment: Environment.Testnet,
    apiKeyId: process.env.GODARK_API_KEY_ID,
    apiSecret: process.env.GODARK_API_SECRET,
    passphrase: process.env.GODARK_PASSPHRASE,
    autoReconnect: true,
    ...(process.env.GODARK_EDGE_URL ? { baseUrl: process.env.GODARK_EDGE_URL } : {}),
    onError: (err) =>
      log("step", { detail: { step: "sdk_warning", message: err.message } })
  });

  client.onOrderUpdate((u) => {
    const list = updatesByOrder.get(u.orderId) ?? [];
    list.push(u);
    updatesByOrder.set(u.orderId, list);
  });

  const statusesOf = (orderId) =>
    (updatesByOrder.get(orderId) ?? []).map((u) => String(u.status).toUpperCase());

  const waitForStatus = async (orderId, wanted, timeoutMs = STEP_TIMEOUT_MS) => {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const hit = statusesOf(orderId).find((s) => wanted.includes(s));
      if (hit) return hit;
      await sleep(100);
    }
    return null;
  };

  // Place an order; never throws. Returns { orderId, ok, error }.
  const place = async (opts) => {
    try {
      const ack = await client.placeOrder({
        symbol: SYMBOL,
        quantity: SIZE,
        confirmation: "ack",
        ...opts
      });
      if (!ack.success) {
        return {
          orderId: ack.orderId ?? null,
          ok: false,
          error: `${ack.errorCode ?? ""} ${ack.error ?? ""}`.trim() || "rejected"
        };
      }
      return { orderId: ack.orderId, ok: true, error: null };
    } catch (err) {
      return {
        orderId: null,
        ok: false,
        error: `${err.code ?? ""} ${err.message ?? err}`.trim()
      };
    }
  };

  const quietCancel = async (orderId) => {
    if (!orderId) return;
    try {
      await client.cancelOrder(orderId, SYMBOL);
    } catch {
      /* best effort */
    }
  };

  /* ---------- test shapes ---------- */

  // Must rest on the book, then cancel cleanly.
  const expectResting = async (opts) => {
    const p = await place(opts);
    if (!p.ok) throw new Error(`rejected: ${p.error}`);
    try {
      if (!(await waitForStatus(p.orderId, OPEN_SET))) {
        throw new Error("no OPEN update received");
      }
      await sleep(500); // avoids CANCEL_TOO_SOON
      await client.cancelOrder(p.orderId, SYMBOL);
      if (!(await waitForStatus(p.orderId, CANCEL_SET))) {
        throw new Error("no CANCELLED update received");
      }
      return `rested · cancelled · order ${p.orderId}`;
    } catch (err) {
      await quietCancel(p.orderId);
      throw err;
    }
  };

  // Must end without a fill (rejected or cancelled/expired are both fine).
  const expectNoFill = async (opts) => {
    const p = await place(opts);
    if (!p.ok) return `rejected without fill (${p.error})`;
    const end = await waitForStatus(p.orderId, [...TERMINAL_SET, ...FILL_SET], 8000);
    const seen = statusesOf(p.orderId);
    if (seen.some((s) => FILL_SET.includes(s))) {
      throw new Error(`order filled unexpectedly (${seen.join(" > ")})`);
    }
    if (!end) {
      await quietCancel(p.orderId);
      throw new Error("no final status received");
    }
    return `ended ${end}, no fill · order ${p.orderId}`;
  };

  // Must be rejected by the exchange.
  const expectRejected = async (opts) => {
    const p = await place(opts);
    if (!p.ok) return `rejected: ${p.error}`;
    if (await waitForStatus(p.orderId, ["REJECTED"], 3000)) return "rejected by update";
    await quietCancel(p.orderId);
    throw new Error("accepted but should have been rejected");
  };

  const runCase = async (name, fn) => {
    const t = Date.now();
    try {
      const info = await fn();
      checks.push({ name, ok: true, ms: Date.now() - t, info });
    } catch (err) {
      checks.push({ name, ok: false, ms: Date.now() - t, error: err.message });
    }
    const last = checks[checks.length - 1];
    log("step", {
      status: last.ok ? "healthy" : "failed",
      detail: last
    });
    await sleep(300);
  };

  try {
    log("start", { detail: { symbol: SYMBOL, size: SIZE } });

    await client.connect();
    await client.subscribe(["orders"]);

    await runCase("limit GTC", () =>
      expectResting({
        side: "SELL",
        orderType: "LIMIT",
        timeInForce: "GTC",
        price: SELL_PRICE
      })
    );

    await runCase("limit post-only", () =>
      expectResting({
        side: "SELL",
        orderType: "LIMIT",
        price: SELL_PRICE,
        postOnly: true
      })
    );

    await runCase("peg GTC", () =>
      expectResting({
        side: "SELL",
        orderType: "PEG",
        timeInForce: "GTC",
        pegOffsetBps: 300
      })
    );

    const expiryMs = Date.now() + 24 * 60 * 60 * 1000;
    const expiryTime =
      GTD_UNIT === "s"
        ? Math.floor(expiryMs / 1000)
        : GTD_UNIT === "ms"
          ? expiryMs
          : expiryMs * 1e6; // nanoseconds (JSON prints this as a plain integer)

    await runCase("limit GTD", () =>
      expectResting({
        side: "SELL",
        orderType: "LIMIT",
        timeInForce: "GTD",
        price: SELL_PRICE,
        expiryTime
      })
    );

    await runCase("limit IOC (no fill)", () =>
      expectNoFill({
        side: "BUY",
        orderType: "LIMIT",
        timeInForce: "IOC",
        price: BUY_PRICE
      })
    );

    await runCase("limit FOK (no fill)", () =>
      expectNoFill({
        side: "BUY",
        orderType: "LIMIT",
        timeInForce: "FOK",
        price: BUY_PRICE
      })
    );

    await runCase("reduce-only, no position", () =>
      expectRejected({
        side: "SELL",
        orderType: "LIMIT",
        price: SELL_PRICE,
        reduceOnly: true
      })
    );
  } catch (error) {
    checks.push({ name: "setup", ok: false, ms: 0, error: error.message });
  } finally {
    try {
      await client.cancelAllOrders(SYMBOL); // never leave test orders behind
    } catch {
      /* best effort */
    }
    await client.disconnect().catch(() => {});
    console.log("🔌 GoDark order-types check disconnected");
  }

  const passed = checks.filter((c) => c.ok).length;
  const result = {
    status: checks.length > 0 && passed === checks.length ? "healthy" : "unhealthy",
    passed,
    total: checks.length,
    skipped,
    responseTimeMs: Date.now() - start,
    checks
  };
  log("result", { status: result.status, detail: result });
  return result;
}

// Allow `node checks/godark/order-types-check.js` to run it directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((r) => {
    console.log(`\nPassed ${r.passed}/${r.total}`);
    for (const c of r.checks) {
      console.log(
        `${c.ok ? "✅" : "❌"} ${c.name.padEnd(28)} ${String(c.ms).padStart(5)} ms  ${c.info ?? c.error}`
      );
    }
    for (const s of r.skipped) console.log(`⏭️  skipped: ${s}`);
    process.exitCode = r.status === "healthy" ? 0 : 1;
  });
}