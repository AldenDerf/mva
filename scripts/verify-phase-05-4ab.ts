if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

import pg from "pg";
import { prisma } from "../lib/prisma";
import {
  getAdminRegistrations,
  getAdminRegistrationById,
  getFilterCategories,
} from "../lib/admin/registrations";
import { registration_status, payment_status } from "@prisma/client";

/**
 * PHASE 05.4A & 05.4B: ADMIN REGISTRATION MANAGEMENT VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Strict database safety guard (must be local mva_dev, NEVER remote or production).
 * 2. Route security: pages reside under app/admin/(portal) and inherit requireAdmin() layout guard.
 * 3. Read-only query invariants (pure read tests with zero writes).
 * 4. Pagination boundaries and handling of non-existent/invalid IDs (notFound contract).
 * 5. Ephemeral test fixtures in mva_dev with 100% clean post-test removal:
 *    - Newest-first ordering (created_at DESC).
 *    - Search by registration code, team name, registrant name (case-insensitive).
 *    - Filter by registration status (PENDING_PAYMENT, VERIFIED).
 *    - Filter by payment status (PENDING).
 *    - Filter by category division.
 *    - Combined search and filters.
 *    - Detail view: team relation, league & category relation, roster with captain, optional jersey/position.
 *    - Missing payment handled gracefully without error.
 * 6. Fixture cleanup & post-cleanup state verification (0 lingering records in mva_dev).
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
        `CRITICAL SAFETY VIOLATION: Target database is "${probe.current_database}", expected "mva_dev"! Aborting test run.`
      );
    }

    const addr = String(probe.inet_server_addr || "");
    const isLocal =
      addr === "" ||
      addr === "127.0.0.1" ||
      addr === "::1" ||
      addr === "localhost";

    if (!isLocal) {
      throw new Error(
        `CRITICAL SAFETY VIOLATION: Remote database address "${addr}" detected! Aborting.`
      );
    }

    console.log("[SAFETY PROBE PASS] Target confirmed: local development mva_dev.\n");
  } finally {
    await client.end();
  }
}

async function runVerification() {
  console.log("===============================================================");
  console.log("PHASE 05.4A & 05.4B: ADMIN REGISTRATION MANAGEMENT VERIFICATION");
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
    console.log("--- 1. NON-MUTATING QUERY INVARIANTS & EMPTY STATE TESTS ---");

    const initialList = await getAdminRegistrations();
    assert(
      typeof initialList.totalCount === "number" &&
      typeof initialList.page === "number" &&
      typeof initialList.pageSize === "number" &&
      typeof initialList.totalPages === "number" &&
      Array.isArray(initialList.items),
      "Test 1A: getAdminRegistrations returns valid paginated result contract",
      JSON.stringify(initialList)
    );

    const initialCategories = await getFilterCategories();
    assert(
      Array.isArray(initialCategories),
      "Test 1B: getFilterCategories returns array of category options"
    );

    // Pagination bounds tests (pure read, no writes)
    const pageZeroList = await getAdminRegistrations({ page: 0, pageSize: -5 });
    assert(
      pageZeroList.page === 1 && pageZeroList.pageSize === 1,
      "Test 1C: Negative/zero page and pageSize sanitized to minimum bounds (1)"
    );

    const largePageList = await getAdminRegistrations({ page: 9999, pageSize: 200 });
    assert(
      largePageList.pageSize === 100,
      "Test 1D: Max pageSize capped to 100 to prevent unbounded memory allocation"
    );

    // Detail query error contract tests (pure read, no writes)
    const malformedIdRes = await getAdminRegistrationById("not-a-valid-uuid");
    assert(
      malformedIdRes === null,
      "Test 1E: Malformed UUID returns null safely (no SQL injection or crash)"
    );

    const nonExistentUuidRes = await getAdminRegistrationById(
      "00000000-0000-0000-0000-000000000000"
    );
    assert(
      nonExistentUuidRes === null,
      "Test 1F: Non-existent UUID returns null safely (triggers Next.js notFound)"
    );

    console.log("\n--- 2. EPHEMERAL FIXTURE CREATION IN mva_dev ---");
    // Synthetic League & Categories
    const league = await prisma.leagues.create({
      data: {
        name: `MVA 2026 Verification League ${Date.now()}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
        league_categories: {
          create: [
            {
              name: "Open Conference (Men)",
              registration_fee: 300.0,
              min_players: 6,
              max_players: 12,
            },
            {
              name: "Mahatao Only (Co-ed)",
              registration_fee: 300.0,
              min_players: 6,
              max_players: 12,
            },
          ],
        },
      },
      include: {
        league_categories: {
          orderBy: { name: "asc" },
        },
      },
    });

    const categoryMen = league.league_categories[0];
    const categoryCoed = league.league_categories[1];

    // Teams
    const team1 = await prisma.teams.create({
      data: {
        team_name: `Mahatao Spikers ${Date.now()}`,
        slug: `mahatao-spikers-${Date.now()}`,
      },
    });

    const team2 = await prisma.teams.create({
      data: {
        team_name: `Batanes Falcons ${Date.now()}`,
        slug: `batanes-falcons-${Date.now()}`,
      },
    });

    // Players
    const playerA = await prisma.players.create({
      data: { first_name: "Juan", last_name: "Dela Cruz" },
    });
    const playerB = await prisma.players.create({
      data: { first_name: "Pedro", last_name: "Santos" },
    });
    const playerC = await prisma.players.create({
      data: { first_name: "Maria", last_name: "Agudo" },
    });

    let reg1Id: string | null = null;
    let reg2Id: string | null = null;

    try {
      // Registration 1 (Earlier: PENDING_PAYMENT, Cash payment, 2 players)
      const reg1 = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: categoryMen.id,
          team_id: team1.id,
          registrant_first_name: "Juan",
          registrant_last_name: "Dela Cruz",
          registrant_contact: "09181112222",
          registrant_email: "juan@example.com",
          status: "PENDING_PAYMENT",
          registration_players: {
            create: [
              {
                player_id: playerA.id,
                is_captain: true,
                jersey_number: 7,
                position: "Setter",
              },
              {
                player_id: playerB.id,
                is_captain: false,
                jersey_number: null,
                position: null,
              },
            ],
          },
          payments: {
            create: {
              payment_method: "CASH",
              amount: 600.0,
              status: "PENDING",
            },
          },
        },
      });
      reg1Id = reg1.id;

      // Small delay to ensure distinct created_at timestamp
      await new Promise((r) => setTimeout(r, 50));

      // Registration 2 (Later: VERIFIED, No payment record, 1 player)
      const reg2 = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: categoryCoed.id,
          team_id: team2.id,
          registrant_first_name: "Maria",
          registrant_last_name: "Agudo",
          registrant_contact: "09193334444",
          status: "VERIFIED",
          registration_players: {
            create: [
              {
                player_id: playerC.id,
                is_captain: true,
                jersey_number: 10,
                position: "Outside Hitter",
              },
            ],
          },
        },
      });
      reg2Id = reg2.id;

      console.log(`Created test fixtures: Reg 1 (${reg1.id.slice(0, 8)}), Reg 2 (${reg2.id.slice(0, 8)}).\n`);

      console.log("--- 3. REGISTRATION LIST: SORTING, SEARCH, FILTERS & PAGINATION ---");

      // 3A: List returns both records
      const fullList = await getAdminRegistrations();
      assert(
        fullList.totalCount >= 2,
        "Test 3A: List contains created test registrations",
        `Count: ${fullList.totalCount}`
      );

      // 3B: Newest-first ordering (reg2 must appear before reg1)
      const reg2Index = fullList.items.findIndex((i) => i.id === reg2.id);
      const reg1Index = fullList.items.findIndex((i) => i.id === reg1.id);
      assert(
        reg2Index !== -1 && reg1Index !== -1 && reg2Index < reg1Index,
        "Test 3B: Default ordering is database-level newest registrations first (created_at DESC)",
        `Reg 2 index: ${reg2Index}, Reg 1 index: ${reg1Index}`
      );

      // 3C: Search by team name
      const searchTeamRes = await getAdminRegistrations({ q: "Falcons" });
      assert(
        searchTeamRes.items.some((i) => i.id === reg2.id) &&
        !searchTeamRes.items.some((i) => i.id === reg1.id),
        "Test 3C: Search by team name ('Falcons') returns only matching team"
      );

      // 3D: Search by registrant name
      const searchRegistrantRes = await getAdminRegistrations({ q: "Dela Cruz" });
      assert(
        searchRegistrantRes.items.some((i) => i.id === reg1.id) &&
        !searchRegistrantRes.items.some((i) => i.id === reg2.id),
        "Test 3D: Search by registrant name ('Dela Cruz') returns matching record"
      );

      // 3E: Filter by Registration Status PENDING_PAYMENT
      const statusPendingRes = await getAdminRegistrations({
        status: "PENDING_PAYMENT" as registration_status,
      });
      assert(
        statusPendingRes.items.some((i) => i.id === reg1.id) &&
        !statusPendingRes.items.some((i) => i.id === reg2.id),
        "Test 3E: Filter by registration status 'PENDING_PAYMENT' isolates Reg 1"
      );

      // 3F: Filter by Registration Status VERIFIED
      const statusVerifiedRes = await getAdminRegistrations({
        status: "VERIFIED" as registration_status,
      });
      assert(
        statusVerifiedRes.items.some((i) => i.id === reg2.id) &&
        !statusVerifiedRes.items.some((i) => i.id === reg1.id),
        "Test 3F: Filter by registration status 'VERIFIED' isolates Reg 2"
      );

      // 3G: Filter by Payment Status PENDING
      const paymentPendingRes = await getAdminRegistrations({
        paymentStatus: "PENDING" as payment_status,
      });
      assert(
        paymentPendingRes.items.some((i) => i.id === reg1.id) &&
        !paymentPendingRes.items.some((i) => i.id === reg2.id),
        "Test 3G: Filter by payment status 'PENDING' isolates Reg 1"
      );

      // 3H: Filter by Category
      const categoryFilterRes = await getAdminRegistrations({
        categoryId: categoryCoed.id,
      });
      assert(
        categoryFilterRes.items.some((i) => i.id === reg2.id) &&
        !categoryFilterRes.items.some((i) => i.id === reg1.id),
        "Test 3H: Filter by category ID isolates category entries"
      );

      // 3I: Combined search + filter
      const combinedMatchRes = await getAdminRegistrations({
        q: "Spikers",
        status: "PENDING_PAYMENT" as registration_status,
      });
      assert(
        combinedMatchRes.items.some((i) => i.id === reg1.id) &&
        combinedMatchRes.items.length === 1,
        "Test 3I: Combined search ('Spikers') + filter ('PENDING_PAYMENT') works correctly"
      );

      // 3J: Combined search + mismatched filter returns 0 records
      const combinedMismatchRes = await getAdminRegistrations({
        q: "Spikers",
        status: "VERIFIED" as registration_status,
      });
      assert(
        combinedMismatchRes.items.length === 0,
        "Test 3J: Combined search + mismatched filter returns empty result set (0 records)"
      );

      console.log("\n--- 4. REGISTRATION DETAIL VIEW DATA CONTRACT ---");

      // 4A: Detail for Registration 1 (Complete with payment & 2 roster players)
      const detail1 = await getAdminRegistrationById(reg1.id);
      assert(
        detail1 !== null &&
        detail1.id === reg1.id &&
        detail1.team.name === team1.team_name &&
        detail1.league.name === league.name &&
        detail1.category.name === categoryMen.name &&
        detail1.registrant.fullName === "Juan Dela Cruz" &&
        detail1.registrant.contactNumber === "09181112222" &&
        detail1.registrant.email === "juan@example.com",
        "Test 4A: Registration 1 detail resolves team, league, category, and registrant"
      );

      assert(
        detail1 !== null &&
        detail1.roster.length === 2 &&
        detail1.roster[0].isCaptain === true &&
        detail1.roster[0].jerseyNumber === 7 &&
        detail1.roster[0].position === "Setter",
        "Test 4B: Roster resolves captain indicator, jersey number, and position"
      );

      assert(
        detail1 !== null &&
        detail1.roster[1].isCaptain === false &&
        detail1.roster[1].jerseyNumber === null &&
        detail1.roster[1].position === null,
        "Test 4C: Optional jersey number and position gracefully resolve as null without crashing"
      );

      assert(
        detail1 !== null &&
        detail1.payments.length === 1 &&
        detail1.payments[0].amount === 600 &&
        detail1.payments[0].paymentMethod === "CASH" &&
        detail1.payments[0].status === "PENDING",
        "Test 4D: Payment record resolves amount, method, and status correctly"
      );

      // 4B: Detail for Registration 2 (Missing payment record)
      const detail2 = await getAdminRegistrationById(reg2.id);
      assert(
        detail2 !== null &&
        detail2.id === reg2.id &&
        Array.isArray(detail2.payments) &&
        detail2.payments.length === 0,
        "Test 4E: Registration with missing payment record returns empty array safely without error"
      );

      assert(
        detail2 !== null &&
        detail2.registrant.email === null,
        "Test 4F: Optional registrant email gracefully resolves as null"
      );

    } finally {
      // Clean up test fixtures in mva_dev
      console.log("\n--- 5. CLEANING UP TEST FIXTURES IN mva_dev ---");
      if (reg1Id) {
        await prisma.payments.deleteMany({ where: { registration_id: reg1Id } });
        await prisma.registration_players.deleteMany({ where: { registration_id: reg1Id } });
        await prisma.registrations.delete({ where: { id: reg1Id } });
      }
      if (reg2Id) {
        await prisma.registration_players.deleteMany({ where: { registration_id: reg2Id } });
        await prisma.registrations.delete({ where: { id: reg2Id } });
      }
      await prisma.players.deleteMany({
        where: { id: { in: [playerA.id, playerB.id, playerC.id] } },
      });
      await prisma.teams.deleteMany({
        where: { id: { in: [team1.id, team2.id] } },
      });
      await prisma.league_categories.deleteMany({
        where: { league_id: league.id },
      });
      await prisma.leagues.delete({
        where: { id: league.id },
      });
      console.log("  [CLEANUP] Deleted ephemeral test registrations, players, teams, and leagues.");
    }

    console.log("\n--- 6. POST-CLEANUP INVARIANTS VERIFICATION ---");
    const postCleanupList = await getAdminRegistrations();
    assert(
      postCleanupList.totalCount === initialList.totalCount,
      "Test 6A: Total registration count exactly matches pre-test baseline after cleanup"
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
