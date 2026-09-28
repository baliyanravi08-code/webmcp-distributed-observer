import "dotenv/config";

import { GodarkRestClient } from "@godark/sdk";

export async function run() {
  const start = Date.now();

  console.log("🔐 Connecting to GoDark API...");

  const client = new GodarkRestClient({
    apiKeyId: process.env.GODARK_API_KEY_ID,
    apiSecret: process.env.GODARK_API_SECRET,
    passphrase: process.env.GODARK_PASSPHRASE,
    restBaseUrl: process.env.GODARK_EDGE_URL
  });

  try {
    await client.connect();

    console.log("✅ GoDark API connected");

    const account = await client.getAccount();

    const duration = Date.now() - start;

    console.log("✅ GoDark API authentication successful");
    console.log(`⏱️ API response time: ${duration} ms`);
    console.log("📊 Account information received");
    console.log("Account status: HEALTHY");

    return {
      status: "healthy",
      responseTimeMs: duration
    };
  } finally {
    await client.disconnect();
    console.log("🔌 GoDark API disconnected");
  }
}

run().catch((error) => {
  console.error("❌ GoDark API health check failed:", error.message);
  process.exitCode = 1;
});