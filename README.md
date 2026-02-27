# 🧠 WebMCP Distributed Autonomous Web Observability Harness

A **distributed, self-healing Playwright automation infrastructure** designed to continuously monitor live web trading interfaces using autonomous browser workers.

This project demonstrates **Automation Infrastructure Engineering**, moving beyond traditional test automation into **distributed orchestration, realtime observability, and autonomous execution systems**.

---

## 🚀 Project Vision

Modern QA systems should behave like **platform infrastructure**, not test suites.

This project implements:

✅ Distributed browser workers
✅ Centralized control plane
✅ Autonomous task scheduling
✅ Live observability dashboard
✅ Self-healing execution model

---

## 🏗️ System Architecture

```
                    🧠 Planner Engine
                          │
                          ▼
               🚀 Coordinator (Control Plane)
      ┌──────────────────────────────────────────┐
      │  Scheduler + Worker Registry             │
      │  Status Aggregation                      │
      │  Distributed Task Dispatcher             │
      └──────────────────────────────────────────┘
                          │
              WebSocket Task Distribution
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
   👷 Worker-1       👷 Worker-2       👷 Worker-3
   Playwright        Playwright        Playwright
   Browser Agent     Browser Agent     Browser Agent
        │                 │                 │
        └──────────── UI Monitoring ────────┘
                          │
                          ▼
             📊 Realtime Observability Dashboard
```

---

## ⚙️ Architecture Flow

```
Planner Engine
      ↓
Coordinator (Control Plane)
      ↓
Distributed Workers
      ↓
Live Browser Monitoring
      ↓
Realtime Dashboard Updates
```

---

## ⭐ Core Features

### 🧱 Distributed Harness Execution

* Multiple autonomous Playwright workers
* Horizontal execution model
* Independent browser agents
* Persistent single-tab execution

---

### 🧠 Coordinator Control Plane

* Worker registration & lifecycle tracking
* Centralized scheduling
* Task orchestration
* Status aggregation

---

### 📡 WebSocket-Based Communication

* Worker ↔ Coordinator messaging
* Dashboard realtime streaming
* Low-latency distributed updates

---

### ❤️ Self-Healing Worker Model

* Worker health tracking
* Automatic disconnect cleanup
* Idle/Busy state awareness

---

### 📊 Realtime Observability Dashboard

Live monitoring includes:

* Active workers
* Busy / Idle state
* Distributed task execution
* Total tasks processed

Dashboard updates automatically via WebSocket streaming.

---

## 🖥️ Realtime Dashboard

Open locally:

```
http://localhost:3000
```

Controls available:

* RUN
* PAUSE
* RESUME

No refresh required — live system telemetry.

---

## 📸 System Execution

### 📊 Realtime Observability Dashboard

![Dashboard](assets/realtime-dashboard.png)

### 🚀 Coordinator Distributed Execution

![Coordinator](assets/coordinator-distributed-execution.png)

### ⚡ Distributed Task Execution

![Execution](assets/distributed-task-execution.png)

### 👷 Workers Connected

![Workers](assets/workers-connected.png)

### 🟢 Worker Startup

![Startup](assets/worker-startup.png)

### 💤 Worker Idle State

![Idle](assets/worker-idle-state.png)

---

## 📂 Project Structure

```
coordinator/
   coordinator.js     → Control Plane + Scheduler

worker/
   worker.js          → Distributed Browser Agent

checks/
   hyperliquid.check.js
   gmx.check.js
   uniswap.check.js

dashboard/
   index.html         → Realtime Monitoring UI

assets/
   project screenshots
```

---

## ⚙️ Installation

```bash
npm install
```

### Dependencies

* playwright
* ws
* express
* chalk

---

## ▶️ Running the System

### Start Coordinator

```bash
npm run start:coordinator
```

### Start Workers (multiple terminals)

```bash
npm run start:worker
npm run start:worker
npm run start:worker
```

Workers automatically join the distributed cluster.

---

## 🌐 Example Monitoring Targets

* Hyperliquid Trading UI
* GMX Exchange
* Uniswap Interface

Workers continuously navigate and validate live trading interfaces.

---

## 🔥 What Makes This Different

This is **NOT** a traditional automation framework.

Instead of:

```
tests/
pageObjects/
specs/
```

This project demonstrates:

✅ Distributed automation infrastructure
✅ Autonomous browser agents
✅ Control-plane orchestration
✅ Observability-driven QA
✅ Platform-level automation engineering

---

## 🧠 Engineering Highlights

* Distributed worker cluster
* Persistent browser agents
* Scheduler-driven execution
* WebSocket realtime telemetry
* Control-plane architecture
* Infrastructure-style automation

---

## 📈 Future Enhancements

* Worker auto-scaling
* Persistent task queue
* Execution metrics & tracing
* Docker / Kubernetes deployment
* AI-assisted planner routing
* Cloud distributed execution

---

## 👨‍💻 Tech Stack

* Playwright
* Node.js
* WebSockets
* Express
* Distributed System Design

---

## ⭐ Positioning

> **Distributed Autonomous Web Observability Harness**
> A platform-level QA automation infrastructure inspired by modern control-plane and observability systems.

---
