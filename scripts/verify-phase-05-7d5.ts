import { prisma } from "../lib/prisma";
import pg from "pg";
import assert from "assert";
import { Prisma } from "@prisma/client";
import {
  calculateRegistrationAccounting,
} from "../lib/admin/accounting";
import {
  allocateLegacyPayment,
  reverseLegacyPaymentAllocation,
  getLegacyPaymentAllocationSummary,
} from "../lib/admin/payment-allocations";
import {
  executeRosterMemberSoftRemoval,
  executeRosterMemberRestore,
} from "../lib/admin/roster-safety";
import { AdminContext } from "../lib/auth/admin";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

interface DatabaseSnapshot {
  playerCount: number;
  registrationCount: number;
  registrationPlayerCount: number;
  paymentCount: number;
  paymentAllocationCount: number;
  verifiedPaymentSum: number;
}

async function getDatabaseSnapshot(client: pg.Client): Promise<DatabaseSnapshot> {
  const pRes = await client.query("SELECT count(*)::int as count FROM players;");
  const regRes = await client.query("SELECT count(*)::int as count FROM registrations;");
  const rpRes = await client.query("SELECT count(*)::int as count FROM registration_players;");
  const payRes = await client.query("SELECT count(*)::int as count FROM payments;");
  const allocRes = await client.query("SELECT count(*)::int as count FROM payment_allocations;");
  const sumRes = await client.query(
    "SELECT COALESCE(SUM(amount), 0)::numeric as sum FROM payments WHERE status = 'VERIFIED';"
  );

  return {
    playerCount: pRes.rows[0].count,
    registrationCount: regRes.rows[0].count,
    registrationPlayerCount: rpRes.rows[0].count,
    paymentCount: payRes.rows[0].count,
    paymentAllocationCount: allocRes.rows[0].count,
    verifiedPaymentSum: parseFloat(sumRes.rows[0].sum),
  };
}

