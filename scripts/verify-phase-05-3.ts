if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

import pg from "pg";
import { prisma } from "../lib/prisma";
import { verifyAdminAuthorization } from "../lib/auth/admin";
import {
  getDashboardSummaryCounts,
  getRecentRegistrations,
} from "../lib/admin/dashboard";

/**
 * PHASE 05.3: ADMIN SHELL & DASHBOARD VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Strict database safety guard (must be local mva_dev).
 * 2. Authorization invariants (verifyAdminAuthorization still intact).
 * 3. Read-only summary count queries (all numbers >= 0, correct types).
 * 4. Empty state data verification (0 registrations handled gracefully).
 * 5. Dynamic data retrieval with test fixtures (joins teams, categories, payments, player count).
 * 6. Fixture cleanup (zero lingering records in mva_dev).
 */

async function verifySafetyProbe(connectionString: string) {
  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const probeRes = await client.query(
      "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
    );
    const probe = probeRes.rows[0];

    console.log("[SAFETY PROBE] Inspecting target database connection:");
    console.log(`  - Database: "${probe.current_database}"`);
    console.log(`  - User: "${probe.current_user}"`);
    console.log(`  - Server Addr: ${probe.inet_server_addr ?? "local socket / ::1"}`);
    console.log(`  - Server Port: ${probe.inet_server_port ?? 5432}`);

    if (probe.current_database !== "mva_dev") {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Target database is "${probe.current_database}", expected "mva_dev"! Aborting.`
      );
    }

    const addr = String(probe.inet_server_addr || "");
    const isLocal =
      addr === "" ||
      addr === "127.0.0.1" ||
      addr === "::1" ||
      addr === "localhost";

    if (!isLocal) {
      throw new Error(`CRITICAL SAFETY VIOLATION: Remote database address "${addr}" detected! Aborting.`);
    }

    console.log("[SAFETY PROBE PASS] Target confirmed: local development mva_dev.\n");
  } finally {
    await client.end();
  }
}

async function runVerification() {
  console.log("===============================================================");
  console.log("PHASE 05.3: ADMIN SHELL & DASHBOARD VERIFICATION");
  console.log("===============================================================\n");

  const connectionString = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or DIRECT_URL environment variable is missing.");
  }

  // 1. Safety Guard
  await verifySafetyProbe(connectionString);

  let passes = 0;
  let failures = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passes++;
    } else {
      console.error(`  [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
      failures++;
    }
  }

  try {
    console.log("--- 1. VERIFYING SERVER AUTHORIZATION ENGINE ---");
    const nullRes = await verifyAdminAuthorization(null as unknown as string);
    assert(nullRes === null, "Test 1A: Null auth ID denied");

    const invalidRes = await verifyAdminAuthorization("not-a-uuid");
    assert(invalidRes === null, "Test 1B: Malformed auth ID denied");

    console.log("\n--- 2. VERIFYING INITIAL DASHBOARD SUMMARY QUERIES (READ-ONLY) ---");
    const initialSummary = await getDashboardSummaryCounts();
    assert(
      typeof initialSummary.pendingRegistrations === "number" &&
      typeof initialSummary.verifiedRegistrations === "number" &&
      typeof initialSummary.pendingPayments === "number" &&
      typeof initialSummary.totalRegistrations === "number",
      "Test 2A: Summary counts return valid numeric structure",
      JSON.stringify(initialSummary)
    );

    assert(
      initialSummary.pendingRegistrations >= 0 &&
      initialSummary.verifiedRegistrations >= 0 &&
      initialSummary.pendingPayments >= 0 &&
      initialSummary.totalRegistrations >= 0,
      "Test 2B: Summary counts are non-negative integers"
    );

    console.log("\n--- 3. VERIFYING RECENT REGISTRATIONS (INITIAL STATE) ---");
    const initialRecents = await getRecentRegistrations(5);
    assert(
      Array.isArray(initialRecents),
      "Test 3A: getRecentRegistrations returns an array"
    );
    console.log(`  Initial registration count in database: ${initialRecents.length}`);

    console.log("\n--- 4. DYNAMIC DATA & RELATION JOIN VERIFICATION (WITH TEST FIXTURE) ---");
    // Create a synthetic league and category in mva_dev for testing
    const syntheticLeague = await prisma.leagues.create({
      data: {
        name: `Test Dashboard League ${Date.now()}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
        league_categories: {
          create: {
            name: "Open Division (Test)",
            registration_fee: 300.0,
            min_players: 6,
            max_players: 12,
          },
        },
      },
      include: {
        league_categories: true,
      },
    });

    const category = syntheticLeague.league_categories[0];

    // Create a temporary test team
    const testTeam = await prisma.teams.create({
      data: {
        team_name: `Test Admin Shell Team ${Date.now()}`,
        slug: `test-admin-shell-team-${Date.now()}`,
      },
    });

    let createdRegistrationId: string | null = null;
    let createdPlayerId: string | null = null;
    try {
      // Create a temporary registration with a payment and player
      const testPlayer = await prisma.players.create({
        data: {
          first_name: "TestAdmin",
          last_name: "Player",
        },
      });
      createdPlayerId = testPlayer.id;

      const testReg = await prisma.registrations.create({
        data: {
          league_id: syntheticLeague.id,
          league_category_id: category.id,
          team_id: testTeam.id,
          registrant_first_name: "AdminTest",
          registrant_last_name: "Submitter",
          registrant_contact: "09123456789",
          status: "PENDING_PAYMENT",
          registration_players: {
            create: {
              player_id: testPlayer.id,
              is_captain: true,
            },
          },
          payments: {
            create: {
              payment_method: "CASH",
              amount: 300.0,
              status: "PENDING",
            },
          },
        },
      });
      createdRegistrationId = testReg.id;

      // Query dashboard again
      const updatedSummary = await getDashboardSummaryCounts();
      assert(
        updatedSummary.pendingRegistrations === initialSummary.pendingRegistrations + 1,
        "Test 4A: Pending registrations count dynamically incremented by 1"
      );
      assert(
        updatedSummary.pendingPayments === initialSummary.pendingPayments + 1,
        "Test 4B: Pending payments count dynamically incremented by 1"
      );
      assert(
        updatedSummary.totalRegistrations === initialSummary.totalRegistrations + 1,
        "Test 4C: Total registrations count dynamically incremented by 1"
      );

      // Verify recent registrations query with joined relations
      const recentsWithFixture = await getRecentRegistrations(5);
      assert(
        recentsWithFixture.length >= 1,
        "Test 4D: Recent registrations list contains the newly created record"
      );

      const latest = recentsWithFixture[0];
      assert(
        latest.teamName === testTeam.team_name,
        "Test 4E: Team relation joined successfully",
        `Expected ${testTeam.team_name}, got ${latest.teamName}`
      );
      assert(
        latest.categoryName === category.name,
        "Test 4F: Category relation joined successfully",
        `Expected ${category.name}, got ${latest.categoryName}`
      );
      assert(
        latest.registrationStatus === "PENDING_PAYMENT",
        "Test 4G: Registration status matches schema enum"
      );
      assert(
        latest.paymentStatus === "PENDING" && latest.paymentAmount === 300,
        "Test 4H: Payment relation and amount serialized correctly",
        `Status: ${latest.paymentStatus}, Amount: ${latest.paymentAmount}`
      );
      assert(
        latest.playerCount === 1,
        "Test 4I: Player count aggregated correctly via relation",
        `Expected 1, got ${latest.playerCount}`
      );

      // Cleanup player
      await prisma.registration_players.deleteMany({
        where: { registration_id: testReg.id },
      });
      await prisma.players.delete({ where: { id: testPlayer.id } });
    } finally {
      // Cleanup registration and team
      if (createdRegistrationId) {
        await prisma.payments.deleteMany({
          where: { registration_id: createdRegistrationId },
        });
        await prisma.registrations.delete({
          where: { id: createdRegistrationId },
        });
      }
      await prisma.teams.delete({
        where: { id: testTeam.id },
      });
      await prisma.league_categories.deleteMany({
        where: { league_id: syntheticLeague.id },
      });
      await prisma.leagues.delete({
        where: { id: syntheticLeague.id },
      });
      console.log("  [CLEANUP] Deleted test registration, team, player, and league fixtures.");
    }

    console.log("\n--- 5. POST-CLEANUP VERIFICATION ---");
    const finalSummary = await getDashboardSummaryCounts();
    assert(
      finalSummary.pendingRegistrations === initialSummary.pendingRegistrations,
      "Test 5A: Pending registrations count reverted exactly after cleanup"
    );
    assert(
      finalSummary.pendingPayments === initialSummary.pendingPayments,
      "Test 5B: Pending payments count reverted exactly after cleanup"
    );
    assert(
      finalSummary.totalRegistrations === initialSummary.totalRegistrations,
      "Test 5C: Total registrations count reverted exactly after cleanup"
    );

  } finally {
    await prisma.$disconnect();
  }

  console.log("\n===============================================================");
  console.log(`VERIFICATION SUMMARY: ${passes} PASSED, ${failures} FAILED`);
  console.log("===============================================================\n");

  if (failures > 0) {
    throw new Error(`${failures} test(s) failed.`);
  }
}

runVerification().catch((err) => {
  console.error("\n[VERIFICATION ERROR]:", err.message || err);
  process.exit(1);
});
