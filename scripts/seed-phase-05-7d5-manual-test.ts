import "./load-env";
import pg from "pg";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { calculateRegistrationAccounting } from "../lib/admin/accounting";

/**
 * DEVELOPMENT-ONLY Manual Testing Seed
 * Phase 05.7D.5 — Legacy Payment Allocation
 *
 * Usage:
 *   pnpm seed:05-7d5
 *   OR
 *   tsx scripts/seed-phase-05-7d5-manual-test.ts
 */

const TARGET_DATABASE = "mva_dev";

const TEST_SCENARIOS = [
  {
    key: "A",
    name: "TEST D5 Pending Assessment",
    slug: "test-d5-pending-assessment",
    code: "MVA-D5-PENDING",
    expectedBanner: "NO",
    expectedAllocate: "NO",
    expectedPaid: "7/7 (COMPLETE)",
    expectedRemaining: "₱0.00",
    expectedCollections: "₱2,100.00",
    desc: "7 direct verified ₱300 payments + one ₱2,100 PENDING assessment note. Proves pending assessments do not trigger false review warnings.",
  },
  {
    key: "B",
    name: "TEST D5 Legacy Unallocated",
    slug: "test-d5-legacy-unallocated",
    code: "MVA-D5-UNALLOC",
    expectedBanner: "YES",
    expectedAllocate: "YES",
    expectedPaid: "0/7 (INCOMPLETE)",
    expectedRemaining: "₱2,100.00",
    expectedCollections: "₱2,100.00",
    desc: "1 unallocated VERIFIED ₱2,100 legacy payment with 0 allocations. Primary scenario for manual allocation testing.",
  },
  {
    key: "C",
    name: "TEST D5 Partial Reconcile",
    slug: "test-d5-partial-reconcile",
    code: "MVA-D5-PARTIAL",
    expectedBanner: "YES",
    expectedAllocate: "YES",
    expectedPaid: "3/7 (INCOMPLETE)",
    expectedRemaining: "₱1,200.00",
    expectedCollections: "₱2,100.00",
    desc: "1 VERIFIED ₱2,100 payment with ₱900 allocated across 3 players. Proves partial allocation tracking and ongoing warning visibility.",
  },
  {
    key: "D",
    name: "TEST D5 Fully Reconciled",
    slug: "test-d5-fully-reconciled",
    code: "MVA-D5-RECONCILED",
    expectedBanner: "NO",
    expectedAllocate: "NO",
    expectedPaid: "7/7 (COMPLETE)",
    expectedRemaining: "₱0.00",
    expectedCollections: "₱2,100.00",
    desc: "1 VERIFIED ₱2,100 payment fully allocated across all 7 players (₱2,100). Proves warning banner and Allocate button disappear while history remains.",
  },
  {
    key: "E",
    name: "TEST D5 Reversed Allocation",
    slug: "test-d5-reversed-allocation",
    code: "MVA-D5-REVERSED",
    expectedBanner: "YES",
    expectedAllocate: "YES",
    expectedPaid: "1/7 (INCOMPLETE)",
    expectedRemaining: "₱1,800.00",
    expectedCollections: "₱2,100.00",
    desc: "1 VERIFIED ₱2,100 payment with 1 active ₱300 allocation and 1 reversed ₱300 allocation. Proves reversal restores unallocated balance and review warning.",
  },
];

async function verifyEnvironmentSafety(connectionString: string) {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed because this is not the approved development database: NODE_ENV is set to 'production'."
    );
  }

  // Refuse cloud/remote Supabase connection strings
  const lowerConn = connectionString.toLowerCase();
  if (
    lowerConn.includes("supabase.co") ||
    lowerConn.includes("supabase.com") ||
    lowerConn.includes("pooler.supabase") ||
    lowerConn.includes("aws")
  ) {
    throw new Error(
      "Refusing to seed because this is not the approved development database: Detected remote/cloud connection string."
    );
  }

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    const probeRes = await client.query(
      "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
    );
    const probe = probeRes.rows[0];

    console.log("[SAFETY PROBE] Inspecting target database environment:");
    console.log(`  - Database: "${probe.current_database}"`);
    console.log(`  - User: "${probe.current_user}"`);
    console.log(`  - Server Addr: ${probe.inet_server_addr ?? "local socket / ::1"}`);
    console.log(`  - Server Port: ${probe.inet_server_port ?? 5432}`);

    if (probe.current_database !== TARGET_DATABASE) {
      throw new Error(
        `Refusing to seed because this is not the approved development database: Connected to "${probe.current_database}", expected "${TARGET_DATABASE}".`
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
        `Refusing to seed because this is not the approved development database: Non-local address "${addr}" detected.`
      );
    }

    console.log("  PASS: Approved local development database confirmed.\n");
  } finally {
    await client.end();
  }
}

