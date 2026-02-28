![CI](https://github.com/baliyanravi08-code/webmcp-distributed-observer/actions/workflows/node-ci.yml/badge.svg)

# 🧠 WebMCP Distributed Autonomous Web Observability Harness

A **distributed, self-healing Playwright automation infrastructure platform** designed to continuously monitor live web trading interfaces using autonomous browser workers coordinated through a centralized control plane. This project demonstrates modern **Automation Infrastructure Engineering**, transforming traditional UI automation into a distributed observability system powered by autonomous browser agents, realtime WebSocket communication, cluster-based execution, and infrastructure-style orchestration. Instead of running static test suites, the system behaves like a monitoring platform where a coordinator dynamically schedules execution across multiple Playwright workers while streaming live operational telemetry to a realtime dashboard.

---

## 🚀 Project Vision

Modern QA automation should operate as **engineering infrastructure**, not isolated scripts. This project implements a platform-level automation architecture capable of distributed browser execution, centralized orchestration, realtime monitoring, and self-healing worker lifecycle management similar to internal automation platforms used in large-scale engineering organizations.

---

## ⚡ Quick Start

Clone repository:

```bash
git clone https://github.com/baliyanravi08-code/webmcp-distributed-observer.git
cd webmcp-distributed-observer
```

Install dependencies:

```bash
npm install
```

Install Playwright browsers:

```bash
npx playwright install
```

Start coordinator:

```bash
npm run start:coordinator
```

Start worker nodes (multiple terminals recommended):

```bash
npm run start:worker
npm run start:worker
npm run start:worker
```

Open realtime dashboard:

```
http://localhost:3000
```

---

## ✅ Requirements

* Node.js ≥ 18
* npm ≥ 9
* Windows / macOS / Linux

⚠ Playwright browsers must be installed before starting workers.

---

## 🏗️ Architecture Overview

```
Planner Engine
      ↓
Coordinator (Control Plane)
      ↓
Distributed Playwright Workers
      ↓
Autonomous Browser Monitoring
      ↓
Realtime Observability Dashboard
```

The coordinator acts as a **control plane**, maintaining worker registry, scheduling monitoring tasks, aggregating execution state, and broadcasting cluster telemetry through WebSockets to the dashboard interface.

---

## ⭐ Core Capabilities

* Distributed autonomous browser workers
* Coordinator-driven task orchestration
* Worker lifecycle & health tracking
* Idle/Busy scheduling model
* Persistent browser execution
* Realtime observability dashboard
* WebSocket-based system telemetry
* Cluster visualization of worker nodes

---

## 📊 Realtime Dashboard

The dashboard provides live infrastructure visibility including:

* Active worker nodes
* Execution state monitoring
* Distributed task processing
* Cluster workload distribution

Updates stream continuously without page refresh.

---

## 📸 System Execution

### Realtime Observability Dashboard

![Dashboard](assets/realtime-dashboard.png)

### Coordinator Distributed Execution

![Coordinator](assets/coordinator-distributed-execution.png)

### Distributed Task Execution

![Execution](assets/distributed-task-execution.png)

### Workers Connected

![Workers](assets/workers-connected.png)

### Worker Startup

![Startup](assets/worker-startup.png)

### Worker Idle State

![Idle](assets/worker-idle-state.png)

---

## 📂 Project Structure

```
coordinator/   → Control plane & scheduler
worker/        → Distributed Playwright agents
checks/        → Monitoring targets
dashboard/     → Realtime observability UI
assets/        → Execution screenshots
```

---

## 🔥 Engineering Differentiation

Unlike traditional automation frameworks based on test cases and page objects, this system demonstrates **automation infrastructure design**, focusing on orchestration, distributed execution, observability, and autonomous monitoring workflows.

---

## 🧠 Engineering Highlights

* Distributed worker cluster architecture
* Control-plane orchestration model
* Realtime WebSocket telemetry
* Autonomous execution loop
* Infrastructure-oriented QA automation
* Cluster-aware dashboard visualization

---

## 📈 Future Scope

* Worker auto-scaling
* Persistent execution queues
* Metrics tracing & latency monitoring
* Containerized deployment
* Cloud distributed execution
* AI-assisted planner routing

---

## 👨‍💻 Tech Stack

Playwright • Node.js • WebSockets • Express • Distributed System Design

---

## ⭐ Release

**v1.0 — Stable Distributed Automation Infrastructure Release**

---

> Distributed Autonomous Web Observability Harness
> Designed as a platform-level QA automation system inspired by modern control-plane and observability architectures.
