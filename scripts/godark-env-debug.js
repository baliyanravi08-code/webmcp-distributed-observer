import "dotenv/config";

const vars = [
  "GODARK_API_KEY_ID",
  "GODARK_API_SECRET",
  "GODARK_PASSPHRASE",
  "GODARK_EDGE_URL"
];

for (const name of vars) {
  const raw = process.env[name] ?? "";

  const hasLeadingSpace = raw !== raw.trimStart();
  const hasTrailingSpace = raw !== raw.trimEnd();
  const hasCR = raw.includes("\r");
  const hasQuotes = raw.startsWith('"') || raw.startsWith("'");

  console.log(`\n${name}`);
  console.log(`  length: ${raw.length}`);
  console.log(`  leading whitespace: ${hasLeadingSpace}`);
  console.log(`  trailing whitespace: ${hasTrailingSpace}`);
  console.log(`  contains \\r (CRLF artifact): ${hasCR}`);
  console.log(`  wrapped in quotes: ${hasQuotes}`);
}

console.log(
  "\nGODARK_EDGE_URL value (safe to show, not a secret):",
  JSON.stringify(process.env.GODARK_EDGE_URL)
);