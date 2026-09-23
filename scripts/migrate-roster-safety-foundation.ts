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

    console.log("\n[EXECUTION] Applying roster safety foundation schema to local mva_dev...");

    // 1. Alter foreign key constraint fk_payments_registration_player to ON DELETE RESTRICT
    console.log("  [1/5] Updating payments.fk_payments_registration_player constraint to ON DELETE RESTRICT...");
    await client.query(`
      ALTER TABLE payments
        DROP CONSTRAINT IF EXISTS fk_payments_registration_player;
      
      ALTER TABLE payments
        ADD CONSTRAINT fk_payments_registration_player
        FOREIGN KEY (registration_player_id)
        REFERENCES registration_players(id)
        ON DELETE RESTRICT
        ON UPDATE NO ACTION;
    `);
    console.log("  [PASS] Replaced fk_payments_registration_player with ON DELETE RESTRICT");

    // 2. Create roster_status enum
    console.log("  [2/5] Creating roster_status enum type...");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'roster_status'
        ) THEN
          CREATE TYPE roster_status AS ENUM ('ACTIVE', 'REMOVED');
        END IF;
      END $$;
    `);
    console.log("  [PASS] Verified roster_status enum ('ACTIVE', 'REMOVED')");

    // 3. Add lifecycle columns to registration_players
    console.log("  [3/5] Adding status, removed_at, removed_by_profile_id columns to registration_players...");
    await client.query(`
      ALTER TABLE registration_players
        ADD COLUMN IF NOT EXISTS status roster_status NOT NULL DEFAULT 'ACTIVE',
        ADD COLUMN IF NOT EXISTS removed_at TIMESTAMPTZ(6) NULL,
        ADD COLUMN IF NOT EXISTS removed_by_profile_id UUID NULL;
    `);
    console.log("  [PASS] Added lifecycle columns to registration_players");

    // 4. Add foreign key for removed_by_profile_id
    console.log("  [4/5] Adding foreign key for removed_by_profile_id -> profiles(id)...");
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_registration_players_removed_by'
        ) THEN
          ALTER TABLE registration_players
            ADD CONSTRAINT fk_registration_players_removed_by
            FOREIGN KEY (removed_by_profile_id)
            REFERENCES profiles(id)
            ON UPDATE NO ACTION;
        END IF;
      END $$;
    `);
    console.log("  [PASS] Foreign key fk_registration_players_removed_by established");

    // 5. Add indexes
    console.log("  [5/5] Adding indexes for roster status and remover...");
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_registration_players_status
        ON registration_players (status);

      CREATE INDEX IF NOT EXISTS idx_registration_players_removed_by
        ON registration_players (removed_by_profile_id);
    `);
    console.log("  [PASS] Created indexes for registration_players(status, removed_by_profile_id)");

    // 6. Verify pg_constraint confdeltype = 'r' (RESTRICT)
    const verifyConstraint = await client.query(`
      SELECT conname, confdeltype 
      FROM pg_constraint 
      WHERE conname = 'fk_payments_registration_player';
    `);
    const cRow = verifyConstraint.rows[0];
    if (!cRow || cRow.confdeltype !== 'r') {
      throw new Error(`Verification failed: confdeltype is '${cRow?.confdeltype}', expected 'r' (RESTRICT)`);
    }
    console.log(`  [VERIFIED] pg_constraint fk_payments_registration_player confdeltype is '${cRow.confdeltype}' (RESTRICT)`);

    console.log("\n[SUCCESS] Local mva_dev database successfully updated for Phase 05.7D.3 roster safety foundation.");
  } finally {
    await client.end();
  }
}

run().catch((err) => {
  console.error("Migration error:", err);
  process.exit(1);
});
