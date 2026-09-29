# 🧠 WebMCP Distributed Observer

A distributed, self-healing monitoring platform for the **GoDark DEX (testnet)**. A central **coordinator** schedules checks across the API, order-placement flow, and live trading UI, dispatches them to **worker** nodes, and streams live results to a **realtime dashboard**. Instead of a static test suite that runs once, the system behaves like a production monitoring platform: checks run continuously on their own schedules, failures are logged with detail, and the worker recovers from crashes and reconnects on its own.

## 🚀 Project Vision

Modern QA and reliability tooling should operate as infrastructure, not isolated scripts. This project implements a platform-level monitoring architecture: a control plane that schedules work, distributed workers that execute it (including real browser automation against a Cloudflare-protected UI), and realtime observability with no manual polling.

## ⚡ Quick Start

Clone the repository:

```
git clone https://github.com/baliyanravi08-code/webmcp-distributed-observer.git
cd webmcp-distributed-observer
```

Install dependencies:

```
npm install
npx playwright install
```

Set up your `.env` file with your GoDark testnet API credentials:

```
GODARK_API_KEY_ID=...
GODARK_API_SECRET=...
GODARK_PASSPHRASE=...

# Optional overrides
GODARK_TEST_SYMBOL=BTC-USDC-PERP
GODARK_TEST_SIZE=0.01
GODARK_E2E_PRICE=85000
GODARK_CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
GODARK_GTD_EXPIRY_UNIT=ns
```

Start the coordinator:

```
node coordinator/coordinator.js
```

Start a worker (in a separate terminal):

```
node worker/worker.js
```

Open the realtime dashboard:

```
http://localhost:3000
```

The first time the Trading UI check runs, the worker automatically launches a dedicated debug Chrome instance (using its own saved profile) and opens the GoDark site. Log in and pass the Cloudflare verification **once** by hand in that window — the session is saved and reused on every future run.

## ✅ Requirements

- Node.js ≥ 18
- npm ≥ 9
- Google Chrome installed (used for the live UI check via Chrome DevTools Protocol)
- Windows / macOS / Linux
- A GoDark testnet account with API credentials

## 🏗️ Architecture Overview

```
Coordinator (control plane)
   ↓ schedules checks per target, tracks worker health, recovers stuck tasks
Worker node(s)
   ↓ executes one check at a time: API calls, order placement, or live browser
Checks (checks/godark/*.js)
   ↓ each returns a structured healthy / unhealthy / blocked result
Realtime Dashboard (WebSocket, no refresh)
```

The coordinator maintains a worker registry, assigns tasks based on a per-check schedule (not a fixed round-robin), recovers tasks from workers that time out or fail, and broadcasts cluster + result state over WebSocket to the dashboard.

## 📊 Monitored Targets

| Check | What it verifies | Frequency |
|---|---|---|
| **System Health** | Public system status endpoint, symbol listing | 1 min |
| **API Auth** | API key/secret/passphrase authentication, account info | 1 min |
| **Endpoint Checks** | 7 REST endpoints (funding rates, open interest, volume, login, account, leverage, open orders) | 2 min |
| **Trade Flow** | Places a real testnet order (post-only limit), confirms it rests, cancels it, confirms cancellation | 5 min |
| **Order Types** | Places and verifies 7 order variants: limit GTC, post-only, peg GTC, limit GTD, IOC (no-fill), FOK (no-fill), reduce-only (expected rejection) | 30 min |
| **Trading UI** | Drives a real, already-authenticated Chrome session to confirm the trading screen, balances panel, and account menu render correctly | 15 min |

Every check runs once at startup and then on its own interval — slower, state-changing checks (order placement, UI automation) run less often than read-only checks.

## 🌐 Live Trading UI Monitoring

The UI check is the most demanding target: it drives a real browser against a Cloudflare-protected single-page app.

- The worker connects to a dedicated Chrome instance over the Chrome DevTools Protocol (port 9222) rather than launching a fresh, unauthenticated browser — this avoids triggering Cloudflare's bot challenge on every run.
- If that Chrome instance isn't running, the worker starts it automatically with a persistent profile.
- The Cloudflare pass and login session are cached in that profile and reused across runs. They can expire periodically and require a one-time manual re-verification.
- The check waits for each UI element to actually render (rather than a fixed delay) before judging pass/fail, so a slow page load doesn't produce a false negative.

## 📂 Project Structure

```
coordinator/   → Control plane: scheduling, worker registry, dashboard broadcast
worker/        → Executes assigned checks, manages the debug Chrome session
checks/godark/ → One file per monitored target (API, trade flow, order types, UI, leverage)
dashboard/     → Realtime observability UI (vanilla HTML/JS over WebSocket)
shared/        → Logging and shared utilities
scripts/       → One-off diagnostic scripts (env checks, manual Chrome launch)
```

## 🔥 Engineering Highlights

- **Per-check scheduling** instead of fixed round-robin, so expensive or state-mutating checks run less often than read-only ones.
- **Worker heartbeat** to prevent false-positive disconnects during long idle gaps between scheduled checks.
- **Task recovery**: a task from a disconnected or crashed worker is automatically reassigned, with a bounded retry limit.
- **CDP-based browser reuse** to solve the practical problem of automating a Cloudflare-protected production UI without re-triggering bot detection on every run.
- **Known-limitation handling**: a documented upstream API gap (`GET /leverage` returning 405) is surfaced distinctly from a genuine failure, so the dashboard reflects platform health accurately rather than crying wolf on a known issue.
- **Structured, timestamped logging** for every check, independent of the dashboard, for post-hoc debugging.

## ⚠️ Known Upstream Limitations (GoDark API)

Found and documented while building this monitor:

- `GET /leverage` returns `405 Method Not Allowed` — there is currently no way to read an account's current leverage via REST.
- Current leverage is only obtainable by making a change and reading the resulting WebSocket push; there's no snapshot/query.

## 📈 Future Scope

- Dedicated leverage check on its own schedule + dashboard card
- Market-order round-trip check (place + immediately flatten) as an hourly test
- Cloudflare skip-rule or bypass-header support once provided by GoDark (env hooks already reserved)
- Multi-worker horizontal scaling
- Persistent execution history / metrics beyond the in-memory recent-activity feed
- Containerized deployment

## 👨‍💻 Tech Stack

Node.js • Playwright (via CDP) • WebSockets (`ws`) • Express • GoDark SDK • Distributed system design

---

**Release:** v1.1 — Multi-check GoDark testnet observability platform with live UI monitoring