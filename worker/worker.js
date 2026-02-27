import WebSocket from "ws";
import chalk from "chalk";
import { chromium } from "playwright";

const WS_URL = "ws://localhost:8080";

let ws;
let browser;
let context;
let page;

let busy = false;
let ready = false;

/* ===========================
   START BROWSER SAFELY
=========================== */

async function initBrowser() {

  console.log("🚀 Launching browser...");

  browser = await chromium.launch({
    headless: false,
    slowMo: 200
  });

  context = await browser.newContext();
  page = await context.newPage();

  await page.goto("about:blank");

  ready = true;

  console.log("✅ Browser READY");
}

/* ===========================
   SAFE SEND
=========================== */

function send(data) {
  if (ws?.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/* ===========================
   CONNECT
=========================== */

function connect() {

  ws = new WebSocket(WS_URL);

  ws.on("open", () => {
    console.log("✅ Connected to coordinator");
    send({ type: "STATUS", status: "IDLE" });
  });

  ws.on("message", async (msg) => {

    if (!ready) {
      console.log("⏳ Browser not ready yet");
      return;
    }

    if (busy) return;

    const task = JSON.parse(msg.toString());

    busy = true;
    send({ type: "STATUS", status: "BUSY" });

    console.log("📥 Executing:", task.target);

    try {

      if (task.target === "hyperliquid") {
        await page.goto("https://app.hyperliquid.xyz/", {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
      }

      if (task.target === "gmx") {
        await page.goto("https://app.gmx.io/", {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
      }

      if (task.target === "uniswap") {
        await page.goto("https://app.uniswap.org/", {
          waitUntil: "domcontentloaded",
          timeout: 60000
        });
      }

      console.log("✅ Loaded:", task.target);

      send({
        type: "TASK_DONE",
        task
      });

    } catch (err) {

      console.log("❌ FAILED:", err.message);

      send({
        type: "TASK_FAILED",
        task
      });
    }

    busy = false;
    send({ type: "STATUS", status: "IDLE" });
  });

  ws.on("close", () => {
    console.log("🔄 Reconnecting...");
    setTimeout(connect, 3000);
  });
}

/* ===========================
   BOOT SEQUENCE
=========================== */

(async () => {
  await initBrowser();   // ⭐ WAIT FIRST
  connect();             // ⭐ CONNECT AFTER READY
})();