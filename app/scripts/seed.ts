/**
 * Seed script: imports all 12 Excel files from Aksjeeierbøker/ into the database.
 *
 * Usage: npx tsx --tsconfig tsconfig.json scripts/seed.ts
 *
 * Requires DATABASE_URL env var (loaded from .env via dotenv).
 */
import "dotenv/config";
import { readFileSync, readdirSync } from "fs";
import { resolve, join } from "path";
import { importExcelFile, type ImportResult } from "../src/lib/import/importer";
import { db } from "../src/db";
import { shareholderAliases, shareholderContacts } from "../src/db/schema";

const EXCEL_DIR = resolve(__dirname, "../../Aksjeeierbøker");

async function main() {
  console.log("=== ECIT Cap Tables Seed ===\n");
  console.log(`Reading Excel files from: ${EXCEL_DIR}\n`);

  // Clean stale aliases and contacts from previous runs
  await db.delete(shareholderAliases);
  await db.delete(shareholderContacts);
  console.log("Cleared existing aliases and contacts.\n");

  const files = readdirSync(EXCEL_DIR)
    .filter((f) => f.endsWith(".xlsx"))
    .sort();

  console.log(`Found ${files.length} files:\n`);
  files.forEach((f, i) => console.log(`  ${i + 1}. ${decodeURIComponent(f)}`));
  console.log();

  const results: ImportResult[] = [];
  const errors: { file: string; error: string }[] = [];

  for (const file of files) {
    const filePath = join(EXCEL_DIR, file);
    const displayName = decodeURIComponent(file);
    process.stdout.write(`Importing ${displayName}... `);

    try {
      const buffer = readFileSync(filePath);
      const result = await importExcelFile(buffer, file);
      results.push(result);
      console.log(
        `OK  (${result.shareholdersImported} shareholders, ${result.holdingsCreated} holdings, ${result.conflicts.length} conflicts)`
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ file: displayName, error: message });
      console.log(`FAIL  ${message}`);
    }
  }

  // Summary
  console.log("\n=== Summary ===\n");
  console.log(`Files processed: ${results.length + errors.length}`);
  console.log(`Successful:      ${results.length}`);
  console.log(`Failed:          ${errors.length}`);
  console.log(
    `Total shareholders imported: ${results.reduce((s, r) => s + r.shareholdersImported, 0)}`
  );
  console.log(
    `Total holdings created:      ${results.reduce((s, r) => s + r.holdingsCreated, 0)}`
  );

  const totalConflicts = results.reduce(
    (s, r) => s + r.conflicts.length,
    0
  );
  console.log(`Total conflicts:             ${totalConflicts}`);

  if (totalConflicts > 0) {
    console.log("\n=== Conflicts ===\n");
    for (const r of results) {
      for (const c of r.conflicts) {
        console.log(
          `  [${c.type}] ${c.shareholderName} (org: ${c.orgNumber ?? "N/A"}) in ${r.companyName}`
        );
        console.log(`    ${c.details}`);
      }
    }
  }

  if (errors.length > 0) {
    console.log("\n=== Errors ===\n");
    for (const e of errors) {
      console.log(`  ${e.file}: ${e.error}`);
    }
  }

  console.log("\nDone.");
  process.exit(errors.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
