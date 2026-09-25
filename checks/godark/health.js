export async function run(page) {
  const start = Date.now();

  console.log("🌐 Opening GoDark Testnet...");

  await page.goto("https://app.godark-dex.com/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(4000);

  const title = await page.title();
  const url = page.url();

  // Basic page availability check
  if (!url.includes("godark-dex.com")) {
    throw new Error(`Unexpected URL: ${url}`);
  }

  // Look for visible trading interface content.
  const bodyText = await page.locator("body").innerText();

  const hasTradingContent =
    bodyText.includes("BTC") ||
    bodyText.includes("USDC") ||
    bodyText.includes("Order") ||
    bodyText.includes("Market");

  if (!hasTradingContent) {
    throw new Error("GoDark trading interface content was not detected");
  }

  const duration = Date.now() - start;

  console.log("✅ GoDark Testnet is available");
  console.log(`📄 Title: ${title}`);
  console.log(`🔗 URL: ${url}`);
  console.log(`⏱️ Check duration: ${duration} ms`);
  console.log("📊 Trading interface content detected");
}