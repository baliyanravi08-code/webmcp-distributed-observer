import { WebSocketServer } from "ws";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { readRecentLogs } from "../shared/logger.js";

/* ================= PATH ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= PORTS ================= */

const WORKER_PORT = 8080;
const DASHBOARD_WS_PORT = 9090;
const HTTP_PORT = 3000;

/* ================= SETTINGS ================= */

const WORKER_TIMEOUT = 20000;
const WORKER_REMOVE_DELAY = 10000;
const SCHEDULER_INTERVAL = 8000;
const DASHBOARD_INTERVAL = 2000;
const MAX_ATTEMPTS = 3;

/* ================= STATE ================= */

const workers = new Map();
const activeTasks = new Map();

let taskCount = 0;

const targets = [
  "godark-system-health",
  "godark-api-health",
  "godark-trade-flow",
  "godark-order-types",
  "godark-endpoints",
  "godark"
];

/* How often each check should run (milliseconds) */
const TARGET_INTERVALS = {
  "godark-system-health": 60_000,
  "godark-api-health": 60_000,
  "godark-endpoints": 2 * 60_000,
  "godark-trade-flow": 5 * 60_000,
  "godark-order-types": 30 * 60_000,
  "godark": 15 * 60_000
};

/* When each check last ran */
const lastRun = new Map();

/* =========================================================
   DASHBOARD BROADCAST
========================================================= */

