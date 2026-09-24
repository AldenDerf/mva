import pg from "pg";
import fs from "fs";
import path from "path";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

async function run() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL missing from environment");
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const probe = await client.query(
      "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
    );
    const row = probe.rows[0];
    console.log("[PROBE] Active database connection:");
    console.log(`  - Database: "${row.current_database}"`);
    console.log(`  - User: "${row.current_user}"`);
    console.log(`  - Address: "${row.inet_server_addr ?? "local"}"`);

    if (row.current_database !== "mva_dev") {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Database is "${row.current_database}", expected "mva_dev"! Aborting migration.`
      );
    }

    console.log("\n[EXECUTION] Applying payment_allocations migration to local mva_dev...");

    const sqlPath = path.join(
      process.cwd(),
      "prisma",
      "migrations",
      "20260924_legacy_payment_allocation",
      "migration.sql"
    );
    const sql = fs.readFileSync(sqlPath, "utf-8");

    await client.query(sql);

    console.log("  [PASS] Migration executed successfully.");

    // Verification
    const tableCheck = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'payment_allocations';"
    );
    if (tableCheck.rows.length === 0) {
      throw new Error("Table payment_allocations was not created!");
    }
    console.log("  [PASS] Table 'payment_allocations' verified.");

    const fkCheck = await client.query(
      "SELECT conname, confdeltype FROM pg_constraint WHERE conname IN ('fk_payment_allocations_payment', 'fk_payment_allocations_registration_player');"
    );
    for (const r of fkCheck.rows) {
      console.log(`  [PASS] Constraint ${r.conname}: confdeltype = '${r.confdeltype}'`);
    }

    console.log("\n[SUCCESS] Local mva_dev database successfully updated for payment allocations.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