async function run() {
  console.log("================================================================================");
  console.log("  MVA PHASE 05.7D.5 — MANUAL TESTING SEED UTILITY");
  console.log("================================================================================\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL environment variable.");
  }

  // 1. SAFETY PROBE
  await verifyEnvironmentSafety(connectionString);

  // 2. CONNECT PRISMA
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    // 3. RESOLVE LEAGUE & CATEGORY
    const league = await prisma.leagues.findFirst({
      where: { status: "OPEN_FOR_REGISTRATION" },
      include: {
        league_categories: true,
      },
    });

    if (!league) {
      throw new Error(
        "No league with status 'OPEN_FOR_REGISTRATION' found in mva_dev. Please ensure at least one open tournament exists."
      );
    }

    const category =
      league.league_categories.find((c) => Number(c.registration_fee) === 300) ||
      league.league_categories[0];

    if (!category) {
      throw new Error(`No category found in open league "${league.name}".`);
    }

    console.log(`[CONTEXT] Using active development tournament context:`);
    console.log(`  - League: "${league.name}" (${league.id})`);
    console.log(
      `  - Category: "${category.name}" (${category.id}) — Registration Fee: ₱${Number(
        category.registration_fee
      )}/player\n`
    );

    // 4. RESOLVE ADMIN PROFILE FOR ALLOCATION ATTRIBUTION
    let adminProfile = await prisma.profiles.findFirst({
      where: {
        admin_access: {
          role: "ADMIN",
          is_active: true,
        },
      },
    });

    if (!adminProfile) {
      console.log("[ADMIN CONTEXT] No existing admin profile found. Creating standard dev admin...");
      adminProfile = await prisma.profiles.create({
        data: {
          auth_user_id: "00000000-0000-0000-0000-00000000057d",
          email: "admin-dev@mva.local",
          display_name: "MVA Dev Administrator",
          admin_access: {
            create: {
              role: "ADMIN",
              is_active: true,
            },
          },
        },
      });
    }

    console.log(
      `[ADMIN CONTEXT] Attributing test audit records to admin: ${adminProfile.display_name} (${adminProfile.id})\n`
    );

    // 5. IDEMPOTENT RESET: Delete ONLY previous Phase 05.7D.5 test records
    console.log("[RESET] Cleaning up any previous Phase 05.7D.5 test records...");
    const testCodes = TEST_SCENARIOS.map((s) => s.code);
    const testSlugs = TEST_SCENARIOS.map((s) => s.slug);

    const existingRegs = await prisma.registrations.findMany({
      where: {
        OR: [{ registration_code: { in: testCodes } }, { teams: { slug: { in: testSlugs } } }],
      },
      select: {
        id: true,
        team_id: true,
        registration_players: { select: { id: true, player_id: true } },
        payments: { select: { id: true } },
      },
    });

    if (existingRegs.length > 0) {
      const regIds = existingRegs.map((r) => r.id);
      const teamIds = existingRegs.map((r) => r.team_id);
      const rpIds = existingRegs.flatMap((r) => r.registration_players.map((rp) => rp.id));
      const playerIds = existingRegs.flatMap((r) => r.registration_players.map((rp) => rp.player_id));
      const payIds = existingRegs.flatMap((r) => r.payments.map((p) => p.id));

      // Delete allocations for these payments or registration players
      await prisma.payment_allocations.deleteMany({
        where: {
          OR: [{ payment_id: { in: payIds } }, { registration_player_id: { in: rpIds } }],
        },
      });

      // Delete audit logs referencing these test records
      await prisma.admin_audit_logs.deleteMany({
        where: {
          OR: [
            { entity_id: { in: payIds } },
            { entity_id: { in: regIds } },
            { entity_id: { in: rpIds } },
          ],
        },
      });

      // Delete payments
      await prisma.payments.deleteMany({
        where: { id: { in: payIds } },
      });

      // Delete registration players
      await prisma.registration_players.deleteMany({
        where: { id: { in: rpIds } },
      });

      // Delete registrations
      await prisma.registrations.deleteMany({
        where: { id: { in: regIds } },
      });

      // Delete teams
      await prisma.teams.deleteMany({
        where: { id: { in: teamIds } },
      });

      // Delete players
      await prisma.players.deleteMany({
        where: {
          OR: [{ id: { in: playerIds } }, { first_name: { startsWith: "D5 " } }],
        },
      });

      console.log(`  PASS: Removed ${existingRegs.length} existing test registration(s) safely.\n`);
    } else {
      console.log("  PASS: No existing test records found. Ready for fresh seeding.\n");
    }

    // Helper: Create 7 Active Roster Players for a given registration
    const createRosterPlayers = async (regId: string, prefix: string) => {
      const positions = [
        "Setter",
        "Outside Hitter",
        "Opposite",
        "Middle Blocker",
        "Libero",
        "Outside Hitter",
        "Utility",
      ];
      const playersCreated: Array<{ rpId: string; playerId: string; fullName: string }> = [];

      for (let i = 1; i <= 7; i++) {
        const numStr = String(i).padStart(2, "0");
        const player = await prisma.players.create({
          data: {
            first_name: `D5 ${prefix}`,
            last_name: `Player ${numStr}`,
          },
        });

        const rp = await prisma.registration_players.create({
          data: {
            registration_id: regId,
            player_id: player.id,
            jersey_number: i,
            position: positions[i - 1],
            is_captain: i === 1,
            status: "ACTIVE",
          },
        });

        playersCreated.push({
          rpId: rp.id,
          playerId: player.id,
          fullName: `D5 ${prefix} Player ${numStr}`,
        });
      }

      return playersCreated;
    };

    console.log("[SEEDING] Creating deterministic test scenarios...\n");
    const seededResults: Array<{
      scenarioKey: string;
      teamName: string;
      regId: string;
      regCode: string;
      expectedBanner: string;
      expectedAllocate: string;
      expectedPaid: string;
      expectedRemaining: string;
      expectedCollections: string;
      desc: string;
    }> = [];

    // =========================================================================
    // SCENARIO A: TEST D5 Pending Assessment
    // =========================================================================
    {
      const teamA = await prisma.teams.create({
        data: {
          team_name: "TEST D5 Pending Assessment",
          slug: "test-d5-pending-assessment",
        },
      });

      const regA = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: category.id,
          team_id: teamA.id,
          registration_code: "MVA-D5-PENDING",
          status: "VERIFIED",
          registrant_first_name: "Leader",
          registrant_last_name: "Assessment",
          registrant_contact: "09170000001",
          verified_at: new Date(),
        },
      });

      const playersA = await createRosterPlayers(regA.id, "Pending");

      // 7 Direct VERIFIED per-player payments of ₱300
      for (let i = 0; i < playersA.length; i++) {
        await prisma.payments.create({
          data: {
            registration_id: regA.id,
            registration_player_id: playersA[i].rpId,
            amount: new Prisma.Decimal(300.0),
            payment_method: "CASH",
            status: "VERIFIED",
            reference_number: `CASH-D5-PA-0${i + 1}`,
            verified_at: new Date(),
            verified_by_profile_id: adminProfile.id,
          },
        });
      }

      // 1 Historical NULL-player PENDING assessment payment
      await prisma.payments.create({
        data: {
          registration_id: regA.id,
          registration_player_id: null,
          amount: new Prisma.Decimal(2100.0),
          payment_method: "CASH",
          status: "PENDING",
          notes: "Registration fee assessment: 7 players × ₱300.",
          reference_number: "ASSESS-D5-PENDING",
        },
      });

      seededResults.push({
        scenarioKey: "A",
        teamName: teamA.team_name,
        regId: regA.id,
        regCode: regA.registration_code!,
        expectedBanner: "NO",
        expectedAllocate: "NO",
        expectedPaid: "7/7 (COMPLETE)",
        expectedRemaining: "₱0.00",
        expectedCollections: "₱2,100.00",
        desc: "7 direct verified ₱300 payments + one ₱2,100 PENDING assessment note.",
      });
      console.log(`  ✓ Seeded Scenario A: "${teamA.team_name}" (${regA.registration_code})`);
    }

    // =========================================================================
    // SCENARIO B: TEST D5 Legacy Unallocated
    // =========================================================================
    {
      const teamB = await prisma.teams.create({
        data: {
          team_name: "TEST D5 Legacy Unallocated",
          slug: "test-d5-legacy-unallocated",
        },
      });

      const regB = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: category.id,
          team_id: teamB.id,
          registration_code: "MVA-D5-UNALLOC",
          status: "VERIFIED",
          registrant_first_name: "Leader",
          registrant_last_name: "Legacy",
          registrant_contact: "09170000002",
          verified_at: new Date(),
        },
      });

      await createRosterPlayers(regB.id, "Legacy");

      // 1 VERIFIED NULL-player legacy parent payment of ₱2,100 with zero allocations
      await prisma.payments.create({
        data: {
          registration_id: regB.id,
          registration_player_id: null,
          amount: new Prisma.Decimal(2100.0),
          payment_method: "CASH",
          status: "VERIFIED",
          reference_number: "CASH-D5-UNALLOC",
          verified_at: new Date(),
          verified_by_profile_id: adminProfile.id,
          notes: "Manual test: verified legacy team payment, unallocated.",
        },
      });

      seededResults.push({
        scenarioKey: "B",
        teamName: teamB.team_name,
        regId: regB.id,
        regCode: regB.registration_code!,
        expectedBanner: "YES",
        expectedAllocate: "YES",
        expectedPaid: "0/7 (INCOMPLETE)",
        expectedRemaining: "₱2,100.00",
        expectedCollections: "₱2,100.00",
        desc: "1 unallocated VERIFIED ₱2,100 legacy payment with 0 allocations. Main team for manual allocation testing.",
      });
      console.log(`  ✓ Seeded Scenario B: "${teamB.team_name}" (${regB.registration_code})`);
    }

    // =========================================================================
    // SCENARIO C: TEST D5 Partial Reconcile
    // =========================================================================
    {
      const teamC = await prisma.teams.create({
        data: {
          team_name: "TEST D5 Partial Reconcile",
          slug: "test-d5-partial-reconcile",
        },
      });

      const regC = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: category.id,
          team_id: teamC.id,
          registration_code: "MVA-D5-PARTIAL",
          status: "VERIFIED",
          registrant_first_name: "Leader",
          registrant_last_name: "Partial",
          registrant_contact: "09170000003",
          verified_at: new Date(),
        },
      });

      const playersC = await createRosterPlayers(regC.id, "Partial");

      // 1 VERIFIED NULL-player payment of ₱2,100
      const paymentC = await prisma.payments.create({
        data: {
          registration_id: regC.id,
          registration_player_id: null,
          amount: new Prisma.Decimal(2100.0),
          payment_method: "CASH",
          status: "VERIFIED",
          reference_number: "CASH-D5-PARTIAL",
          verified_at: new Date(),
          verified_by_profile_id: adminProfile.id,
          notes: "Manual test: verified legacy team payment, partially allocated.",
        },
      });

      // Active allocations for first 3 players (₱300 each = ₱900)
      for (let i = 0; i < 3; i++) {
        await prisma.payment_allocations.create({
          data: {
            payment_id: paymentC.id,
            registration_player_id: playersC[i].rpId,
            amount: new Prisma.Decimal(300.0),
            allocated_by_profile_id: adminProfile.id,
            reconciliation_note: `Manual test: attributed ₱300 credit to ${playersC[i].fullName}`,
          },
        });
      }

      seededResults.push({
        scenarioKey: "C",
        teamName: teamC.team_name,
        regId: regC.id,
        regCode: regC.registration_code!,
        expectedBanner: "YES",
        expectedAllocate: "YES",
        expectedPaid: "3/7 (INCOMPLETE)",
        expectedRemaining: "₱1,200.00",
        expectedCollections: "₱2,100.00",
        desc: "1 VERIFIED ₱2,100 payment with ₱900 allocated across 3 players (₱1,200 remaining).",
      });
      console.log(`  ✓ Seeded Scenario C: "${teamC.team_name}" (${regC.registration_code})`);
    }

    // =========================================================================
    // SCENARIO D: TEST D5 Fully Reconciled
    // =========================================================================
    {
      const teamD = await prisma.teams.create({
        data: {
          team_name: "TEST D5 Fully Reconciled",
          slug: "test-d5-fully-reconciled",
        },
      });

      const regD = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: category.id,
          team_id: teamD.id,
          registration_code: "MVA-D5-RECONCILED",
          status: "VERIFIED",
          registrant_first_name: "Leader",
          registrant_last_name: "Reconciled",
          registrant_contact: "09170000004",
          verified_at: new Date(),
        },
      });

      const playersD = await createRosterPlayers(regD.id, "Reconciled");

      // 1 VERIFIED NULL-player payment of ₱2,100
      const paymentD = await prisma.payments.create({
        data: {
          registration_id: regD.id,
          registration_player_id: null,
          amount: new Prisma.Decimal(2100.0),
          payment_method: "CASH",
          status: "VERIFIED",
          reference_number: "CASH-D5-RECON",
          verified_at: new Date(),
          verified_by_profile_id: adminProfile.id,
          notes: "Manual test: verified legacy team payment, fully reconciled.",
        },
      });

      // Active allocations for all 7 players (7 × ₱300 = ₱2,100)
      for (let i = 0; i < playersD.length; i++) {
        await prisma.payment_allocations.create({
          data: {
            payment_id: paymentD.id,
            registration_player_id: playersD[i].rpId,
            amount: new Prisma.Decimal(300.0),
            allocated_by_profile_id: adminProfile.id,
            reconciliation_note: `Manual test: fully attributed ₱300 to ${playersD[i].fullName}`,
          },
        });
      }

      seededResults.push({
        scenarioKey: "D",
        teamName: teamD.team_name,
        regId: regD.id,
        regCode: regD.registration_code!,
        expectedBanner: "NO",
        expectedAllocate: "NO",
        expectedPaid: "7/7 (COMPLETE)",
        expectedRemaining: "₱0.00",
        expectedCollections: "₱2,100.00",
        desc: "1 VERIFIED ₱2,100 payment fully allocated across all 7 players. Proves warning clears and Allocate is hidden.",
      });
      console.log(`  ✓ Seeded Scenario D: "${teamD.team_name}" (${regD.registration_code})`);
    }

    // =========================================================================
    // SCENARIO E: TEST D5 Reversed Allocation
    // =========================================================================
    {
      const teamE = await prisma.teams.create({
        data: {
          team_name: "TEST D5 Reversed Allocation",
          slug: "test-d5-reversed-allocation",
        },
      });

      const regE = await prisma.registrations.create({
        data: {
          league_id: league.id,
          league_category_id: category.id,
          team_id: teamE.id,
          registration_code: "MVA-D5-REVERSED",
          status: "VERIFIED",
          registrant_first_name: "Leader",
          registrant_last_name: "Reversed",
          registrant_contact: "09170000005",
          verified_at: new Date(),
        },
      });

      const playersE = await createRosterPlayers(regE.id, "Reversed");

      // 1 VERIFIED NULL-player payment of ₱2,100
      const paymentE = await prisma.payments.create({
        data: {
          registration_id: regE.id,
          registration_player_id: null,
          amount: new Prisma.Decimal(2100.0),
          payment_method: "CASH",
          status: "VERIFIED",
          reference_number: "CASH-D5-REVERSED",
          verified_at: new Date(),
          verified_by_profile_id: adminProfile.id,
          notes: "Manual test: verified legacy team payment with reversed allocation history.",
        },
      });

      // 1 Active allocation for Player 1
      await prisma.payment_allocations.create({
        data: {
          payment_id: paymentE.id,
          registration_player_id: playersE[0].rpId,
          amount: new Prisma.Decimal(300.0),
          allocated_by_profile_id: adminProfile.id,
          reconciliation_note: `Manual test: attributed ₱300 credit to ${playersE[0].fullName}`,
        },
      });

      // 1 Reversed allocation for Player 2
      await prisma.payment_allocations.create({
        data: {
          payment_id: paymentE.id,
          registration_player_id: playersE[1].rpId,
          amount: new Prisma.Decimal(300.0),
          allocated_by_profile_id: adminProfile.id,
          reconciliation_note: `Manual test: initial allocation to ${playersE[1].fullName}`,
          reversed_at: new Date(),
          reversed_by_profile_id: adminProfile.id,
          reversal_reason: "Manual test: intentional allocation reversal of Player 2 credit",
        },
      });

      seededResults.push({
        scenarioKey: "E",
        teamName: teamE.team_name,
        regId: regE.id,
        regCode: regE.registration_code!,
        expectedBanner: "YES",
        expectedAllocate: "YES",
        expectedPaid: "1/7 (INCOMPLETE)",
        expectedRemaining: "₱1,800.00",
        expectedCollections: "₱2,100.00",
        desc: "1 VERIFIED ₱2,100 payment with 1 active ₱300 allocation and 1 reversed ₱300 allocation (₱1,800 remaining).",
      });
      console.log(`  ✓ Seeded Scenario E: "${teamE.team_name}" (${regE.registration_code})`);
    }

    console.log("\n[VALIDATION] Running canonical accounting calculations on seeded registrations...\n");

    for (const item of seededResults) {
      const reg = await prisma.registrations.findUniqueOrThrow({
        where: { id: item.regId },
        include: {
          teams: true,
          leagues: true,
          league_categories_registrations_league_category_idToleague_categories: true,
          registration_players: {
            include: {
              players: true,
              payments: true,
              payment_allocations: {
                include: { payments: true },
              },
            },
          },
          payments: {
            include: {
              payment_allocations: true,
            },
          },
        },
      });

      const acct = calculateRegistrationAccounting(reg);
      const formatPeso = (val: number | Prisma.Decimal) =>
        `₱${Number(val).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      const remainingFormatted = formatPeso(acct.unallocatedVerifiedAmount);
      const collectionsFormatted = formatPeso(acct.grossVerifiedCollections);
      const paidFormatted = `${acct.paidPlayerCount}/${acct.rosterCount} (${acct.paymentCompletionStatus})`;

      if (remainingFormatted !== item.expectedRemaining) {
        throw new Error(
          `Accounting mismatch for ${item.teamName}: remaining was ${remainingFormatted}, expected ${item.expectedRemaining}`
        );
      }
      if (collectionsFormatted !== item.expectedCollections) {
        throw new Error(
          `Accounting mismatch for ${item.teamName}: gross collections was ${collectionsFormatted}, expected ${item.expectedCollections}`
        );
      }
      if (paidFormatted !== item.expectedPaid) {
        throw new Error(
          `Accounting mismatch for ${item.teamName}: paid players was ${paidFormatted}, expected ${item.expectedPaid}`
        );
      }

      console.log(`  ✓ Validated ${item.teamName}:`);
      console.log(`    - Warning Banner: ${acct.hasUnallocatedVerifiedLegacyPayments ? "YES" : "NO"}`);
      console.log(`    - Paid Players: ${paidFormatted}`);
      console.log(`    - Remaining Unallocated: ${remainingFormatted}`);
      console.log(`    - Gross Collections: ${collectionsFormatted}`);
    }

    console.log("\n================================================================================");
    console.log("  MANUAL TEST DASHBOARD & ROUTE DIRECTORY");
    console.log("================================================================================\n");

    for (const item of seededResults) {
      console.log(`[TEAM ${item.scenarioKey}] ${item.teamName}`);
      console.log(`  Registration ID:   ${item.regId}`);
      console.log(`  Registration Code: ${item.regCode}`);
      console.log(`  Browser URL:       http://localhost:3000/admin/registrations/${item.regId}`);
      console.log(`  Expected State:`);
      console.log(`    - "Payment needs review" Banner: ${item.expectedBanner}`);
      console.log(`    - "Allocate to Players" Button:  ${item.expectedAllocate}`);
      console.log(`    - Paid Players:                  ${item.expectedPaid}`);
      console.log(`    - Remaining Unallocated:         ${item.expectedRemaining}`);
      console.log(`    - Gross Verified Collections:    ${item.expectedCollections}`);
      console.log(`  Scenario Summary:  ${item.desc}\n`);
    }

    console.log("================================================================================");
    console.log("  MANUAL TESTING CHECKLIST FOR BROWSER VERIFICATION");
    console.log("================================================================================\n");
    console.log(`A. TEST D5 Pending Assessment:
   1. Open: http://localhost:3000/admin/registrations/${seededResults[0].regId}
   2. Confirm: NO amber "Payment needs review" banner at the top of the registration.
   3. Scroll to Payment Transactions:
      - Confirm 7 direct per-player payments (₱300 each) are VERIFIED.
      - Confirm the ₱2,100 record displays as "Unassigned Pending Payment".
      - Confirm there is NO "Allocate to Players" button for the pending record.
   4. Confirm Tournament Roster displays: "7 of 7 Paid" and "Payment Complete" badge.

B. TEST D5 Legacy Unallocated (Primary Workflow Test):
   1. Open: http://localhost:3000/admin/registrations/${seededResults[1].regId}
   2. Confirm: Amber "Payment needs review" banner IS visible with amount ₱2,100.00.
   3. Confirm: Tournament Roster displays: "0 of 7 Paid" and "Payment Incomplete".
   4. Scroll to Payment Transactions:
      - Confirm card displays: "Legacy Unallocated Payment".
      - Original Amount: ₱2,100.00, Allocated: ₱0.00, Remaining: ₱2,100.00.
      - Confirm "[ Allocate to Players ]" button IS visible.
   5. Click "[ Allocate to Players ]":
      - Check "Player 01" (suggested amount ₱300.00).
      - Enter Note: "Allocating initial ₱300 to Player 1"
      - Click "Confirm Allocation".
   6. Confirm:
      - Player 01 becomes "PAID" ("Paid via Allocation").
      - Remaining Unallocated updates to ₱1,800.00.
      - Banner remains visible with ₱1,800.00.
      - Gross collections remains ₱2,100.00 (not doubled).

C. Continue Allocating Until All 7 Players Paid:
   1. Click "[ Allocate to Players ]" again on Team B.
   2. Check the remaining 6 players (Players 02 to 07, ₱300 each = ₱1,800 total).
   3. Enter Note: "Allocating remaining legacy funds to players 2 through 7".
   4. Click "Confirm Allocation".
   5. Confirm:
      - Remaining Unallocated becomes ₱0.00.
      - Amber "Payment needs review" banner AUTOMATICALLY DISAPPEARS.
      - Card label updates to "Legacy Payment — Fully Reconciled".
      - "[ Allocate to Players ]" button DISAPPEARS.
      - Roster shows 7 of 7 Paid and "Payment Complete".

D. Reverse One ₱300 Allocation:
   1. Expand "Allocation History" on Team B.
   2. Click "Reverse" on any active allocation.
   3. Enter reason: "Reversing test allocation" and submit.
   4. Confirm:
      - Remaining Unallocated returns to ₱300.00.
      - Amber "Payment needs review" banner REAPPEARS with ₱300.00.
      - "[ Allocate to Players ]" button REAPPEARS.
      - Affected player's status returns to Unpaid.

E. TEST D5 Partial Reconcile:
   1. Open: http://localhost:3000/admin/registrations/${seededResults[2].regId}
   2. Confirm: "Payment needs review" banner is visible.
   3. Confirm: 3 of 7 players are paid.
   4. Confirm: Allocated = ₱900.00, Remaining = ₱1,200.00.
   5. Confirm: "[ Allocate to Players ]" button is visible.

F. TEST D5 Fully Reconciled:
   1. Open: http://localhost:3000/admin/registrations/${seededResults[3].regId}
   2. Confirm: NO amber warning banner.
   3. Confirm: 7 of 7 players paid ("Payment Complete").
   4. Confirm: Card label is "Legacy Payment — Fully Reconciled".
   5. Confirm: "[ Allocate to Players ]" is hidden.
   6. Confirm: "Allocation History" lists 7 allocations, each with a "Reverse" button.

G. All Payments Admin View:
   1. Open: http://localhost:3000/admin/payments
   2. Confirm each test scenario renders its proper canonical label:
      - Pending Assessment: "Unassigned Pending Payment"
      - Legacy Unallocated: "Legacy Unallocated Payment"
      - Partial Reconcile:  "Legacy Unallocated Payment"
      - Fully Reconciled:   "Legacy Payment — Fully Reconciled"
`);

    console.log("================================================================================");
    console.log("  DEV SEED COMPLETE: All test scenarios created and verified successfully!");
    console.log("================================================================================\n");
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

run().catch((err) => {
  console.error("\n❌ SEED SCRIPT FAILED:");
  console.error(err.message || err);
  process.exit(1);
});
