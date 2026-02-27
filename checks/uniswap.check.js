export async function run(page) {

  console.log("🌐 Opening Uniswap...");

  await page.goto("https://app.uniswap.org/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(4000);

  console.log("✅ Uniswap loaded");
}