function broadcast() {
  let busy = 0;
  let idle = 0;
  let offline = 0;

  const workerList = [];

  workers.forEach((worker, id) => {
    if (worker.status === "BUSY") {
      busy++;
    } else if (worker.status === "OFFLINE") {
      offline++;
    } else {
      idle++;
    }

    workerList.push({
      id,
      status: worker.status,
      latestResults: worker.latestResults,
      lastSeen: worker.lastSeen,
      currentTask: worker.currentTask,
      connectedAt: worker.connectedAt
    });
  });

  let recentLogs = [];

  try {
    recentLogs = readRecentLogs(200)
      .filter(
        (e) =>
          typeof e.taskId === "number" &&
          (e.event === "result" || e.event === "error")
      )
      .slice(-12);
  } catch {
    // Never let a log read problem break the dashboard feed.
  }

  const payload = JSON.stringify({
    workersActive: workers.size,
    busy,
    idle,
    offline,
    tasksSent: taskCount,
    activeTasks: activeTasks.size,
    workers: workerList,
    recentLogs
  });

  dashboardWSS.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

/* =========================================================
   CREATE TASK
========================================================= */

function createTask(target) {
  taskCount++;

  const task = {
    taskId: taskCount,
    target,
    workerId: null,
    status: "WAITING",
    createdAt: Date.now(),
    assignedAt: null,
    attempts: 0
  };

  activeTasks.set(task.taskId, task);

  return task;
}

/* =========================================================
   SEND TASK
========================================================= */

function sendTask(workerId, task) {
  const worker = workers.get(workerId);

  if (!worker) return false;
  if (worker.status !== "IDLE") return false;
  if (worker.ws.readyState !== 1) return false;

  try {
    worker.status = "BUSY";
    worker.currentTask = task.taskId;
    worker.lastSeen = Date.now();

    task.workerId = workerId;
    task.status = "ASSIGNED";
    task.assignedAt = Date.now();
    task.attempts++;

    worker.ws.send(
      JSON.stringify({
        target: task.target,
        taskId: task.taskId
      })
    );

    console.log(
      `🧠 Task #${task.taskId} → ${task.target} → Worker-${workerId}`
    );

    return true;
  } catch (error) {
    console.log(
      `❌ Failed to send Task #${task.taskId}: ${error.message}`
    );

    worker.status = "OFFLINE";
    worker.currentTask = null;

    task.workerId = null;
    task.status = "RECOVERABLE";

    return false;
  }
}

/* =========================================================
   RECOVER TASKS
========================================================= */

function recoverTasks() {
  activeTasks.forEach((task) => {
    if (task.status !== "RECOVERABLE") {
      return;
    }

    if (task.attempts >= MAX_ATTEMPTS) {
      console.log(
        `💀 Task #${task.taskId} (${task.target}) exceeded ${MAX_ATTEMPTS} attempts — giving up.`
      );

      activeTasks.delete(task.taskId);

      return;
    }

    let availableWorkerId = null;

    workers.forEach((worker, id) => {
      if (availableWorkerId !== null) return;

      if (worker.status === "IDLE" && worker.ws.readyState === 1) {
        availableWorkerId = id;
      }
    });

    if (availableWorkerId === null) {
      return;
    }

    console.log(`♻️ Recovering Task #${task.taskId} (${task.target})`);

    const success = sendTask(availableWorkerId, task);

    if (success) {
      console.log(
        `🔄 Task #${task.taskId} reassigned → Worker-${availableWorkerId}`
      );
    }
  });
}

/* =========================================================
   WORKER HEALTH MONITOR
========================================================= */

function checkWorkerHealth() {
  const now = Date.now();

  workers.forEach((worker, id) => {
    if (worker.status === "OFFLINE") {
      return;
    }

    const elapsed = now - worker.lastSeen;

    if (elapsed <= WORKER_TIMEOUT) {
      return;
    }

    console.log(`⚠️ Worker-${id} heartbeat timeout`);

    worker.status = "OFFLINE";

    if (worker.currentTask !== null) {
      const task = activeTasks.get(worker.currentTask);

      if (task) {
        task.workerId = null;
        task.status = "RECOVERABLE";

        console.log(`♻️ Task #${task.taskId} marked recoverable`);
      }
    }

    worker.currentTask = null;

    try {
      worker.ws.close();
    } catch {
      // Ignore socket close errors.
    }

    broadcast();
  });
}

/* =========================================================
   WORKER WEBSOCKET SERVER
========================================================= */

const workerWSS = new WebSocketServer({ port: WORKER_PORT });

console.log("🚀 Coordinator started");
console.log(`📡 Worker WS running on ${WORKER_PORT}`);

/* =========================================================
   DASHBOARD WEBSOCKET SERVER
========================================================= */

const dashboardWSS = new WebSocketServer({ port: DASHBOARD_WS_PORT });

console.log(`📊 Dashboard WS running on ${DASHBOARD_WS_PORT}`);

/* =========================================================
   WORKER CONNECTION
========================================================= */

workerWSS.on("connection", (ws) => {
  const id = Math.floor(Math.random() * 10000);

  const worker = {
    ws,
    status: "IDLE",
    latestResults: {},
    lastSeen: Date.now(),
    currentTask: null,
    connectedAt: Date.now()
  };

  workers.set(id, worker);

  console.log(`✅ Worker-${id} connected`);

  broadcast();

  /* ---------- WORKER MESSAGE ---------- */

  ws.on("message", (msg) => {
    let data;

    try {
      data = JSON.parse(msg.toString());
    } catch {
      console.log(`❌ Worker-${id} sent invalid JSON`);
      return;
    }

    worker.lastSeen = Date.now();

    /* STATUS */

    if (data.type === "STATUS") {
      worker.status = data.status || "IDLE";
      broadcast();
    }

    /* TASK DONE */

    if (data.type === "TASK_DONE") {
      const task = data.task;

      if (!task) {
        console.log(`⚠️ Worker-${id} completed a task without task data`);

        worker.status = "IDLE";
        worker.currentTask = null;

        broadcast();
        return;
      }

      const taskId = task.taskId;
      const trackedTask = activeTasks.get(taskId);

      if (trackedTask && trackedTask.workerId === id) {
        activeTasks.delete(taskId);

        console.log(`✅ Task #${taskId} completed by Worker-${id}`);
      }

      if (task.target) {
        worker.latestResults[task.target] = data.result ?? null;
      }

      worker.status = "IDLE";
      worker.currentTask = null;

      if (data.result) {
        console.log("📊 Result:", data.result);
      }

      broadcast();
    }

    /* TASK FAILED */

    if (data.type === "TASK_FAILED") {
      const task = data.task;

      if (task) {
        const taskId = task.taskId;
        const trackedTask = activeTasks.get(taskId);

        if (trackedTask && trackedTask.workerId === id) {
          trackedTask.workerId = null;
          trackedTask.status = "RECOVERABLE";

          console.log(
            `♻️ Task #${taskId} marked recoverable after Worker-${id} failure`
          );
        }
      }

      worker.status = "IDLE";
      worker.currentTask = null;

      console.log(
        `❌ Worker-${id} task failed:`,
        data.error || "Unknown error"
      );

      broadcast();
    }
  });

  /* ---------- WORKER CLOSE ---------- */

  ws.on("close", () => {
    const current = workers.get(id);

    if (!current) {
      return;
    }

    console.log(`❌ Worker-${id} disconnected`);

    current.status = "OFFLINE";
    current.lastSeen = Date.now();

    if (current.currentTask !== null) {
      const task = activeTasks.get(current.currentTask);

      if (task) {
        task.workerId = null;
        task.status = "RECOVERABLE";

        console.log(`♻️ Task #${task.taskId} released for recovery`);
      }
    }

    current.currentTask = null;

    broadcast();

    setTimeout(() => {
      const existing = workers.get(id);

      if (existing && existing.status === "OFFLINE") {
        workers.delete(id);

        console.log(`🗑️ Worker-${id} removed from cluster`);

        broadcast();
      }
    }, WORKER_REMOVE_DELAY);
  });

  /* ---------- WORKER ERROR ---------- */

  ws.on("error", (error) => {
    console.log(`❌ Worker-${id} WebSocket error:`, error.message);
  });
});

/* =========================================================
   TASK SCHEDULER
========================================================= */

function scheduleTasks() {
  recoverTasks();

  workers.forEach((worker, id) => {
    if (worker.status !== "IDLE") {
      return;
    }

    if (worker.ws.readyState !== 1) {
      return;
    }

    const recoverableTask = [...activeTasks.values()].find(
      (task) => task.status === "RECOVERABLE"
    );

    if (recoverableTask) {
      return;
    }

    /*
     * Pick the first check that is due, based on its own interval.
     */

    const now = Date.now();

    const target = targets.find(
      (t) => now - (lastRun.get(t) ?? 0) >= TARGET_INTERVALS[t]
    );

    if (!target) {
      return; // nothing due yet
    }

    lastRun.set(target, now);

    const task = createTask(target);

    sendTask(id, task);
  });

  broadcast();
}

/* =========================================================
   INTERVALS
========================================================= */

setInterval(checkWorkerHealth, 5000);
setInterval(scheduleTasks, SCHEDULER_INTERVAL);
setInterval(broadcast, DASHBOARD_INTERVAL);

/* =========================================================
   HTTP DASHBOARD
========================================================= */

const app = express();

app.use(express.static(path.join(__dirname, "../dashboard")));

app.listen(HTTP_PORT, () => {
  console.log(`🌐 Dashboard running at http://localhost:${HTTP_PORT}`);
});