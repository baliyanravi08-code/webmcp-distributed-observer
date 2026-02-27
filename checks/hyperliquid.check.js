export async function run(page) {

  console.log("🌐 Opening Hyperliquid...");

  await page.goto("https://app.hyperliquid.xyz/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(4000);

  console.log("✅ Hyperliquid loaded");
}