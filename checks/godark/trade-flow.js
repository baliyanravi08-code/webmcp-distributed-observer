import "dotenv/config";
import { pathToFileURL } from "url";

import { GodarkClient, Environment } from "@godark/sdk";
import { logEvent } from "../../shared/logger.js";

/*
 * Trade-flow check (testnet):
 *   connect -> subscribe(orders) -> place far-from-market post-only LIMIT SELL
 *   -> wait for OPEN update -> cancel it -> wait for CANCELLED update -> disconnect
 *
 * Built from the SDK's own quickstart. Nothing should ever fill: the sell is
 * placed ~3% above the reference price and is post-only (rejected instead of
 * trading if it would cross the book).
 *
 * Optional .env values:
 *   GODARK_TEST_SYMBOL   default BTC-USDC-PERP
 *   GODARK_TEST_SIZE     default 0.01
 *   GODARK_E2E_PRICE     rough current price, default 85000
 */

const TARGET = "godark-trade-flow";
const SYMBOL = process.env.GODARK_TEST_SYMBOL || "BTC-USDC-PERP";
const SIZE = Number(process.env.GODARK_TEST_SIZE || 0.01);
const REF_PRICE = Number(process.env.GODARK_E2E_PRICE || 85000);
// Exchange rejects orders >10% from its oracle price, so stay close (3% like the SDK quickstart).
const SELL_PRICE = Math.round(REF_PRICE * 1.03 * 10) / 10;
const STEP_TIMEOUT_MS = 15000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function run() {
  const start = Date.now();
  const taskId = `trade-flow-${start}`;
  const steps = {};
  const updatesByOrder = new Map(); // orderId -> [OrderUpdate, ...]

  const log = (event, extra = {}) =>
    logEvent({ target: TARGET, taskId, event, ...extra });

  const client = new GodarkClient({
    environment: Environment.Testnet,
    apiKeyId: process.env.GODARK_API_KEY_ID,
    apiSecret: process.env.GODARK_API_SECRET,
    passphrase: process.env.GODARK_PASSPHRASE,
    autoReconnect: true,
    ...(process.env.GODARK_EDGE_URL
      ? { baseUrl: process.env.GODARK_EDGE_URL }
      : {}),
    onError: (err) => log("step", { detail: { step: "sdk_warning", message: err.message } })
  });

  // Collect every order update, keyed by order id (they can arrive before the ack returns).
  client.onOrderUpdate((u) => {
    const list = updatesByOrder.get(u.orderId) ?? [];
    list.push(u);
    updatesByOrder.set(u.orderId, list);
    log("step", { detail: { step: "order_update", orderId: u.orderId, status: u.status } });
  });

  const waitForStatus = async (orderId, wanted) => {
    const deadline = Date.now() + STEP_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const list = updatesByOrder.get(orderId) ?? [];
      const hit = list.find((u) => wanted.includes(String(u.status).toUpperCase()));
      if (hit) return hit;
      await sleep(100);
    }
    return null;
  };

  let orderId = null;

  try {
    log("start", { detail: { symbol: SYMBOL, size: SIZE, sellPrice: SELL_PRICE } });

    // 1. connect + subscribe
    let t = Date.now();
    await client.connect();
    await client.subscribe(["orders"]);
    steps.connectMs = Date.now() - t;
    log("step", { detail: { step: "connected", ms: steps.connectMs, userUuid: client.userUuid } });

    // 2. place far-from-market post-only LIMIT SELL
    t = Date.now();
    const ack = await client.placeOrder({
      symbol: SYMBOL,
      side: "SELL",
      orderType: "LIMIT",
      price: SELL_PRICE,
      quantity: SIZE,
      postOnly: true,
      confirmation: "ack"
    });
    orderId = ack.orderId;
    steps.placeAckMs = Date.now() - t;
    log("step", { detail: { step: "order_placed", orderId, success: ack.success, ms: steps.placeAckMs } });

    if (!ack.success) {
      throw new Error(`Order rejected: ${ack.errorCode ?? ""} ${ack.error ?? ""}`.trim());
    }

    // 3. wait until the exchange says it's resting on the book
    t = Date.now();
    const open = await waitForStatus(orderId, ["OPEN", "NEW", "RESTING"]);
    steps.openSeenMs = Date.now() - t;
    if (!open) throw new Error("No OPEN order update received in time");

    // 4. cancel (short pause avoids CANCEL_TOO_SOON, same as the quickstart)
    await sleep(500);
    t = Date.now();
    const cancelAck = await client.cancelOrder(orderId, SYMBOL);
    steps.cancelAckMs = Date.now() - t;
    log("step", { detail: { step: "cancel_sent", orderId, success: cancelAck.success, ms: steps.cancelAckMs } });

    // 5. confirm it actually reached CANCELLED
    t = Date.now();
    const cancelled = await waitForStatus(orderId, ["CANCELLED", "CANCELED"]);
    steps.cancelConfirmMs = Date.now() - t;
    if (!cancelled) throw new Error("No CANCELLED order update received in time");

    const durationMs = Date.now() - start;
    const result = {
      status: "healthy",
      orderId,
      symbol: SYMBOL,
      responseTimeMs: durationMs,
      steps
    };
    log("result", { status: "healthy", durationMs, detail: result });
    return result;
  } catch (error) {
    // Never leave a test order resting on the book.
    try {
      await client.cancelAllOrders(SYMBOL);
    } catch {
      /* best effort */
    }

    const durationMs = Date.now() - start;
    log("error", {
      status: "failed",
      durationMs,
      detail: { message: error.message, orderId, steps }
    });

    return {
      status: "failed",
      error: error.message,
      orderId,
      responseTimeMs: durationMs,
      steps
    };
  } finally {
    await client.disconnect().catch(() => {});
    console.log("🔌 GoDark trading session disconnected");
  }
}

// Allow `node checks/godark/trade-flow.js` to run it directly.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run().then((r) => {
    console.log("RESULT:", JSON.stringify(r, null, 2));
    process.exitCode = r.status === "healthy" ? 0 : 1;
  });
}