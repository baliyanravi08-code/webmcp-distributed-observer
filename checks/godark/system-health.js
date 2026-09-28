export async function run() {
  const start = Date.now();

  console.log("🔎 Checking GoDark system health...");

  const response = await fetch(
    "https://api.godark-dex.com/health/system"
  );

  const duration = Date.now() - start;

  if (!response.ok) {
    throw new Error(
      `GoDark system health returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  console.log("✅ GoDark system health is healthy");
  console.log(`📡 HTTP status: ${response.status}`);
  console.log(`⏱️ Response time: ${duration} ms`);
  console.log("📊 System health data received");

  return {
    status: "healthy",
    httpStatus: response.status,
    responseTimeMs: duration,
    data
  };
}

