import { WebSocketServer } from "ws";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

/* ================= PATH ================= */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ================= PORTS ================= */

const WORKER_PORT = 8080;
const DASHBOARD_WS_PORT = 9090;
const HTTP_PORT = 3000;

/* ================= STATE ================= */

const workers = new Map();
let taskCount = 0;

const targets = ["hyperliquid","gmx","uniswap"];

/* =====================================================
   WORKER SOCKET SERVER
===================================================== */

const workerWSS = new WebSocketServer({
  port: WORKER_PORT
});

console.log("🚀 Coordinator started");
console.log("📡 Worker WS running on 8080");

/* =====================================================
   DASHBOARD SOCKET SERVER ⭐ IMPORTANT
===================================================== */

const dashboardWSS = new WebSocketServer({
  port: DASHBOARD_WS_PORT
});

console.log("📊 Dashboard WS running on 9090");

/* =====================================================
   WORKER CONNECTION
===================================================== */

workerWSS.on("connection",(ws)=>{

  const id = Math.floor(Math.random()*10000);

  workers.set(id,{
    ws,
    status:"IDLE"
  });

  console.log(`✅ Worker-${id} connected`);

  ws.on("message",(msg)=>{

    const data = JSON.parse(msg);

    if(data.type==="STATUS"){
      workers.get(id).status=data.status;
    }

    if(data.type==="TASK_DONE"){
      console.log(`✅ Worker-${id} finished ${data.task.target}`);
    }
  });

  ws.on("close",()=>{
    workers.delete(id);
    console.log(`❌ Worker-${id} disconnected`);
  });
});

/* =====================================================
   STATUS BROADCAST
===================================================== */

function broadcast(){

  let busy=0;
  let idle=0;

  workers.forEach(w=>{
    if(w.status==="BUSY") busy++;
    else idle++;
  });

  const payload = JSON.stringify({
    workersActive:workers.size,
    busy,
    idle,
    tasksSent:taskCount
  });

  dashboardWSS.clients.forEach(client=>{
    if(client.readyState===1){
      client.send(payload);
    }
  });
}

/* =====================================================
   TASK SCHEDULER
===================================================== */

setInterval(()=>{

  workers.forEach((worker,id)=>{

    if(worker.status==="IDLE"
      && worker.ws.readyState===1){

      const target=
        targets[Math.floor(Math.random()*targets.length)];

      taskCount++;

      console.log(
        `🧠 Task #${taskCount} → ${target} → Worker-${id}`
      );

      worker.ws.send(
        JSON.stringify({target})
      );
    }
  });

},8000);

/* =====================================================
   DASHBOARD LIVE LOOP ⭐
===================================================== */

setInterval(()=>{
  broadcast();
},2000);

/* =====================================================
   HTTP DASHBOARD
===================================================== */

const app=express();

app.use(
  express.static(
    path.join(__dirname,"../dashboard")
  )
);

app.listen(HTTP_PORT,()=>{
  console.log(
    `🌐 Dashboard running at http://localhost:${HTTP_PORT}`
  );
});