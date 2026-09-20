import pg from "pg";

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

    console.log("\n[EXECUTION] Applying per-player payment schema to local mva_dev...");

    // 1. Add nullable columns to payments
    await client.query(`
      ALTER TABLE payments
        ADD COLUMN IF NOT EXISTS registration_player_id UUID NULL,
        ADD COLUMN IF NOT EXISTS verified_by_profile_id UUID NULL;
    `);
    console.log("  [PASS] Added nullable columns: registration_player_id, verified_by_profile_id");

    // 2. Add foreign keys
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_registration_player'
        ) THEN
          ALTER TABLE payments
            ADD CONSTRAINT fk_payments_registration_player
            FOREIGN KEY (registration_player_id)
            REFERENCES registration_players(id)
            ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;

        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_payments_verified_by_profile'
        ) THEN
          ALTER TABLE payments
            ADD CONSTRAINT fk_payments_verified_by_profile
            FOREIGN KEY (verified_by_profile_id)
            REFERENCES profiles(id)
            ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("  [PASS] Added foreign key constraints");

    // 3. Add performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_payments_registration_player
        ON payments (registration_player_id);

      CREATE INDEX IF NOT EXISTS idx_payments_verified_by_profile
        ON payments (verified_by_profile_id);
    `);
    console.log("  [PASS] Created indexes on foreign keys");

    // 4. Add partial unique index for verified player payment
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_active_verified_player
        ON payments (registration_player_id)
        WHERE status = 'VERIFIED' AND registration_player_id IS NOT NULL;
    `);
    console.log("  [PASS] Created partial unique index uq_payments_active_verified_player");

    console.log("\n[SUCCESS] Local mva_dev database successfully updated for per-player payments.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
