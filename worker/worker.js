import WebSocket from "ws";
import { logEvent } from "../shared/logger.js";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CDP_URL = "http://127.0.0.1:9222";
const CHROME_PROFILE = path.resolve(__dirname, "../chrome-profile");
const GODARK_URL = "https://app.godark-dex.com/";

const WS_URL = "ws://localhost:8080";

let ws;
let busy = false;
let heartbeat;

function send(data) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

/* ===========================
   START DEBUG CHROME IF NEEDED
=========================== */

async function chromeIsUp() {
  try {
    const res = await fetch(CDP_URL + "/json/version", {
      signal: AbortSignal.timeout(1500)
    });
    return res.ok;
  } catch {
    return false;
  }
}

function findChrome() {
  const candidates = [
    process.env.GODARK_CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    process.env.LOCALAPPDATA &&
      path.join(process.env.LOCALAPPDATA, "Google\\Chrome\\Application\\chrome.exe")
  ].filter(Boolean);

  return candidates.find((p) => existsSync(p));
}

async function ensureChrome() {
  if (await chromeIsUp()) {
    return;
  }

  const chromePath = findChrome();

  if (!chromePath) {
    throw new Error(
      "Chrome not found. Set GODARK_CHROME_PATH in .env to your chrome.exe path."
    );
  }

  console.log("🚀 Starting debug Chrome...");

  const child = spawn(
    chromePath,
    [
      "--remote-debugging-port=9222",
      "--remote-debugging-address=127.0.0.1",
      `--user-data-dir=${CHROME_PROFILE}`,
      GODARK_URL
    ],
    { detached: true, stdio: "ignore" }
  );

  child.unref();

  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if (await chromeIsUp()) {
      console.log("✅ Debug Chrome is ready");
      return;
    }
  }

  throw new Error("Chrome started but port 9222 did not open in 30s");
}

async function executeTask(task) {

  if (task.target === "godark-system-health") {
    const { run } = await import("../checks/godark/system-health.js");
    return await run();
  }

  if (task.target === "godark-api-health") {
    const { run } = await import("../checks/godark/api-health.js");
    return await run();
  }

  if (task.target === "godark-trade-flow") {
    const { run } = await import("../checks/godark/trade-flow.js");
    return await run();
  }

  if (task.target === "godark-endpoints") {
    const { run } = await import("../checks/godark/endpoints-health.js");
    return await run();
  }

  if (task.target === "godark-order-types") {
    const { run } = await import("../checks/godark/order-types-check.js");
    return await run();
  }

  if (task.target === "godark-leverage") {
    const { run } = await import("../checks/godark/leverage-check.js");
    return await run();
  }

  if (task.target === "godark") {
    console.log("🖥️ Checking GoDark UI...");

    const { chromium } = await import("playwright");
    const { run } = await import("../checks/godark/health.js");

    // Attach to the debug Chrome (started with port 9222, profile in chrome-profile)
    let browser;
    try {
      await ensureChrome();
      browser = await chromium.connectOverCDP(CDP_URL);
    } catch (err) {
      console.log("❌ CDP connect error:", err.message);
      return {
        status: "BLOCKED",
        message: "Cannot connect to Chrome on 9222: " + err.message.split("\n")[0]
      };
    }

    const context = browser.contexts()[0];

    // Reuse the tab you logged in on; only open a new one if none exists.
    let page = context.pages().find((p) => p.url().includes("godark-dex.com"));
    const reused = Boolean(page);
    if (!page) page = await context.newPage();

    await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {});

    try {
      return await run(page);
    } finally {
      // Only close a tab we opened ourselves. Chrome itself stays open.
      if (!reused) await page.close().catch(() => {});
      console.log("🛑 UI check finished.");
    }
  }

  throw new Error(`Unsupported target: ${task.target}`);
}

function connect() {

  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("✅ Connected to coordinator");
    send({ type: "STATUS", status: "IDLE" });

    clearInterval(heartbeat);
    heartbeat = setInterval(() => send({ type: "HEARTBEAT" }), 5000);
  });

  ws.on("message", async (msg) => {

    if (busy) {
      return;
    }

    let task;

    try {
      task = JSON.parse(msg.toString());
    } catch {
      console.log("❌ Invalid task received from coordinator");
      return;
    }

    busy = true;

    send({ type: "STATUS", status: "BUSY" });

    logEvent({ target: task.target, taskId: task.taskId, event: "start" });

    console.log("🧠 Executing:", task.target);

    try {

      const result = await executeTask(task);

      console.log("✅ Completed:", task.target);

      logEvent({
        target: task.target,
        taskId: task.taskId,
        event: "result",
        status: result?.status,
        detail: result
      });

      send({ type: "TASK_DONE", task, result });

    } catch (err) {

      console.log("❌ FAILED:", err.message);

      logEvent({
        target: task.target,
        taskId: task.taskId,
        event: "error",
        status: "failed",
        detail: { message: err.message }
      });

      send({ type: "TASK_FAILED", task, error: err.message });

    } finally {

      busy = false;

      send({ type: "STATUS", status: "IDLE" });
    }
  });

  ws.on("close", () => {
    clearInterval(heartbeat);
    console.log("🔄 Coordinator connection lost. Reconnecting...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => {
    console.log("❌ Coordinator WebSocket error:", err.message);
  });
}

connect();