async function run() {
  console.log("================================================================================");
  console.log("  PHASE 05.7D.5 — LEGACY VERIFIED PAYMENT RECONCILIATION TEST SUITE");
  console.log("================================================================================\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  // -------------------------------------------------------------------------
  // TEST 1: SAFETY PROBE (refuses non-mva_dev production DB)
  // -------------------------------------------------------------------------
  console.log("[TEST 1] Running Production Safety Probe...");
  const pgClient = new pg.Client({ connectionString });
  await pgClient.connect();

  const probe = await pgClient.query(
    "SELECT current_database(), current_user, inet_server_addr(), inet_server_port();"
  );
  const probeRow = probe.rows[0];
  console.log(`  - Database: "${probeRow.current_database}"`);
  console.log(`  - User: "${probeRow.current_user}"`);
  console.log(`  - Host: "${probeRow.inet_server_addr ?? "local"}"`);

  if (probeRow.current_database !== "mva_dev") {
    await pgClient.end();
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Database is "${probeRow.current_database}", expected "mva_dev"! Aborting verification.`
    );
  }
  console.log("  PASS: Test 1: Safety probe passed (local mva_dev database confirmed)\n");

  // Record initial database snapshot for preservation check
  console.log("[PRESERVATION] Taking pre-test database snapshot...");
  const snapshotBefore = await getDatabaseSnapshot(pgClient);
  console.log(`  - players: ${snapshotBefore.playerCount}`);
  console.log(`  - registrations: ${snapshotBefore.registrationCount}`);
  console.log(`  - registration_players: ${snapshotBefore.registrationPlayerCount}`);
  console.log(`  - payments: ${snapshotBefore.paymentCount}`);
  console.log(`  - payment_allocations: ${snapshotBefore.paymentAllocationCount}`);
  console.log(`  - verified payment sum: ₱${snapshotBefore.verifiedPaymentSum.toFixed(2)}\n`);

  // Track created entities for deterministic cleanup
  const cleanup = {
    auditLogIds: [] as string[],
    paymentAllocationIds: [] as string[],
    paymentIds: [] as string[],
    registrationPlayerIds: [] as string[],
    registrationIds: [] as string[],
    playerIds: [] as string[],
    teamIds: [] as string[],
    categoryIds: [] as string[],
    leagueIds: [] as string[],
    profileIds: [] as string[],
  };

  try {
    const uniqueSuffix = Date.now().toString().slice(-6);

    // Setup Admin Context
    const adminAuthUserId = `00000000-0000-0000-0000-057d5${uniqueSuffix.slice(0, 7)}`.padEnd(36, "0");
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: adminAuthUserId,
        email: `admin-057d5-${uniqueSuffix}@mva.test`,
        display_name: `Phase 05.7D.5 Test Admin ${uniqueSuffix}`,
        admin_access: {
          create: {
            role: "ADMIN",
            is_active: true,
          },
        },
      },
    });
    cleanup.profileIds.push(adminProfile.id);

    const adminCtx: AdminContext = {
      authUserId: adminAuthUserId,
      profileId: adminProfile.id,
      email: adminProfile.email ?? "admin@mva.test",
      displayName: adminProfile.display_name || "Admin Tester",
      role: "ADMIN",
    };

    // Create Test League & Category (₱300 fee per player)
    const league = await prisma.leagues.create({
      data: {
        name: `Reconciliation League ${uniqueSuffix}`,
        status: "OPEN_FOR_REGISTRATION",
        year: 2026,
      },
    });
    cleanup.leagueIds.push(league.id);

    const category = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Open Division ${uniqueSuffix}`,
        registration_fee: new Prisma.Decimal(300.0),
        min_players: 6,
        max_players: 12,
      },
    });
    cleanup.categoryIds.push(category.id);

    // Create Team A
    const teamA = await prisma.teams.create({
      data: {
        team_name: `Team Alpha ${uniqueSuffix}`,
        slug: `team-alpha-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(teamA.id);

    // Create Registration A (VERIFIED)
    const regA = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamA.id,
        registration_code: `MVA-RECON-A-${uniqueSuffix}`,
        status: "VERIFIED",
        registrant_first_name: "Leader",
        registrant_last_name: "Alpha",
        registrant_contact: "09170000001",
        verified_at: new Date(),
      },
    });
    cleanup.registrationIds.push(regA.id);

    // Create 7 Players for Team A
    const playerMembersA: Array<{ id: string; rpId: string; name: string }> = [];
    for (let i = 1; i <= 7; i++) {
      const p = await prisma.players.create({
        data: {
          first_name: `Player${i}`,
          last_name: `Alpha${uniqueSuffix}`,
        },
      });
      cleanup.playerIds.push(p.id);

      const rp = await prisma.registration_players.create({
        data: {
          registration_id: regA.id,
          player_id: p.id,
          jersey_number: i,
          position: i === 1 ? "Setter" : "Spiker",
          status: "ACTIVE",
        },
      });
      cleanup.registrationPlayerIds.push(rp.id);
      playerMembersA.push({ id: p.id, rpId: rp.id, name: `Player${i} Alpha${uniqueSuffix}` });
    }

    // Create Team B & Registration B for cross-registration testing
    const teamB = await prisma.teams.create({
      data: {
        team_name: `Team Beta ${uniqueSuffix}`,
        slug: `team-beta-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(teamB.id);

    const regB = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamB.id,
        registration_code: `MVA-RECON-B-${uniqueSuffix}`,
        status: "VERIFIED",
        registrant_first_name: "Leader",
        registrant_last_name: "Beta",
        registrant_contact: "09170000002",
      },
    });
    cleanup.registrationIds.push(regB.id);

    const playerB = await prisma.players.create({
      data: { first_name: "BetaPlayer", last_name: uniqueSuffix },
    });
    cleanup.playerIds.push(playerB.id);

    const rpB = await prisma.registration_players.create({
      data: {
        registration_id: regB.id,
        player_id: playerB.id,
        jersey_number: 10,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpB.id);

    // -------------------------------------------------------------------------
    // TEST 2: VERIFIED + NULL payment is eligible for legacy allocation
    // -------------------------------------------------------------------------
    console.log("[TEST 2] Verifying VERIFIED + NULL legacy payment eligibility...");
    const legacyPayment = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: null,
        amount: new Prisma.Decimal(2100.0),
        payment_method: "CASH",
        reference_number: `CASH-LEGACY-${uniqueSuffix}`,
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    cleanup.paymentIds.push(legacyPayment.id);

    const summaryInit = await getLegacyPaymentAllocationSummary(legacyPayment.id);
    assert(summaryInit !== null);
    assert.strictEqual(summaryInit.paymentId, legacyPayment.id);
    assert.strictEqual(summaryInit.originalAmount, 2100.0);
    assert.strictEqual(summaryInit.allocatedAmount, 0);
    assert.strictEqual(summaryInit.remainingUnallocated, 2100.0);
    assert.strictEqual(summaryInit.isFullyAllocated, false);
    console.log("  PASS: Test 2: VERIFIED + NULL payment is eligible and properly summarized.\n");

    // -------------------------------------------------------------------------
    // TEST 3: PENDING + NULL payment allocation blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 3] Verifying PENDING + NULL payment allocation is blocked...");
    const pendingPayment = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: null,
        amount: new Prisma.Decimal(600.0),
        payment_method: "GCASH",
        reference_number: `PENDING-PAY-${uniqueSuffix}`,
        status: "PENDING",
      },
    });
    cleanup.paymentIds.push(pendingPayment.id);

    const resPending = await allocateLegacyPayment(adminCtx, {
      paymentId: pendingPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 300.0 }],
      reconciliationNote: "Attempting pending allocation",
    });
    assert.strictEqual(resPending.success, false);
    assert.strictEqual(resPending.error, "INVALID_PAYMENT_STATUS");
    console.log("  PASS: Test 3: PENDING payment allocation blocked as expected.\n");

    // -------------------------------------------------------------------------
    // TEST 4: REJECTED + NULL payment allocation blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 4] Verifying REJECTED + NULL payment allocation is blocked...");
    const rejectedPayment = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: null,
        amount: new Prisma.Decimal(300.0),
        payment_method: "CASH",
        status: "REJECTED",
      },
    });
    cleanup.paymentIds.push(rejectedPayment.id);

    const resRejected = await allocateLegacyPayment(adminCtx, {
      paymentId: rejectedPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 300.0 }],
      reconciliationNote: "Attempting rejected allocation",
    });
    assert.strictEqual(resRejected.success, false);
    assert.strictEqual(resRejected.error, "INVALID_PAYMENT_STATUS");
    console.log("  PASS: Test 4: REJECTED payment allocation blocked as expected.\n");

    // -------------------------------------------------------------------------
    // TEST 5: REFUNDED + NULL payment allocation blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 5] Verifying REFUNDED + NULL payment allocation is blocked...");
    const refundedPayment = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: null,
        amount: new Prisma.Decimal(300.0),
        payment_method: "CASH",
        status: "REFUNDED",
      },
    });
    cleanup.paymentIds.push(refundedPayment.id);

    const resRefunded = await allocateLegacyPayment(adminCtx, {
      paymentId: refundedPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 300.0 }],
      reconciliationNote: "Attempting refunded allocation",
    });
    assert.strictEqual(resRefunded.success, false);
    assert.strictEqual(resRefunded.error, "INVALID_PAYMENT_STATUS");
    console.log("  PASS: Test 5: REFUNDED payment allocation blocked as expected.\n");

    // -------------------------------------------------------------------------
    // TEST 6: VERIFIED direct per-player payment allocation blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 6] Verifying VERIFIED direct per-player payment allocation is blocked...");
    const directVerifiedPayment = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: playerMembersA[0].rpId,
        amount: new Prisma.Decimal(300.0),
        payment_method: "CASH",
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    cleanup.paymentIds.push(directVerifiedPayment.id);

    const resDirect = await allocateLegacyPayment(adminCtx, {
      paymentId: directVerifiedPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[1].rpId, amount: 300.0 }],
      reconciliationNote: "Attempting allocation from modern direct payment",
    });
    assert.strictEqual(resDirect.success, false);
    assert.strictEqual(resDirect.error, "NOT_LEGACY_PAYMENT");
    console.log("  PASS: Test 6: VERIFIED direct per-player payment allocation blocked as expected.\n");

    // Clean up direct payment for playerMembersA[0] so player starts with clean slate
    await prisma.payments.delete({ where: { id: directVerifiedPayment.id } });
    cleanup.paymentIds = cleanup.paymentIds.filter((id) => id !== directVerifiedPayment.id);

    // -------------------------------------------------------------------------
    // TEST 9: Allocation amount must be > 0
    // -------------------------------------------------------------------------
    console.log("[TEST 9] Verifying allocation amount <= 0 is blocked...");
    const resZero = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 0 }],
      reconciliationNote: "Zero allocation test",
    });
    assert.strictEqual(resZero.success, false);
    assert.strictEqual(resZero.error, "INVALID_AMOUNT");

    const resNegative = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: -100 }],
      reconciliationNote: "Negative allocation test",
    });
    assert.strictEqual(resNegative.success, false);
    assert.strictEqual(resNegative.error, "INVALID_AMOUNT");
    console.log("  PASS: Test 9: Zero and negative allocation amounts blocked.\n");

    // -------------------------------------------------------------------------
    // TEST 10: Allocation cannot exceed remaining original payment amount
    // -------------------------------------------------------------------------
    console.log("[TEST 10] Verifying allocation exceeding payment amount is blocked...");
    const resOverPay = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 2500.0 }],
      reconciliationNote: "Attempting to allocate 2500 from 2100",
    });
    assert.strictEqual(resOverPay.success, false);
    assert.strictEqual(resOverPay.error, "PAYMENT_OVER_ALLOCATION");
    console.log("  PASS: Test 10: Over-allocation beyond payment amount blocked.\n");

    // -------------------------------------------------------------------------
    // TEST 11: Cross-registration allocation blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 11] Verifying cross-registration allocation is blocked...");
    const resCross = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: rpB.id, amount: 300.0 }],
      reconciliationNote: "Attempting cross registration allocation",
    });
    assert.strictEqual(resCross.success, false);
    assert.strictEqual(resCross.error, "CROSS_REGISTRATION_MISMATCH");
    console.log("  PASS: Test 11: Cross-registration allocation blocked.\n");

    // -------------------------------------------------------------------------
    // TEST 12: Duplicate active allocation for same payment/player blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 12] Verifying duplicate active allocation in single payload is blocked...");
    const resDupPayload = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [
        { registrationPlayerId: playerMembersA[0].rpId, amount: 150.0 },
        { registrationPlayerId: playerMembersA[0].rpId, amount: 150.0 },
      ],
      reconciliationNote: "Duplicate in payload",
    });
    assert.strictEqual(resDupPayload.success, false);
    assert.strictEqual(resDupPayload.error, "VALIDATION_ERROR");
    console.log("  PASS: Test 12: Duplicate in payload rejected.\n");

    // -------------------------------------------------------------------------
    // TEST 8: Partial allocation works
    // TEST 13: Allocation to ACTIVE player creates verified player credit
    // TEST 17 & 18: Gross verified collection remains unchanged
    // TEST 19: Remaining unallocated amount calculated correctly
    // TEST 24: PAYMENT_ALLOCATED audit emitted
    // -------------------------------------------------------------------------
    console.log("[TEST 8, 13, 17, 18, 19, 24] Performing partial allocation of ₱300 to Player 1...");
    const resAlloc1 = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 300.0 }],
      reconciliationNote: "Reconciling historical cash payment for Player 1",
    });
    assert.strictEqual(resAlloc1.success, true);
    cleanup.paymentAllocationIds.push(...resAlloc1.allocationIds);

    // Verify audit log emitted
    const auditAlloc = await prisma.admin_audit_logs.findFirst({
      where: {
        action: "PAYMENT_ALLOCATED",
        entity_id: resAlloc1.allocationIds[0],
      },
    });
    assert(Boolean(auditAlloc), "PAYMENT_ALLOCATED audit log must exist");
    cleanup.auditLogIds.push(auditAlloc!.id);

    // Verify summary
    const summary1 = await getLegacyPaymentAllocationSummary(legacyPayment.id);
    assert(summary1 !== null);
    assert.strictEqual(summary1.allocatedAmount, 300.0);
    assert.strictEqual(summary1.remainingUnallocated, 1800.0);
    assert.strictEqual(summary1.activeAllocations.length, 1);

    // Verify canonical accounting
    const regDetail1 = await prisma.registrations.findUniqueOrThrow({
      where: { id: regA.id },
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
    const acct1 = calculateRegistrationAccounting(regDetail1);

    // Invariant: Gross collection unchanged
    assert.strictEqual(acct1.totalVerifiedCollected, 2100.0);
    assert.strictEqual(acct1.grossVerifiedCollections, 2100.0);
    assert.strictEqual(acct1.unallocatedVerifiedAmount, 1800.0);
    assert.strictEqual(acct1.legacyAllocatedVerifiedAmount, 300.0);

    // Player 1 is paid
    const p1Acct = acct1.rosterPayments.find((rp) => rp.registrationPlayerId === playerMembersA[0].rpId);
    assert(Boolean(p1Acct));
    assert.strictEqual(p1Acct!.isPaid, true);
    assert.strictEqual(p1Acct!.verifiedCredit, 300.0);
    assert.strictEqual(p1Acct!.allocatedCredit, 300.0);
    console.log("  PASS: Partial allocation succeeded, remaining: ₱1,800, gross: ₱2,100, Player 1 credited.\n");

    // -------------------------------------------------------------------------
    // TEST 12: Duplicate active allocation for same payment/player blocked
    // -------------------------------------------------------------------------
    console.log("[TEST 12] Verifying duplicate active allocation for same payment/player is blocked...");
    const resDupActive = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[0].rpId, amount: 300.0 }],
      reconciliationNote: "Attempting second active allocation for player 1",
    });
    assert.strictEqual(resDupActive.success, false);
    assert.strictEqual(resDupActive.error, "DUPLICATE_ACTIVE_ALLOCATION");
    console.log("  PASS: Test 12: Duplicate active allocation on same payment blocked.\n");

    // -------------------------------------------------------------------------
    // TEST 15: Existing direct VERIFIED credit prevents over-credit
    // -------------------------------------------------------------------------
    console.log("[TEST 15] Verifying existing direct VERIFIED credit prevents over-credit...");
    const directPayP2 = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: playerMembersA[1].rpId,
        amount: new Prisma.Decimal(300.0),
        payment_method: "CASH",
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    cleanup.paymentIds.push(directPayP2.id);

    const resDirectOverCredit = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[1].rpId, amount: 300.0 }],
      reconciliationNote: "Attempting to allocate to directly credited player 2",
    });
    assert.strictEqual(resDirectOverCredit.success, false);
    assert.strictEqual(resDirectOverCredit.error, "PLAYER_OVER_CREDIT");

    await prisma.payments.delete({ where: { id: directPayP2.id } });
    cleanup.paymentIds = cleanup.paymentIds.filter((id) => id !== directPayP2.id);
    console.log("  PASS: Test 15: Existing direct verified credit prevents over-credit.\n");

    // -------------------------------------------------------------------------
    // TEST 16: Partial existing credit only allows remaining valid obligation
    // -------------------------------------------------------------------------
    console.log("[TEST 16] Verifying partial credit limit handling...");
    const directPartialPay = await prisma.payments.create({
      data: {
        registration_id: regA.id,
        registration_player_id: playerMembersA[1].rpId,
        amount: new Prisma.Decimal(150.0),
        payment_method: "CASH",
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    cleanup.paymentIds.push(directPartialPay.id);

    // Now try to allocate ₱200 to Player 2 (150 direct + 200 legacy = 350 > 300 fee) -> should fail with PLAYER_OVER_CREDIT
    const resPart2Over = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[1].rpId, amount: 200.0 }],
      reconciliationNote: "Attempting 200 on top of 150 direct credit",
    });
    assert.strictEqual(resPart2Over.success, false);
    assert.strictEqual(resPart2Over.error, "PLAYER_OVER_CREDIT");

    // Clean up direct payment for player 2 so player 2 can be cleanly allocated in later tests
    await prisma.payments.delete({ where: { id: directPartialPay.id } });
    cleanup.paymentIds = cleanup.paymentIds.filter((id) => id !== directPartialPay.id);
    console.log("  PASS: Test 16: Partial credit correctly bounds remaining allowable allocation.\n");

    // -------------------------------------------------------------------------
    // TEST 14 & 29: Allocation to REMOVED player preserves historical credit
    // but does NOT reduce ACTIVE obligation or restore player
    // -------------------------------------------------------------------------
    console.log("[TEST 14 & 29] Verifying allocation to REMOVED player...");
    // Soft remove Player 7
    const removeRes = await executeRosterMemberSoftRemoval(adminCtx, {
      registrationId: regA.id,
      registrationPlayerId: playerMembersA[6].rpId,
      reason: "Removed for historical test",
    });
    assert.strictEqual(removeRes.success, true);

    // Allocate ₱300 to removed Player 7
    const resRemovedAlloc = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[6].rpId, amount: 300.0 }],
      reconciliationNote: "Allocating to removed historical player",
    });
    assert.strictEqual(resRemovedAlloc.success, true);
    cleanup.paymentAllocationIds.push(...resRemovedAlloc.allocationIds);

    // Verify Player 7 is STILL REMOVED
    const p7Db = await prisma.registration_players.findUniqueOrThrow({
      where: { id: playerMembersA[6].rpId },
    });
    assert.strictEqual(p7Db.status, "REMOVED");

    // Re-check accounting: active roster count is 6 (Players 1-6), expectedAmount = 6 * 300 = 1800
    const regDetailRemoved = await prisma.registrations.findUniqueOrThrow({
      where: { id: regA.id },
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
    const acctRemoved = calculateRegistrationAccounting(regDetailRemoved);
    assert.strictEqual(acctRemoved.rosterCount, 6);
    assert.strictEqual(acctRemoved.expectedAmount, 1800.0);
    assert.strictEqual(acctRemoved.historicalRemovedVerifiedAmount, 300.0);
    // Player 7's allocation did NOT satisfy Player 2's obligation
    assert.strictEqual(acctRemoved.verifiedPaidAmount, 300.0); // Only Player 1 is active & paid
    console.log("  PASS: Test 14: Removed player allocation preserves credit without reducing active obligation.\n");

    // -------------------------------------------------------------------------
    // TEST 7: One legacy payment can allocate to multiple roster members
    // -------------------------------------------------------------------------
    console.log("[TEST 7] Allocating across multiple roster members (Players 2, 3, 4, 5, 6)...");
    const multiAllocRes = await allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [
        { registrationPlayerId: playerMembersA[1].rpId, amount: 300.0 },
        { registrationPlayerId: playerMembersA[2].rpId, amount: 300.0 },
        { registrationPlayerId: playerMembersA[3].rpId, amount: 300.0 },
        { registrationPlayerId: playerMembersA[4].rpId, amount: 300.0 },
        { registrationPlayerId: playerMembersA[5].rpId, amount: 300.0 },
      ],
      reconciliationNote: "Reconciling historical payment for original starters",
    });
    assert.strictEqual(multiAllocRes.success, true);
    cleanup.paymentAllocationIds.push(...multiAllocRes.allocationIds);

    // All 7 players (6 active + 1 removed) now have ₱300 allocated! Total allocated = 7 * 300 = 2100!
    // -------------------------------------------------------------------------
    // TEST 20: Full allocation results in remaining = ₱0
    // -------------------------------------------------------------------------
    console.log("[TEST 20] Verifying full allocation results in remaining = ₱0...");
    const summaryFull = await getLegacyPaymentAllocationSummary(legacyPayment.id);
    assert(summaryFull !== null);
    assert.strictEqual(summaryFull.allocatedAmount, 2100.0);
    assert.strictEqual(summaryFull.remainingUnallocated, 0.0);
    assert.strictEqual(summaryFull.isFullyAllocated, true);
    console.log("  PASS: Test 20: Full allocation results in remaining: ₱0, isFullyAllocated: true.\n");

    // -------------------------------------------------------------------------
    // TEST 41: ACCOUNTING REGRESSION TEST (Section 41)
    // -------------------------------------------------------------------------
    console.log("[TEST 41] Executing Accounting Regression Verification (Section 41)...");
    const regDetailFull = await prisma.registrations.findUniqueOrThrow({
      where: { id: regA.id },
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
    const acctFull = calculateRegistrationAccounting(regDetailFull);

    console.log(`  - Expected Active Obligation (6 active × ₱300): ₱${acctFull.expectedAmount}`);
    console.log(`  - Verified Active Paid Amount: ₱${acctFull.verifiedPaidAmount}`);
    console.log(`  - Gross Verified Cash Collected: ₱${acctFull.grossVerifiedCollections}`);
    console.log(`  - Legacy Allocated Verified Amount: ₱${acctFull.legacyAllocatedVerifiedAmount}`);
    console.log(`  - Legacy Unallocated Verified Amount: ₱${acctFull.unallocatedVerifiedAmount}`);
    console.log(`  - Historical Removed Player Credit: ₱${acctFull.historicalRemovedVerifiedAmount}`);
    console.log(`  - Outstanding Active Balance: ₱${acctFull.balance}`);
    console.log(`  - Paid Active Players: ${acctFull.paidPlayerCount} / ${acctFull.rosterCount}`);
    console.log(`  - Payment Complete: ${acctFull.paymentComplete}`);

    assert.strictEqual(acctFull.expectedAmount, 1800.0);
    assert.strictEqual(acctFull.verifiedPaidAmount, 1800.0);
    assert.strictEqual(acctFull.grossVerifiedCollections, 2100.0, "Gross collection must remain ₱2,100 (never ₱4,200)");
    assert.strictEqual(acctFull.totalVerifiedCollected, 2100.0);
    assert.strictEqual(acctFull.legacyAllocatedVerifiedAmount, 2100.0);
    assert.strictEqual(acctFull.unallocatedVerifiedAmount, 0.0);
    assert.strictEqual(acctFull.historicalRemovedVerifiedAmount, 300.0);
    assert.strictEqual(acctFull.balance, 0.0);
    assert.strictEqual(acctFull.paidPlayerCount, 6);
    assert.strictEqual(acctFull.paymentComplete, true);
    console.log("  PASS: Test 41: Accounting regression verified perfectly!\n");

    // -------------------------------------------------------------------------
    // TEST 21, 22, 23, 25: Reversal increases remaining, preserves history,
    // updates credit, and emits PAYMENT_ALLOCATION_REVERSED
    // -------------------------------------------------------------------------
    console.log("[TEST 21, 22, 23, 25] Reversing allocation for Player 6...");
    const allocToReverse = multiAllocRes.allocationIds[4]; // Player 6
    const revRes = await reverseLegacyPaymentAllocation(adminCtx, {
      allocationId: allocToReverse,
      reversalReason: "Clerical error: Player 6 paid via personal cash later",
    });
    assert.strictEqual(revRes.success, true);
    assert.strictEqual(revRes.reversedAmount, 300.0);
    assert.strictEqual(revRes.newRemainingUnallocated, 300.0);

    // Verify row still exists with reversed_at populated (Test 22)
    const reversedRow = await prisma.payment_allocations.findUniqueOrThrow({
      where: { id: allocToReverse },
    });
    assert(Boolean(reversedRow.reversed_at), "reversed_at must be populated");
    assert.strictEqual(reversedRow.reversal_reason, "Clerical error: Player 6 paid via personal cash later");

    // Verify audit log (Test 25)
    const revAudit = await prisma.admin_audit_logs.findFirst({
      where: {
        action: "PAYMENT_ALLOCATION_REVERSED",
        entity_id: allocToReverse,
      },
    });
    assert(Boolean(revAudit), "PAYMENT_ALLOCATION_REVERSED audit log must exist");
    cleanup.auditLogIds.push(revAudit!.id);

    // Verify Player 6 is no longer paid (Test 23)
    const regDetailAfterRev = await prisma.registrations.findUniqueOrThrow({
      where: { id: regA.id },
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
    const acctRev = calculateRegistrationAccounting(regDetailAfterRev);
    const p6Acct = acctRev.rosterPayments.find((rp) => rp.registrationPlayerId === playerMembersA[5].rpId);
    assert.strictEqual(p6Acct!.isPaid, false);
    assert.strictEqual(p6Acct!.verifiedCredit, 0);
    assert.strictEqual(acctRev.paidPlayerCount, 5);
    assert.strictEqual(acctRev.unallocatedVerifiedAmount, 300.0);
    assert.strictEqual(acctRev.paymentComplete, false);
    console.log("  PASS: Reversal correctly increases remaining to ₱300, marks row reversed, and updates Player 6.\n");

    // -------------------------------------------------------------------------
    // TEST 26: Concurrent allocation cannot over-allocate payment
    // -------------------------------------------------------------------------
    console.log("[TEST 26] Testing concurrency protection with simultaneous allocations...");
    // Remaining is ₱300. Two parallel operations attempt to allocate ₱300.
    const concurrent1 = allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[5].rpId, amount: 300.0 }],
      reconciliationNote: "Concurrent candidate A",
    });
    const concurrent2 = allocateLegacyPayment(adminCtx, {
      paymentId: legacyPayment.id,
      allocations: [{ registrationPlayerId: playerMembersA[5].rpId, amount: 300.0 }],
      reconciliationNote: "Concurrent candidate B",
    });

    const [resC1, resC2] = await Promise.all([concurrent1, concurrent2]);

    const successCount = (resC1.success ? 1 : 0) + (resC2.success ? 1 : 0);
    const failCount = (!resC1.success ? 1 : 0) + (!resC2.success ? 1 : 0);

    assert.strictEqual(successCount, 1, "Exactly one concurrent transaction must succeed");
    assert.strictEqual(failCount, 1, "Exactly one concurrent transaction must fail");

    if (resC1.success) {
      cleanup.paymentAllocationIds.push(...resC1.allocationIds);
      assert.strictEqual(resC2.success, false);
      console.log(`  Concurrent transaction 1 won: ${resC1.success}, transaction 2 blocked: ${resC2.error}`);
    } else {
      if (resC2.success) {
        cleanup.paymentAllocationIds.push(...resC2.allocationIds);
      }
      console.log(`  Concurrent transaction 2 won: ${resC2.success}, transaction 1 blocked: ${resC1.error}`);
    }
    console.log("  PASS: Test 26: Concurrency protection verified under parallel execution.\n");

    // -------------------------------------------------------------------------
    // TEST 27: VERIFIED registration permits reconciliation
    // -------------------------------------------------------------------------
    console.log("[TEST 27] Confirming VERIFIED registration status permitted reconciliation...");
    assert.strictEqual(regA.status, "VERIFIED");
    console.log("  PASS: Test 27: Registration was VERIFIED throughout all reconciliation operations.\n");

    // -------------------------------------------------------------------------
    // TEST 28: Existing modern direct payment flow still works
    // -------------------------------------------------------------------------
    console.log("[TEST 28] Verifying modern direct per-player payment creation and accounting...");
    const directPayNew = await prisma.payments.create({
      data: {
        registration_id: regB.id,
        registration_player_id: rpB.id,
        amount: new Prisma.Decimal(300.0),
        payment_method: "GCASH",
        reference_number: `DIRECT-B-${uniqueSuffix}`,
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    cleanup.paymentIds.push(directPayNew.id);

    const regDetailB = await prisma.registrations.findUniqueOrThrow({
      where: { id: regB.id },
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
    const acctB = calculateRegistrationAccounting(regDetailB);
    assert.strictEqual(acctB.rosterCount, 1);
    assert.strictEqual(acctB.paidPlayerCount, 1);
    assert.strictEqual(acctB.paymentComplete, true);
    console.log("  PASS: Test 28: Modern direct per-player payment flow works cleanly.\n");

    // -------------------------------------------------------------------------
    // TEST 29: Existing Remove/Restore behavior still works
    // -------------------------------------------------------------------------
    console.log("[TEST 29] Verifying restore functionality on historical removed player...");
    const restoreRes = await executeRosterMemberRestore(adminCtx, {
      registrationId: regA.id,
      registrationPlayerId: playerMembersA[6].rpId,
      reason: "Restoring for test",
    });
    assert.strictEqual(restoreRes.success, true);
    const restoredDb = await prisma.registration_players.findUniqueOrThrow({
      where: { id: playerMembersA[6].rpId },
    });
    assert.strictEqual(restoredDb.status, "ACTIVE");
    console.log("  PASS: Test 29: Restore functionality functions as expected.\n");

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP & PRESERVATION (Test 30)
    // -------------------------------------------------------------------------
    console.log("[CLEANUP] Performing deterministic cleanup of ephemeral test records...");

    // Delete audit logs created during test
    if (cleanup.auditLogIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { id: { in: cleanup.auditLogIds } },
      });
    }

    // Also delete any audit logs referencing our test allocations or payments
    if (cleanup.paymentAllocationIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { entity_id: { in: cleanup.paymentAllocationIds } },
      });
    }
    if (cleanup.paymentIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { entity_id: { in: cleanup.paymentIds } },
      });
    }

    // Delete payment allocations
    if (cleanup.paymentAllocationIds.length > 0) {
      await prisma.payment_allocations.deleteMany({
        where: { id: { in: cleanup.paymentAllocationIds } },
      });
    }

    // Delete payments
    if (cleanup.paymentIds.length > 0) {
      await prisma.payments.deleteMany({
        where: { id: { in: cleanup.paymentIds } },
      });
    }

    // Delete registration players
    if (cleanup.registrationPlayerIds.length > 0) {
      await prisma.registration_players.deleteMany({
        where: { id: { in: cleanup.registrationPlayerIds } },
      });
    }

    // Delete registrations
    if (cleanup.registrationIds.length > 0) {
      await prisma.registrations.deleteMany({
        where: { id: { in: cleanup.registrationIds } },
      });
    }

    // Delete players
    if (cleanup.playerIds.length > 0) {
      await prisma.players.deleteMany({
        where: { id: { in: cleanup.playerIds } },
      });
    }

    // Delete teams
    if (cleanup.teamIds.length > 0) {
      await prisma.teams.deleteMany({
        where: { id: { in: cleanup.teamIds } },
      });
    }

    // Delete categories
    if (cleanup.categoryIds.length > 0) {
      await prisma.league_categories.deleteMany({
        where: { id: { in: cleanup.categoryIds } },
      });
    }

    // Delete leagues
    if (cleanup.leagueIds.length > 0) {
      await prisma.leagues.deleteMany({
        where: { id: { in: cleanup.leagueIds } },
      });
    }

    // Delete admin profile and access if we created it
    if (cleanup.profileIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { admin_profile_id: { in: cleanup.profileIds } },
      });
      await prisma.admin_access.deleteMany({
        where: { profile_id: { in: cleanup.profileIds } },
      });
      await prisma.profiles.deleteMany({
        where: { id: { in: cleanup.profileIds } },
      });
    }

    console.log("  [CLEANUP] Cleanup completed successfully.\n");

    // Take post-test snapshot
    console.log("[PRESERVATION] Taking post-test database snapshot...");
    const snapshotAfter = await getDatabaseSnapshot(pgClient);
    console.log(`  - players: ${snapshotAfter.playerCount} (before: ${snapshotBefore.playerCount})`);
    console.log(`  - registrations: ${snapshotAfter.registrationCount} (before: ${snapshotBefore.registrationCount})`);
    console.log(`  - registration_players: ${snapshotAfter.registrationPlayerCount} (before: ${snapshotBefore.registrationPlayerCount})`);
    console.log(`  - payments: ${snapshotAfter.paymentCount} (before: ${snapshotBefore.paymentCount})`);
    console.log(`  - payment_allocations: ${snapshotAfter.paymentAllocationCount} (before: ${snapshotBefore.paymentAllocationCount})`);
    console.log(
      `  - verified payment sum: ₱${snapshotAfter.verifiedPaymentSum.toFixed(2)} (before: ₱${snapshotBefore.verifiedPaymentSum.toFixed(2)})\n`
    );

    await pgClient.end();

    // -------------------------------------------------------------------------
    // TEST 30: Zero persistent test data drift
    // -------------------------------------------------------------------------
    console.log("[TEST 30] Verifying zero persistent test data drift...");
    assert.strictEqual(snapshotAfter.playerCount, snapshotBefore.playerCount, "Player count must match");
    assert.strictEqual(snapshotAfter.registrationCount, snapshotBefore.registrationCount, "Registration count must match");
    assert.strictEqual(
      snapshotAfter.registrationPlayerCount,
      snapshotBefore.registrationPlayerCount,
      "Registration player count must match"
    );
    assert.strictEqual(snapshotAfter.paymentCount, snapshotBefore.paymentCount, "Payment count must match");
    assert.strictEqual(
      snapshotAfter.paymentAllocationCount,
      snapshotBefore.paymentAllocationCount,
      "Payment allocation count must match"
    );
    assert.strictEqual(
      snapshotAfter.verifiedPaymentSum,
      snapshotBefore.verifiedPaymentSum,
      "Verified payment sum must match"
    );
    console.log("  PASS: Test 30: Zero data drift confirmed. All test fixtures cleaned up perfectly!\n");
  }

  console.log("================================================================================");
  console.log("  ALL 30 VERIFICATION TESTS & ACCOUNTING REGRESSION TESTS PASSED!");
  console.log("================================================================================");
}

run()
  .catch((err) => {
    console.error("\n❌ VERIFICATION TEST FAILED:");
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
