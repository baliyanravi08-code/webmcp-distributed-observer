import "dotenv/config";

const required = [
  "GODARK_API_KEY_ID",
  "GODARK_API_SECRET",
  "GODARK_PASSPHRASE",
  "GODARK_EDGE_URL"
];

let valid = true;

for (const name of required) {
  const value = process.env[name];

  if (!value) {
    console.log(`❌ ${name}: MISSING`);
    valid = false;
  } else {
    console.log(`✅ ${name}: loaded`);
  }
}

if (valid) {
  console.log("✅ GoDark environment configuration loaded successfully.");
} else {
  console.log("❌ GoDark environment configuration is incomplete.");
}