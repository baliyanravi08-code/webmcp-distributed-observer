// checks/godark/health.js
// GoDark Trading UI check: trading screen, Balances, account menu.

const BASE_URL = "https://app.godark-dex.com/";
// The account dropdown shows the login email. Override in .env if it is not a gmail address,
// e.g. GODARK_EMAIL_PATTERN=@yourdomain\.com
const EMAIL_RE = new RegExp(process.env.GODARK_EMAIL_PATTERN || "@gmail\\.com", "i");

// Waits for an element to become visible. .first() avoids strict-mode errors
// when the text matches more than one element.
async function appears(locator, timeout) {
  try {
    await locator.first().waitFor({ state: "visible", timeout });
    return true;
  } catch {
    return false;
  }
}

// Waits for an element to go away (or to never be there). True if it is gone within `timeout` ms.
async function gone(locator, timeout) {
  try {
    await locator.first().waitFor({ state: "hidden", timeout });
    return true;
  } catch {
    return false;
  }
}

// True when the trading screen is fully drawn. First element gets `firstTimeout` ms, the rest 8 s.
async function tradingScreen(page, firstTimeout) {
  const buyButton = await appears(page.getByText("BUY / LONG", { exact: true }), firstTimeout);
  const orderBook = await appears(page.getByText("Reference Order Book", { exact: true }), 8000);
  // Sidebar labels are not always shown, so use the market name instead of "Trade".
  const marketName = await appears(page.getByText("BTC-USDC-PERP", { exact: true }), 8000);
  return buyButton && orderBook && marketName;
}

async function openAccountMenu(page) {
  const email = page.getByText(EMAIL_RE).first();
  if (await appears(email, 500)) return true; // already open

  // The email is only in the DOM after the top-right account button is clicked.
  // If both selectors miss, find the button with Playwright codegen and put its selector first.
  const candidates = [
    page.locator('button:has-text("Deposit")').first().locator("xpath=following-sibling::*[1]"),
    page.locator("header button").last(),
  ];
  for (const candidate of candidates) {
    await candidate.click({ timeout: 3000 }).catch(() => {});
    if (await appears(email, 2000)) return true;
  }
  return false;
}

export async function run(page) {
  console.log("🖥️ Checking GoDark UI...");

  // If the worker reused the tab you are logged in on, do not reload it: a reload can drop a
  // session that is only kept in memory. Only navigate when the tab is not on GoDark yet.
  const alreadyOnSite = page.url().includes("godark-dex.com");
  if (alreadyOnSite) {
    console.log("↩️  Reusing the open GoDark tab (no reload)");
  } else {
    try {
      await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
    } catch (err) {
      return { status: "unhealthy", message: `Page did not load: ${err.message}` };
    }
  }
  await page.bringToFront();

  // Give Cloudflare up to 15 s to clear.
  for (let i = 0; i < 15; i++) {
    const t = (await page.title().catch(() => "")).toLowerCase();
    if (!t.includes("just a moment")) break;
    await page.waitForTimeout(1000);
  }

  const title = await page.title().catch(() => "");
  console.log("🔎 URL:", page.url());
  console.log("🔎 Title:", title);

  if (title.toLowerCase().includes("just a moment")) {
    await page.screenshot({ path: "ui-debug.png" }).catch(() => {});
    return { status: "blocked", message: "Cloudflare verification is still present." };
  }

  // ---------- 1. Trading screen ----------
  let tradingPass = await tradingScreen(page, 40000);
  if (!tradingPass && alreadyOnSite) {
    console.log("🔁 Trading screen missing on the open tab, reloading once");
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    tradingPass = await tradingScreen(page, 40000);
  }
  console.log(tradingPass ? "✅ Trading screen: PASS" : "❌ Trading screen: FAIL");

  const bodyText = await page.locator("body").innerText().catch(() => "");
  const snippet = bodyText.slice(0, 200).replace(/\s+/g, " ");
  console.log("🔎 Page text:", bodyText.slice(0, 400).replace(/\s+/g, " "));

  // Logged-out session: the page shows "Start Trading" instead of the account area.
  // The page first draws a logged-out layout and loads the session a moment later,
  // so give "Start Trading" up to 20 s to disappear before deciding we are logged out.
  const loggedIn = await gone(page.getByText("Start Trading", { exact: true }), 20000);
  console.log(loggedIn ? "🔐 Session: logged in" : "🔐 Session: NOT logged in");
  if (!loggedIn) {
    await page.screenshot({ path: "ui-debug.png" }).catch(() => {});
    return {
      status: "blocked",
      message: `Not logged in. Log in once in the worker's Chrome window (chrome-profile). URL: ${page.url()}. Title: ${title}. Text: ${snippet}`,
    };
  }

  // Nothing else can pass if the trading screen is missing, so stop early.
  if (!tradingPass) {
    await page.screenshot({ path: "ui-debug.png" }).catch(() => {});
    return {
      status: "unhealthy",
      checks: { trading: false, balances: false, accountMenu: false },
      message: `Trading screen not visible. URL: ${page.url()}. Title: ${title}. Text: ${snippet}`,
    };
  }

  // ---------- 2. Balances ----------
  await page.getByText("Balances", { exact: true }).first().click({ timeout: 10000 }).catch(() => {});
  const currentAssets = await appears(page.getByText("Current Assets", { exact: true }), 8000);
  const txHistory = await appears(page.getByText("Transaction History", { exact: true }), 8000);
  const usdc = await appears(page.getByText("USDC", { exact: true }), 8000);
  const balancesPass = currentAssets && txHistory && usdc;
  console.log(balancesPass ? "✅ Balances: PASS" : "❌ Balances: FAIL");

  // Leave the Balances view: try Escape, and reload if the trading screen is not back.
  await page.keyboard.press("Escape").catch(() => {});
  if (!(await appears(page.getByText("BUY / LONG", { exact: true }), 2000))) {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
    await appears(page.getByText("BUY / LONG", { exact: true }), 20000);
  }

  // ---------- 3. Account menu ----------
  const menuOpen = await openAccountMenu(page);
  const logOut = await appears(page.getByText("Log Out", { exact: true }), 3000);
  const accountMenuPass = menuOpen && logOut;
  console.log(accountMenuPass ? "✅ Account menu: PASS" : "❌ Account menu: FAIL");
  await page.keyboard.press("Escape").catch(() => {});

  const checks = { trading: tradingPass, balances: balancesPass, accountMenu: accountMenuPass };
  const failed = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const allPassed = failed.length === 0;

  if (!allPassed) await page.screenshot({ path: "ui-debug.png" }).catch(() => {});

  return {
    status: allPassed ? "healthy" : "unhealthy",
    checks,
    message: allPassed
      ? "All UI sections OK"
      : `Failed: ${failed.join(", ")}. URL: ${page.url()}. Title: ${title}`,
  };
}