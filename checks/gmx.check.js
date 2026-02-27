export async function run(page) {

  console.log("🌐 Opening GMX...");

  await page.goto("https://app.gmx.io/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });

  await page.waitForTimeout(4000);

  console.log("✅ GMX loaded");
}