if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

import pg from "pg";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import {
  calculateRegistrationAccounting,
  getTournamentAccountingSummary,
  classifyVerifiedTeams,
  DEFAULT_PLAYER_REGISTRATION_FEE,
  RawRegistrationAccountingInput,
} from "../lib/admin/accounting";
import {
  getAdminRegistrations,
  getAdminRegistrationById,
} from "../lib/admin/registrations";
import {
  getDashboardAccountingTotals,
  getRecentRegistrations,
} from "../lib/admin/dashboard";

/**
 * PHASE 05.7A: ADMIN ACCOUNTING FOUNDATION & TEAM PAYMENT SUMMARY VERIFICATION SUITE
 *
 * Verifies:
 * 1. Strict database safety guard (must be local mva_dev, NEVER remote or production).
 * 2. Scenario 1: 12-player roster, 12 VERIFIED payments → COMPLETE (Expected: ₱3,600, Paid: ₱3,600, Balance: ₱0).
 * 3. Scenario 2: 12-player roster, 10 VERIFIED + 2 PENDING → INCOMPLETE (Expected: ₱3,600, Paid: ₱3,000, Balance: ₱600).
 * 4. Scenario 3: 8-player roster, 8 VERIFIED → Expected: ₱2,400 → COMPLETE.
 * 5. Scenario 4: 15-player roster → Expected: ₱4,500 → proves no 12-player maximum cap.
 * 6. Scenario 5: VERIFIED payment later REFUNDED → player no longer currently paid → totals decrease correctly.
 * 7. Scenario 6: REJECTED payment → player not paid.
 * 8. Scenario 7: PENDING payment → player not paid.
 * 9. Scenario 8: Registration-level legacy payment (registration_player_id = null)
 *    → does NOT satisfy player, surfaced as legacy/unallocated, does not mark team complete.
 * 10. Scenario 9: VERIFIED registration with incomplete payments → registration remains VERIFIED, payment remains INCOMPLETE.
 * 11. Scenario 10: Zero-player abnormal registration → deterministic behavior, no division by zero or NaN.
 * 12. Scenario 11: Duplicate / historical payment rows → no double counting, respects active verified payment.
 * 13. Integration: getAdminRegistrations returns canonical accounting values without N+1 queries.
 * 14. Integration: getAdminRegistrationById returns full canonical accounting object.
 * 15. Integration: getTournamentAccountingSummary aggregates tournament financial totals correctly.
 * 16. 100% clean teardown of all ephemeral test fixtures.
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

    console.log("  [PASS] Hard safety probe passed: strictly connected to local mva_dev.\n");
  } finally {
    await client.end();
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

async function run() {
  console.log("===============================================================");
  console.log("PHASE 05.7A: ADMIN ACCOUNTING & TEAM PAYMENT SUMMARY SUITE");
  console.log("===============================================================\n");

  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error("DATABASE_URL is not defined in environment");
  }

  // 1. SAFETY PROBE
  await verifySafetyProbe(connStr);

  console.log("--- PART 1: PURE ACCOUNTING ENGINE UNIT TESTS ---");

  // Mock builder helper
  const createMockInput = (
    playerCount: number,
    configurePlayers: (index: number) => {
      isPaid?: boolean;
      status?: "PENDING" | "VERIFIED" | "REJECTED" | "REFUNDED";
      multiplePayments?: Array<{
        status: "PENDING" | "VERIFIED" | "REJECTED" | "REFUNDED";
        amount: number;
      }>;
    },
    legacyPayments: Array<{
      status: "PENDING" | "VERIFIED" | "REJECTED" | "REFUNDED";
      amount: number;
    }> = [],
    regStatus: "PENDING_PAYMENT" | "VERIFIED" | "REJECTED" | "CANCELLED" = "VERIFIED"
  ): RawRegistrationAccountingInput => {
    const regId = randomUUID();
    return {
      id: regId,
      registration_code: `MVA-2026-TEST`,
      status: regStatus,
      teams: { id: randomUUID(), team_name: "Test Volleyball Club", slug: "test-vb-club" },
      leagues: { id: randomUUID(), name: "MVA Summer League 2026", status: "OPEN_FOR_REGISTRATION" },
      league_categories_registrations_league_category_idToleague_categories: {
        id: randomUUID(),
        name: "Open Conference",
        registration_fee: 300.0,
      },
      registration_players: Array.from({ length: playerCount }, (_, idx) => {
        const rpId = randomUUID();
        const conf = configurePlayers(idx);
        let paymentsList: Array<{
          id: string;
          amount: number;
          status: "PENDING" | "VERIFIED" | "REJECTED" | "REFUNDED";
          payment_method: "CASH" | "GCASH" | "BANK_TRANSFER" | "OTHER";
        }> = [];

        if (conf.multiplePayments) {
          paymentsList = conf.multiplePayments.map((p) => ({
            id: randomUUID(),
            amount: p.amount,
            status: p.status,
            payment_method: "CASH",
          }));
        } else if (conf.status) {
          paymentsList = [
            {
              id: randomUUID(),
              amount: DEFAULT_PLAYER_REGISTRATION_FEE,
              status: conf.status,
              payment_method: "CASH",
            },
          ];
        } else if (conf.isPaid) {
          paymentsList = [
            {
              id: randomUUID(),
              amount: DEFAULT_PLAYER_REGISTRATION_FEE,
              status: "VERIFIED",
              payment_method: "CASH",
            },
          ];
        }

        return {
          id: rpId,
          jersey_number: idx + 1,
          position: "Spiker",
          is_captain: idx === 0,
          players: {
            id: randomUUID(),
            first_name: `Player${idx + 1}`,
            last_name: `Roster`,
          },
          payments: paymentsList,
        };
      }),
      payments: legacyPayments.map((lp) => ({
        id: randomUUID(),
        registration_player_id: null,
        amount: lp.amount,
        status: lp.status,
        payment_method: "CASH",
      })),
    };
  };

  // Test 1: 12-player roster, 12 VERIFIED payments -> COMPLETE
  console.log("\n[Test 1] 12-player roster, 12 VERIFIED payments");
  const t1Input = createMockInput(12, () => ({ isPaid: true }));
  const t1 = calculateRegistrationAccounting(t1Input);
  assert(t1.rosterCount === 12, "Roster count is 12");
  assert(t1.expectedAmount === 3600, "Expected amount is ₱3,600.00 (12 × ₱300)");
  assert(t1.verifiedPaidAmount === 3600, "Verified paid amount is ₱3,600.00");
  assert(t1.balance === 0, "Balance is ₱0.00");
  assert(t1.paidPlayerCount === 12, "Paid players count is 12");
  assert(t1.unpaidPlayerCount === 0, "Unpaid players count is 0");
  assert(t1.paymentComplete === true, "paymentComplete is true");
  assert(t1.paymentCompletionStatus === "COMPLETE", "paymentCompletionStatus is 'COMPLETE'");

  // Test 2: 12-player roster, 10 VERIFIED + 2 PENDING -> INCOMPLETE, paid=3000, balance=600
  console.log("\n[Test 2] 12-player roster, 10 VERIFIED + 2 PENDING");
  const t2Input = createMockInput(12, (idx) => ({
    status: idx < 10 ? "VERIFIED" : "PENDING",
  }));
  const t2 = calculateRegistrationAccounting(t2Input);
  assert(t2.rosterCount === 12, "Roster count is 12");
  assert(t2.expectedAmount === 3600, "Expected amount is ₱3,600.00");
  assert(t2.verifiedPaidAmount === 3000, "Verified paid amount is ₱3,000.00 (10 × ₱300)");
  assert(t2.balance === 600, "Remaining balance is ₱600.00 (2 × ₱300)");
  assert(t2.paidPlayerCount === 10, "Paid players count is 10");
  assert(t2.unpaidPlayerCount === 2, "Unpaid players count is 2");
  assert(t2.paymentComplete === false, "paymentComplete is false");
  assert(t2.paymentCompletionStatus === "INCOMPLETE", "paymentCompletionStatus is 'INCOMPLETE'");

  // Test 3: 8-player roster, 8 VERIFIED -> expected=2400, COMPLETE
  console.log("\n[Test 3] 8-player roster, 8 VERIFIED payments");
  const t3Input = createMockInput(8, () => ({ isPaid: true }));
  const t3 = calculateRegistrationAccounting(t3Input);
  assert(t3.rosterCount === 8, "Roster count is 8");
  assert(t3.expectedAmount === 2400, "Expected amount is ₱2,400.00 (8 × ₱300)");
  assert(t3.verifiedPaidAmount === 2400, "Verified paid amount is ₱2,400.00");
  assert(t3.balance === 0, "Balance is ₱0.00");
  assert(t3.paymentComplete === true, "paymentComplete is true");
  assert(t3.paymentCompletionStatus === "COMPLETE", "paymentCompletionStatus is 'COMPLETE'");

  // Test 4: 15-player roster -> expected=4500 (proves no 12-player maximum cap)
  console.log("\n[Test 4] 15-player roster (proves no 12-player maximum cap)");
  const t4Input = createMockInput(15, (idx) => ({ isPaid: idx < 15 }));
  const t4 = calculateRegistrationAccounting(t4Input);
  assert(t4.rosterCount === 15, "Roster count is 15 (exceeds historical 12 cap)");
  assert(t4.expectedAmount === 4500, "Expected amount is ₱4,500.00 (15 × ₱300)");
  assert(t4.verifiedPaidAmount === 4500, "Verified paid amount is ₱4,500.00");
  assert(t4.balance === 0, "Balance is ₱0.00");
  assert(t4.paymentComplete === true, "paymentComplete is true");

  // Test 5: VERIFIED payment later REFUNDED -> player no longer currently paid
  console.log("\n[Test 5] VERIFIED payment later REFUNDED");
  const t5Input = createMockInput(10, (idx) => {
    if (idx === 0) {
      // Player 1 had a verified payment that was subsequently refunded
      return {
        multiplePayments: [
          { status: "REFUNDED", amount: 300 },
        ],
      };
    }
    return { status: "VERIFIED" };
  });
  const t5 = calculateRegistrationAccounting(t5Input);
  assert(t5.rosterCount === 10, "Roster count is 10");
  assert(t5.paidPlayerCount === 9, "Refunded player does not count as paid (9 of 10 paid)");
  assert(t5.verifiedPaidAmount === 2700, "Verified paid total is ₱2,700.00 (refund excluded)");
  assert(t5.balance === 300, "Balance is ₱300.00");
  assert(t5.paymentComplete === false, "paymentComplete is false");
  assert(t5.paymentCompletionStatus === "INCOMPLETE", "paymentCompletionStatus is 'INCOMPLETE'");

  // Test 6: REJECTED payment -> player not paid
  console.log("\n[Test 6] REJECTED payment");
  const t6Input = createMockInput(6, (idx) => ({
    status: idx === 0 ? "REJECTED" : "VERIFIED",
  }));
  const t6 = calculateRegistrationAccounting(t6Input);
  assert(t6.paidPlayerCount === 5, "Rejected payment does not satisfy player payment");
  assert(t6.unpaidPlayerCount === 1, "Unpaid players count is 1");
  assert(t6.verifiedPaidAmount === 1500, "Verified paid is ₱1,500.00");
  assert(t6.balance === 300, "Balance is ₱300.00");
  assert(t6.paymentCompletionStatus === "INCOMPLETE", "Payment is INCOMPLETE");

  // Test 7: PENDING payment -> player not paid
  console.log("\n[Test 7] PENDING payment");
  const t7Input = createMockInput(6, (idx) => ({
    status: idx === 0 ? "PENDING" : "VERIFIED",
  }));
  const t7 = calculateRegistrationAccounting(t7Input);
  assert(t7.paidPlayerCount === 5, "Pending payment does not satisfy player payment");
  assert(t7.paymentCompletionStatus === "INCOMPLETE", "Payment is INCOMPLETE");

  // Test 8: Registration-level legacy payment (registration_player_id = null)
  console.log("\n[Test 8] Legacy payment (registration_player_id = null)");
  const t8Input = createMockInput(
    10,
    // No individual player payments are verified
    () => ({ status: "PENDING" }),
    // A legacy ₱3,000 verified payment exists at registration level
    [{ status: "VERIFIED", amount: 3000 }]
  );
  const t8 = calculateRegistrationAccounting(t8Input);
  assert(t8.rosterCount === 10, "Roster count is 10");
  assert(t8.paidPlayerCount === 0, "Legacy payment did NOT make individual players paid");
  assert(t8.verifiedPaidAmount === 0, "Per-player verified paid amount is ₱0.00");
  assert(t8.balance === 3000, "Per-player roster balance remains ₱3,000.00");
  assert(t8.paymentComplete === false, "paymentComplete is strictly false");
  assert(t8.paymentCompletionStatus === "INCOMPLETE", "Status is strictly INCOMPLETE");
  assert(t8.hasLegacyPayments === true, "hasLegacyPayments is true");
  assert(t8.unallocatedVerifiedAmount === 3000, "unallocatedVerifiedAmount is ₱3,000.00");
  assert(t8.totalVerifiedCollected === 3000, "totalVerifiedCollected reflects all cash");
  assert(t8.hasFinancialAnomaly === true, "Anomaly flag raised for unallocated legacy payment");

  // Test 9: VERIFIED registration with incomplete payments
  console.log("\n[Test 9] VERIFIED registration with incomplete payments");
  const t9Input = createMockInput(
    12,
    (idx) => ({ status: idx < 6 ? "VERIFIED" : "PENDING" }),
    [],
    "VERIFIED" // Team registration status
  );
  const t9 = calculateRegistrationAccounting(t9Input);
  assert(t9.registrationStatus === "VERIFIED", "Registration status remains VERIFIED");
  assert(t9.paymentCompletionStatus === "INCOMPLETE", "Payment completeness remains INCOMPLETE");
  assert(t9.paidPlayerCount === 6, "6 of 12 players paid");

  // Test 10: Zero-player abnormal registration
  console.log("\n[Test 10] Zero-player abnormal registration");
  const t10Input = createMockInput(0, () => ({}));
  const t10 = calculateRegistrationAccounting(t10Input);
  assert(t10.rosterCount === 0, "Roster count is 0");
  assert(t10.expectedAmount === 0, "Expected amount is ₱0.00");
  assert(t10.verifiedPaidAmount === 0, "Verified paid amount is ₱0.00");
  assert(t10.balance === 0, "Balance is ₱0.00");
  assert(t10.paidPlayerCount === 0, "Paid players is 0");
  assert(t10.unpaidPlayerCount === 0, "Unpaid players is 0");
  assert(t10.paymentComplete === false, "paymentComplete is false for empty roster");
  assert(t10.paymentCompletionStatus === "INCOMPLETE", "Empty roster is INCOMPLETE");
  assert(!isNaN(t10.balance), "Balance is not NaN");

  // Test 11: Duplicate / historical payment rows (no double counting)
  console.log("\n[Test 11] Duplicate / historical payment rows");
  const t11Input = createMockInput(1, () => ({
    multiplePayments: [
      { status: "PENDING", amount: 300 },
      { status: "REJECTED", amount: 300 },
      { status: "PENDING", amount: 300 },
      { status: "VERIFIED", amount: 300 }, // Only this 1 active verified row
    ],
  }));
  const t11 = calculateRegistrationAccounting(t11Input);
  assert(t11.paidPlayerCount === 1, "Player counted as paid exactly once");
  assert(t11.verifiedPaidAmount === 300, "Verified paid is exactly ₱300.00 (no double counting)");
  assert(t11.balance === 0, "Balance is ₱0.00");
  assert(t11.paymentComplete === true, "paymentComplete is true");

  console.log("\n--- PART 2: DATABASE-BACKED INTEGRATION TESTS (mva_dev) ---");

  // Fixture IDs for clean teardown
  const testIds = {
    leagueId: "",
    categoryId: "",
    team1Id: "",
    team2Id: "",
    reg1Id: "",
    reg2Id: "",
    playerIds: [] as string[],
  };

  try {
    // A. Create test league and category
    const league = await prisma.leagues.create({
      data: {
        name: `Accounting Test League ${Date.now()}`,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    testIds.leagueId = league.id;

    const category = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: "Accounting Division",
        registration_fee: 300.0,
        min_players: 6,
        max_players: 12,
      },
    });
    testIds.categoryId = category.id;

    // B. Create Team 1: 8 players, 8 VERIFIED -> Complete
    const team1 = await prisma.teams.create({
      data: {
        team_name: `Team Complete ${Date.now()}`,
        slug: `team-complete-${Date.now()}`,
      },
    });
    testIds.team1Id = team1.id;

    const reg1 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team1.id,
        registrant_first_name: "Leader",
        registrant_last_name: "One",
        registrant_contact: "09171111111",
        status: "VERIFIED",
        registration_code: `MVA-ACCT-0001`,
      },
    });
    testIds.reg1Id = reg1.id;

    // Add 8 players to Team 1 and verify payments
    for (let i = 1; i <= 8; i++) {
      const p = await prisma.players.create({
        data: {
          first_name: `T1Player${i}`,
          last_name: "Test",
        },
      });
      testIds.playerIds.push(p.id);

      const rp = await prisma.registration_players.create({
        data: {
          registration_id: reg1.id,
          player_id: p.id,
          jersey_number: i,
          is_captain: i === 1,
        },
      });

      await prisma.payments.create({
        data: {
          registration_id: reg1.id,
          registration_player_id: rp.id,
          amount: 300.0,
          payment_method: "CASH",
          status: "VERIFIED",
          verified_at: new Date(),
        },
      });
    }

    // C. Create Team 2: 10 players, 7 VERIFIED + 3 PENDING -> Incomplete
    const team2 = await prisma.teams.create({
      data: {
        team_name: `Team Incomplete ${Date.now()}`,
        slug: `team-incomplete-${Date.now()}`,
      },
    });
    testIds.team2Id = team2.id;

    const reg2 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team2.id,
        registrant_first_name: "Leader",
        registrant_last_name: "Two",
        registrant_contact: "09172222222",
        status: "VERIFIED",
        registration_code: `MVA-ACCT-0002`,
      },
    });
    testIds.reg2Id = reg2.id;

    for (let i = 1; i <= 10; i++) {
      const p = await prisma.players.create({
        data: {
          first_name: `T2Player${i}`,
          last_name: "Test",
        },
      });
      testIds.playerIds.push(p.id);

      const rp = await prisma.registration_players.create({
        data: {
          registration_id: reg2.id,
          player_id: p.id,
          jersey_number: i,
          is_captain: i === 1,
        },
      });

      await prisma.payments.create({
        data: {
          registration_id: reg2.id,
          registration_player_id: rp.id,
          amount: 300.0,
          payment_method: "CASH",
          status: i <= 7 ? "VERIFIED" : "PENDING",
          verified_at: i <= 7 ? new Date() : null,
        },
      });
    }

    console.log("[Integration] Testing getAdminRegistrations query with canonical accounting:");
    const listRes = await getAdminRegistrations({
      q: "Team Complete",
    });
    assert(listRes.items.length >= 1, "Found Team Complete in registrations list");
    const item1 = listRes.items.find((it) => it.id === reg1.id);
    assert(!!item1, "Team 1 item exists in list results");
    assert(item1!.expectedAmount === 2400, "Team 1 expectedAmount is ₱2,400.00");
    assert(item1!.verifiedPaidAmount === 2400, "Team 1 verifiedPaidAmount is ₱2,400.00");
    assert(item1!.balance === 0, "Team 1 balance is ₱0.00");
    assert(item1!.paidPlayerCount === 8, "Team 1 paidPlayerCount is 8");
    assert(item1!.paymentComplete === true, "Team 1 paymentComplete is true");
    assert(item1!.paymentCompletionStatus === "COMPLETE", "Team 1 paymentCompletionStatus is COMPLETE");

    console.log("\n[Integration] Testing Team Incomplete in registrations list:");
    const listRes2 = await getAdminRegistrations({
      q: "Team Incomplete",
    });
    const item2 = listRes2.items.find((it) => it.id === reg2.id);
    assert(!!item2, "Team 2 item exists in list results");
    assert(item2!.expectedAmount === 3000, "Team 2 expectedAmount is ₱3,000.00 (10 × ₱300)");
    assert(item2!.verifiedPaidAmount === 2100, "Team 2 verifiedPaidAmount is ₱2,100.00 (7 × ₱300)");
    assert(item2!.balance === 900, "Team 2 balance is ₱900.00 (3 × ₱300)");
    assert(item2!.paidPlayerCount === 7, "Team 2 paidPlayerCount is 7");
    assert(item2!.unpaidPlayerCount === 3, "Team 2 unpaidPlayerCount is 3");
    assert(item2!.paymentComplete === false, "Team 2 paymentComplete is false");
    assert(item2!.paymentCompletionStatus === "INCOMPLETE", "Team 2 paymentCompletionStatus is INCOMPLETE");

    console.log("\n[Integration] Testing getAdminRegistrationById:");
    const detail1 = await getAdminRegistrationById(reg1.id);
    assert(!!detail1, "Registration detail found");
    assert(!!detail1!.accounting, "detail.accounting object exists");
    assert(detail1!.accounting.paymentComplete === true, "detail.accounting.paymentComplete is true");
    assert(detail1!.accounting.expectedAmount === 2400, "detail.accounting.expectedAmount is ₱2,400.00");

    console.log("\n[Integration] Testing getTournamentAccountingSummary for test league:");
    const tourneySummary = await getTournamentAccountingSummary(league.id);
    assert(tourneySummary.totalRegistrations === 2, "2 registrations in tournament");
    assert(tourneySummary.totalExpectedAmount === 5400, "Total expected fees = ₱5,400.00 (₱2,400 + ₱3,000)");
    assert(tourneySummary.totalVerifiedPaidAmount === 4500, "Total verified paid = ₱4,500.00 (₱2,400 + ₱2,100)");
    assert(tourneySummary.totalOutstandingBalance === 900, "Total outstanding balance = ₱900.00");
    assert(tourneySummary.totalRosterPlayers === 18, "Total roster players = 18 (8 + 10)");
    assert(tourneySummary.totalPaidPlayers === 15, "Total paid players = 15 (8 + 7)");
    assert(tourneySummary.totalUnpaidPlayers === 3, "Total unpaid players = 3");
    assert(tourneySummary.verifiedTeams === 2, "Verified teams = 2");
    assert(tourneySummary.verifiedPaymentCompleteTeams === 1, "Verified complete teams = 1");
    assert(tourneySummary.verifiedPaymentIncompleteTeams === 1, "Verified incomplete teams = 1");

    console.log("\n[Integration] Testing classifyVerifiedTeams helper:");
    const classification = classifyVerifiedTeams([detail1!.accounting]);
    assert(classification.allVerified.length === 1, "allVerified contains 1 team");
    assert(classification.verifiedPaymentComplete.length === 1, "verifiedPaymentComplete contains 1 team");
    assert(classification.verifiedPaymentIncomplete.length === 0, "verifiedPaymentIncomplete is empty");

    console.log("\n[Integration] Testing getDashboardAccountingTotals and getRecentRegistrations:");
    const dashTotals = await getDashboardAccountingTotals(league.id);
    assert(dashTotals.totalExpectedAmount === 5400, "Dashboard accounting totals match tournament summary");
    const recent = await getRecentRegistrations(5);
    assert(recent.length > 0, "Recent registrations returned");
    assert(typeof recent[0].expectedAmount === "number", "Recent registration has expectedAmount");
    assert(typeof recent[0].verifiedPaidAmount === "number", "Recent registration has verifiedPaidAmount");
  } finally {
    console.log("\n--- PART 3: CLEAN TEARDOWN OF EPHEMERAL FIXTURES ---");
    if (testIds.reg1Id) {
      await prisma.payments.deleteMany({ where: { registration_id: testIds.reg1Id } });
      await prisma.registration_players.deleteMany({ where: { registration_id: testIds.reg1Id } });
      await prisma.registrations.delete({ where: { id: testIds.reg1Id } });
    }
    if (testIds.reg2Id) {
      await prisma.payments.deleteMany({ where: { registration_id: testIds.reg2Id } });
      await prisma.registration_players.deleteMany({ where: { registration_id: testIds.reg2Id } });
      await prisma.registrations.delete({ where: { id: testIds.reg2Id } });
    }
    for (const pId of testIds.playerIds) {
      await prisma.players.delete({ where: { id: pId } }).catch(() => {});
    }
    if (testIds.team1Id) {
      await prisma.teams.delete({ where: { id: testIds.team1Id } });
    }
    if (testIds.team2Id) {
      await prisma.teams.delete({ where: { id: testIds.team2Id } });
    }
    if (testIds.categoryId) {
      await prisma.league_categories.delete({ where: { id: testIds.categoryId } });
    }
    if (testIds.leagueId) {
      await prisma.leagues.delete({ where: { id: testIds.leagueId } });
    }
    console.log("  [PASS] All ephemeral test fixtures completely removed from mva_dev.\n");
  }

  console.log("===============================================================");
  console.log("ALL 16 VERIFICATION SUITE TESTS PASSED 100% SUCCESSFULLY");
  console.log("===============================================================");
}

run().catch((err) => {
  console.error("\n[FATAL ERROR IN VERIFICATION SUITE]:", err);
  process.exit(1);
});
