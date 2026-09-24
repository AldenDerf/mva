import { prisma } from "../lib/prisma";
import pg from "pg";
import assert from "assert";
import {
  calculateRegistrationAccounting,
} from "../lib/admin/accounting";
import {
  executeUnverifiedRosterMemberHardDelete,
  executeRosterMemberSoftRemoval,
  executeRosterMemberRestore,
  evaluateRosterMemberDeletionEligibility,
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
  registrationPlayerCount: number;
  paymentCount: number;
  verifiedPaymentSum: number;
}

async function getDatabaseSnapshot(client: pg.Client): Promise<DatabaseSnapshot> {
  const pRes = await client.query("SELECT count(*)::int as count FROM players;");
  const rpRes = await client.query("SELECT count(*)::int as count FROM registration_players;");
  const payRes = await client.query("SELECT count(*)::int as count FROM payments;");
  const sumRes = await client.query(
    "SELECT COALESCE(SUM(amount), 0)::numeric as sum FROM payments WHERE status = 'VERIFIED';"
  );

  return {
    playerCount: pRes.rows[0].count,
    registrationPlayerCount: rpRes.rows[0].count,
    paymentCount: payRes.rows[0].count,
    verifiedPaymentSum: parseFloat(sumRes.rows[0].sum),
  };
}

async function run() {
  console.log("================================================================================");
  console.log("  PHASE 05.7D.4 — VERIFICATION-BOUNDARY ROSTER MANAGEMENT TEST SUITE");
  console.log("================================================================================\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  // -------------------------------------------------------------------------
  // TEST 20: SAFETY PROBE (refuses non-mva_dev production DB)
  // -------------------------------------------------------------------------
  console.log("[TEST 20] Running Production Safety Probe...");
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
  console.log("  PASS: Test 20: Safety probe passed (local mva_dev database confirmed)\n");

  // Record initial database snapshot for preservation check
  console.log("[PRESERVATION] Taking pre-test database snapshot...");
  const snapshotBefore = await getDatabaseSnapshot(pgClient);
  console.log(`  - players: ${snapshotBefore.playerCount}`);
  console.log(`  - registration_players: ${snapshotBefore.registrationPlayerCount}`);
  console.log(`  - payments: ${snapshotBefore.paymentCount}`);
  console.log(`  - verified payment sum: ₱${snapshotBefore.verifiedPaymentSum.toFixed(2)}\n`);

  // Track created entities for deterministic cleanup
  const cleanup = {
    profileIds: [] as string[],
    leagueIds: [] as string[],
    categoryIds: [] as string[],
    teamIds: [] as string[],
    registrationIds: [] as string[],
    registrationPlayerIds: [] as string[],
    playerIds: [] as string[],
    paymentIds: [] as string[],
  };

  try {
    const uniqueSuffix = Date.now().toString().slice(-6);

    // Setup Admin Context
    const adminAuthUserId = `00000000-0000-0000-0000-057d4${uniqueSuffix.slice(0, 7)}`.padEnd(36, "0");
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: adminAuthUserId,
        email: `admin-057d4-${uniqueSuffix}@mva.test`,
        display_name: "Phase 05.7D.4 Test Admin",
        admin_access: {
          create: {
            role: "ADMIN",
            is_active: true,
          },
        },
      },
    });
    cleanup.profileIds.push(adminProfile.id);

    const validAdmin: AdminContext = {
      authUserId: adminAuthUserId,
      profileId: adminProfile.id,
      email: adminProfile.email ?? "admin@mva.test",
      displayName: adminProfile.display_name ?? "Admin",
      role: "ADMIN",
    };

    const fakeUserContext: AdminContext = {
      authUserId: "00000000-0000-0000-0000-000000000000",
      profileId: "",
      email: "user@mva.test",
      displayName: "Non Admin",
      role: "USER" as unknown as "ADMIN",
    };

    // Setup League & Category
    const league = await prisma.leagues.create({
      data: {
        name: `MVA 05.7D.4 Test Tournament ${uniqueSuffix}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    cleanup.leagueIds.push(league.id);

    const category = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Division Open ${uniqueSuffix}`,
        registration_fee: 300.0,
        min_players: 6,
        max_players: 14,
      },
    });
    cleanup.categoryIds.push(category.id);

    // Setup Teams for each registration (to satisfy uq_team_league_category)
    const teamPending = await prisma.teams.create({
      data: {
        team_name: `Spikers Pending ${uniqueSuffix}`,
        slug: `spikers-pending-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(teamPending.id);

    const teamRejected = await prisma.teams.create({
      data: {
        team_name: `Spikers Rejected ${uniqueSuffix}`,
        slug: `spikers-rejected-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(teamRejected.id);

    const teamVerified = await prisma.teams.create({
      data: {
        team_name: `Spikers Verified ${uniqueSuffix}`,
        slug: `spikers-verified-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(teamVerified.id);

    // Setup Registrations with different statuses
    // Reg 1: PENDING_PAYMENT
    const regPending = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamPending.id,
        registrant_first_name: "Coach",
        registrant_last_name: "Pending",
        registrant_contact: "09170001111",
        status: "PENDING_PAYMENT",
        registration_code: `MVA-PEND-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regPending.id);

    // Reg 2: REJECTED
    const regRejected = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamRejected.id,
        registrant_first_name: "Coach",
        registrant_last_name: "Rejected",
        registrant_contact: "09170002222",
        status: "REJECTED",
        registration_code: `MVA-REJ-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regRejected.id);

    // Reg 3: VERIFIED
    const regVerified = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamVerified.id,
        registrant_first_name: "Coach",
        registrant_last_name: "Verified",
        registrant_contact: "09170003333",
        status: "VERIFIED",
        registration_code: `MVA-VER-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regVerified.id);

    // -------------------------------------------------------------------------
    // UNAUTHORIZED MUTATIONS CHECK
    // -------------------------------------------------------------------------
    console.log("[SECURITY] Testing Unauthorized Access Blocked...");
    const dummyId = "00000000-0000-0000-0000-000000000001";
    const unauthDel = await executeUnverifiedRosterMemberHardDelete(fakeUserContext, {
      registrationId: regPending.id,
      registrationPlayerId: dummyId,
      reason: "Unauthorized delete",
    });
    assert(unauthDel.success === false && unauthDel.error === "UNAUTHORIZED", "Unauthorized delete must be blocked");
    console.log("  PASS: Unauthorized actions rejected strictly\n");

    // -------------------------------------------------------------------------
    // TEST 1: PENDING_PAYMENT REGISTRATION — GUARDED PLAYER DELETION ELIGIBLE
    // TEST 18: GLOBAL PLAYER IDENTITY PRESERVED ON PRE-VERIFICATION DELETION
    // -------------------------------------------------------------------------
    console.log("[TEST 1 & 18] Testing PENDING_PAYMENT Registration Pre-Verification Player Deletion...");
    const p1 = await prisma.players.create({
      data: { first_name: "Pending", last_name: `Candidate${uniqueSuffix}` },
    });
    cleanup.playerIds.push(p1.id);
    const rp1 = await prisma.registration_players.create({
      data: {
        registration_id: regPending.id,
        player_id: p1.id,
        jersey_number: 1,
        position: "Setter",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rp1.id);

    // Add placeholder pending payment
    const payPending = await prisma.payments.create({
      data: {
        registration_id: regPending.id,
        registration_player_id: rp1.id,
        payment_method: "OTHER",
        amount: 300.0,
        status: "PENDING",
        notes: "Fee placeholder",
      },
    });
    cleanup.paymentIds.push(payPending.id);

    const evalPending = await evaluateRosterMemberDeletionEligibility(rp1.id);
    assert(evalPending.eligible === true, "Pre-verification roster member with no verified payments must be eligible for deletion");
    assert(evalPending.policy === "UNVERIFIED_HARD_DELETE_ALLOWED");
    assert(evalPending.registrationStatus === "PENDING_PAYMENT");

    const delPendingRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regPending.id,
      registrationPlayerId: rp1.id,
      reason: "Pre-verification roster correction",
    });
    assert(delPendingRes.success === true, `Delete failed: ${delPendingRes.message}`);
    assert(delPendingRes.deletedRegistrationPlayerId === rp1.id);

    // Verify registration_players row deleted
    const checkRp1 = await prisma.registration_players.findUnique({ where: { id: rp1.id } });
    assert(checkRp1 === null, "registration_players row must be physically deleted");

    // TEST 18: Verify global player identity preserved
    const checkP1 = await prisma.players.findUnique({ where: { id: p1.id } });
    assert(checkP1 !== null, "CRITICAL: Global players record MUST be preserved");

    // Placeholder pending payment explicitly purged
    const checkPayPending = await prisma.payments.findUnique({ where: { id: payPending.id } });
    assert(checkPayPending === null, "Pending placeholder payment must be explicitly purged");

    // Audit log ROSTER_MEMBER_DELETED created
    assert(delPendingRes.auditLogId, "Audit log ID must be returned");
    const auditDel1 = await prisma.admin_audit_logs.findUnique({ where: { id: delPendingRes.auditLogId } });
    assert(auditDel1 !== null && auditDel1.action === "ROSTER_MEMBER_DELETED");
    console.log("  PASS: Test 1 & 18: PENDING_PAYMENT player safely deleted; global player preserved; audit logged\n");

    // -------------------------------------------------------------------------
    // TEST 2: REJECTED REGISTRATION — GUARDED CORRECTION/DELETION BEHAVIOR
    // -------------------------------------------------------------------------
    console.log("[TEST 2] Testing REJECTED Registration Pre-Verification Player Deletion...");
    const p2 = await prisma.players.create({
      data: { first_name: "Rejected", last_name: `Candidate${uniqueSuffix}` },
    });
    cleanup.playerIds.push(p2.id);
    const rp2 = await prisma.registration_players.create({
      data: {
        registration_id: regRejected.id,
        player_id: p2.id,
        jersey_number: 2,
        position: "Outside Hitter",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rp2.id);

    const evalRejected = await evaluateRosterMemberDeletionEligibility(rp2.id);
    assert(evalRejected.eligible === true, "REJECTED registration player must be eligible for pre-verification correction");
    assert(evalRejected.policy === "UNVERIFIED_HARD_DELETE_ALLOWED");
    assert(evalRejected.registrationStatus === "REJECTED");

    const delRejectedRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regRejected.id,
      registrationPlayerId: rp2.id,
      reason: "Correction on rejected registration",
    });
    assert(delRejectedRes.success === true, `Delete on rejected registration failed: ${delRejectedRes.message}`);

    const checkRp2 = await prisma.registration_players.findUnique({ where: { id: rp2.id } });
    assert(checkRp2 === null, "registration_players row must be physically deleted");
    console.log("  PASS: Test 2: REJECTED registration roster member eligible and safely deleted\n");

    // -------------------------------------------------------------------------
    // SETUP VERIFIED REGISTRATION ROSTER:
    // - rpCaptain: Captain (ACTIVE, unpaid)
    // - rpActiveUnpaid: ACTIVE, unpaid
    // - rpActivePaid: ACTIVE, VERIFIED paid
    // - rpActiveUnpaid2: ACTIVE, unpaid (for roster completeness/accounting)
    // -------------------------------------------------------------------------
    const pCaptain = await prisma.players.create({
      data: { first_name: "Captain", last_name: `Leader${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pCaptain.id);
    const rpCaptain = await prisma.registration_players.create({
      data: {
        registration_id: regVerified.id,
        player_id: pCaptain.id,
        jersey_number: 1,
        position: "Setter",
        is_captain: true,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpCaptain.id);

    const pActiveUnpaid = await prisma.players.create({
      data: { first_name: "Unpaid", last_name: `Member${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pActiveUnpaid.id);
    const rpActiveUnpaid = await prisma.registration_players.create({
      data: {
        registration_id: regVerified.id,
        player_id: pActiveUnpaid.id,
        jersey_number: 7,
        position: "Utility",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpActiveUnpaid.id);

    const pActivePaid = await prisma.players.create({
      data: { first_name: "Paid", last_name: `Spiker${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pActivePaid.id);
    const rpActivePaid = await prisma.registration_players.create({
      data: {
        registration_id: regVerified.id,
        player_id: pActivePaid.id,
        jersey_number: 10,
        position: "Outside Hitter",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpActivePaid.id);

    const payPaid = await prisma.payments.create({
      data: {
        registration_id: regVerified.id,
        registration_player_id: rpActivePaid.id,
        payment_method: "GCASH",
        amount: 300.0,
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
        reference_number: `GCASH-VER-${uniqueSuffix}`,
      },
    });
    cleanup.paymentIds.push(payPaid.id);

    const pActiveUnpaid2 = await prisma.players.create({
      data: { first_name: "Second", last_name: `Blocker${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pActiveUnpaid2.id);
    const rpActiveUnpaid2 = await prisma.registration_players.create({
      data: {
        registration_id: regVerified.id,
        player_id: pActiveUnpaid2.id,
        jersey_number: 15,
        position: "Middle Blocker",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpActiveUnpaid2.id);

    // -------------------------------------------------------------------------
    // TEST 3: VERIFIED REGISTRATION + ACTIVE PLAYER — HARD DELETE BLOCKED
    // -------------------------------------------------------------------------
    console.log("[TEST 3] Testing VERIFIED Registration + ACTIVE Player Hard Delete Blocked...");
    const evalActiveUnpaid = await evaluateRosterMemberDeletionEligibility(rpActiveUnpaid.id);
    assert(evalActiveUnpaid.eligible === false, "ACTIVE player in VERIFIED registration MUST be ineligible for hard delete");
    assert(evalActiveUnpaid.policy === "BLOCKED_VERIFIED_REGISTRATION");
    assert(
      evalActiveUnpaid.reason === "This registration is already verified. Players can no longer be permanently deleted. Use roster management actions instead.",
      `Unexpected reason: ${evalActiveUnpaid.reason}`
    );

    const delActiveRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActiveUnpaid.id,
      reason: "Attempt hard delete of active player in verified registration",
    });
    assert(delActiveRes.success === false, "Hard delete on ACTIVE player in verified registration must fail");
    assert(delActiveRes.error === "BLOCKED_VERIFIED_REGISTRATION");
    assert(delActiveRes.message === "This registration is already verified. Players can no longer be permanently deleted. Use roster management actions instead.");
    console.log("  PASS: Test 3: Hard delete strictly blocked for ACTIVE player in VERIFIED registration\n");

    // -------------------------------------------------------------------------
    // TEST 6: VERIFIED REGISTRATION + ACTIVE UNPAID PLAYER — REMOVE SUCCEEDS
    // -------------------------------------------------------------------------
    console.log("[TEST 6] Testing VERIFIED Registration + ACTIVE Unpaid Player Remove Succeeds...");
    const remUnpaidRes = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActiveUnpaid.id,
      reason: "Player withdrew due to conflict",
    });
    assert(remUnpaidRes.success === true, `Remove failed: ${remUnpaidRes.message}`);
    assert(remUnpaidRes.newStatus === "REMOVED");

    const checkRpUnpaidRem = await prisma.registration_players.findUniqueOrThrow({ where: { id: rpActiveUnpaid.id } });
    assert(checkRpUnpaidRem.status === "REMOVED");
    assert(checkRpUnpaidRem.removed_at !== null);
    assert(checkRpUnpaidRem.removed_by_profile_id === adminProfile.id);
    console.log("  PASS: Test 6: ACTIVE unpaid player successfully transitioned to REMOVED\n");

    // -------------------------------------------------------------------------
    // TEST 4: VERIFIED REGISTRATION + REMOVED PLAYER + NO VERIFIED PAYMENT — HARD DELETE BLOCKED
    // -------------------------------------------------------------------------
    console.log("[TEST 4] Testing VERIFIED Registration + REMOVED Player + NO Verified Payment Hard Delete Blocked...");
    const evalRemovedUnpaid = await evaluateRosterMemberDeletionEligibility(rpActiveUnpaid.id);
    assert(evalRemovedUnpaid.eligible === false, "REMOVED player in VERIFIED registration MUST be ineligible for hard delete even with 0 payments");
    assert(evalRemovedUnpaid.policy === "BLOCKED_VERIFIED_REGISTRATION");

    const delRemovedUnpaidRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActiveUnpaid.id,
      reason: "Attempt hard delete of removed unpaid player in verified registration",
    });
    assert(delRemovedUnpaidRes.success === false, "Hard delete on REMOVED player in verified registration must fail");
    assert(delRemovedUnpaidRes.error === "BLOCKED_VERIFIED_REGISTRATION");
    console.log("  PASS: Test 4: Hard delete permanently blocked for REMOVED unpaid player in VERIFIED registration\n");

    // -------------------------------------------------------------------------
    // TEST 7: VERIFIED REGISTRATION + ACTIVE PAID PLAYER — REMOVE SUCCEEDS
    // TEST 10: VERIFIED PAYMENT REMAINS UNTOUCHED AFTER REMOVE
    // -------------------------------------------------------------------------
    console.log("[TEST 7 & 10] Testing VERIFIED Registration + ACTIVE Paid Player Remove & Payment Preservation...");
    const remPaidRes = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActivePaid.id,
      reason: "Medical injury before match",
    });
    assert(remPaidRes.success === true, `Remove paid player failed: ${remPaidRes.message}`);
    assert(remPaidRes.newStatus === "REMOVED");

    // TEST 10: Check payment record is completely untouched
    const checkPayPaid = await prisma.payments.findUniqueOrThrow({ where: { id: payPaid.id } });
    assert(checkPayPaid.status === "VERIFIED", "Payment status must remain VERIFIED");
    assert(Number(checkPayPaid.amount) === 300.0, "Payment amount must remain ₱300.00");
    assert(checkPayPaid.registration_player_id === rpActivePaid.id, "Payment FK relation must remain anchored to roster member");
    console.log("  PASS: Test 7 & 10: ACTIVE paid player removed; verified payment completely untouched\n");

    // -------------------------------------------------------------------------
    // TEST 5: VERIFIED REGISTRATION + REMOVED PLAYER + VERIFIED PAYMENT — HARD DELETE BLOCKED
    // -------------------------------------------------------------------------
    console.log("[TEST 5] Testing VERIFIED Registration + REMOVED Player + VERIFIED Payment Hard Delete Blocked...");
    const evalRemovedPaid = await evaluateRosterMemberDeletionEligibility(rpActivePaid.id);
    assert(evalRemovedPaid.eligible === false);
    assert(evalRemovedPaid.policy === "BLOCKED_VERIFIED_REGISTRATION");

    const delRemovedPaidRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActivePaid.id,
      reason: "Attempt hard delete on removed paid player",
    });
    assert(delRemovedPaidRes.success === false);
    assert(delRemovedPaidRes.error === "BLOCKED_VERIFIED_REGISTRATION");
    console.log("  PASS: Test 5: Hard delete blocked for REMOVED player with VERIFIED payment\n");

    // -------------------------------------------------------------------------
    // TEST 13: ACTIVE ACCOUNTING CHANGES AT REMOVE
    // -------------------------------------------------------------------------
    console.log("[TEST 13] Testing ACTIVE Accounting Changes at Remove...");
    const regAfterRem = await prisma.registrations.findUniqueOrThrow({
      where: { id: regVerified.id },
      include: {
        teams: true,
        leagues: true,
        league_categories_registrations_league_category_idToleague_categories: true,
        registration_players: {
          include: { players: true, payments: true },
        },
        payments: true,
      },
    });
    const acctAfterRem = calculateRegistrationAccounting(regAfterRem);
    // Active players now: rpCaptain, rpActiveUnpaid2 = 2 active players.
    // Removed players: rpActiveUnpaid, rpActivePaid = 2 removed players.
    // Expected fee: 2 active * 300 = ₱600.
    // Historical removed verified: ₱300 (from rpActivePaid).
    assert(acctAfterRem.rosterCount === 2, `Expected rosterCount = 2, got ${acctAfterRem.rosterCount}`);
    assert(acctAfterRem.removedRosterCount === 2, `Expected removedRosterCount = 2, got ${acctAfterRem.removedRosterCount}`);
    assert(acctAfterRem.expectedAmount === 600, `Expected expectedAmount = 600, got ${acctAfterRem.expectedAmount}`);
    assert(acctAfterRem.historicalRemovedVerifiedAmount === 300, `Expected historical removed verified = 300, got ${acctAfterRem.historicalRemovedVerifiedAmount}`);
    console.log("  PASS: Test 13: Active obligation correctly decreased upon soft-removal\n");

    // -------------------------------------------------------------------------
    // TEST 12: PUBLIC ROSTER EXCLUDES REMOVED PLAYERS
    // -------------------------------------------------------------------------
    console.log("[TEST 12] Testing Public Roster Excludes REMOVED Players...");
    const publicRosterQuery = await prisma.teams.findUniqueOrThrow({
      where: { id: teamVerified.id },
      include: {
        registrations: {
          where: { id: regVerified.id },
          include: {
            registration_players: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });
    const publicPlayers = publicRosterQuery.registrations[0].registration_players;
    assert(publicPlayers.length === 2, `Public roster should only have 2 active players, got ${publicPlayers.length}`);
    assert(!publicPlayers.some((p) => p.id === rpActiveUnpaid.id), "Removed unpaid player must not be in public roster");
    assert(!publicPlayers.some((p) => p.id === rpActivePaid.id), "Removed paid player must not be in public roster");
    console.log("  PASS: Test 12: REMOVED players completely excluded from public roster query\n");

    // -------------------------------------------------------------------------
    // TEST 8: REMOVED VERIFIED-REGISTRATION PLAYER — RESTORE SUCCEEDS
    // TEST 11: RESTORE DOES NOT DUPLICATE PAYMENT
    // TEST 14: RESTORE REVERSES ACTIVE ROSTER OBLIGATION CORRECTLY
    // -------------------------------------------------------------------------
    console.log("[TEST 8, 11, 14] Testing Restore Verified Player & Obligation Reversal...");
    const restoreRes = await executeRosterMemberRestore(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActivePaid.id,
      reason: "Medical clearance obtained; player returning",
    });
    assert(restoreRes.success === true, `Restore failed: ${restoreRes.message}`);
    assert(restoreRes.newStatus === "ACTIVE");

    const checkRestoredRp = await prisma.registration_players.findUniqueOrThrow({ where: { id: rpActivePaid.id } });
    assert(checkRestoredRp.status === "ACTIVE");
    assert(checkRestoredRp.removed_at === null);
    assert(checkRestoredRp.removed_by_profile_id === null);

    // TEST 11: Check payments table for duplication
    const paymentsForRpPaid = await prisma.payments.findMany({
      where: { registration_player_id: rpActivePaid.id },
    });
    assert(paymentsForRpPaid.length === 1, `Expected exactly 1 payment record, found ${paymentsForRpPaid.length}`);
    assert(paymentsForRpPaid[0].id === payPaid.id, "Existing payment record must be preserved and reused");

    // TEST 14: Check accounting obligation reversed
    const regAfterRestore = await prisma.registrations.findUniqueOrThrow({
      where: { id: regVerified.id },
      include: {
        teams: true,
        leagues: true,
        league_categories_registrations_league_category_idToleague_categories: true,
        registration_players: {
          include: { players: true, payments: true },
        },
        payments: true,
      },
    });
    const acctAfterRestore = calculateRegistrationAccounting(regAfterRestore);
    // Active players now: rpCaptain, rpActiveUnpaid2, rpActivePaid = 3 active players.
    // Expected fee: 3 * 300 = ₱900.
    // Verified paid: ₱300.
    // Balance: ₱600.
    assert(acctAfterRestore.rosterCount === 3, `Expected rosterCount = 3, got ${acctAfterRestore.rosterCount}`);
    assert(acctAfterRestore.removedRosterCount === 1, `Expected removedRosterCount = 1, got ${acctAfterRestore.removedRosterCount}`);
    assert(acctAfterRestore.expectedAmount === 900, `Expected expectedAmount = 900, got ${acctAfterRestore.expectedAmount}`);
    assert(acctAfterRestore.verifiedPaidAmount === 300, `Expected verifiedPaidAmount = 300, got ${acctAfterRestore.verifiedPaidAmount}`);
    assert(acctAfterRestore.balance === 600, `Expected balance = 600, got ${acctAfterRestore.balance}`);
    assert(acctAfterRestore.historicalRemovedVerifiedAmount === 0);
    console.log("  PASS: Test 8, 11, 14: Restore succeeded, payment was not duplicated, accounting obligation reversed correctly\n");

    // -------------------------------------------------------------------------
    // TEST 9: CAPTAIN REMOVAL REMAINS BLOCKED UNTIL REASSIGNMENT
    // -------------------------------------------------------------------------
    console.log("[TEST 9] Testing Captain Protection (Removal Blocked)...");
    const captRemRes = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpCaptain.id,
      reason: "Attempting to remove captain",
    });
    assert(captRemRes.success === false, "Removal of active captain must fail");
    assert(captRemRes.error === "CAPTAIN_REMOVAL_BLOCKED");
    assert(captRemRes.message === "Reassign the team captain before removing this player.");
    console.log("  PASS: Test 9: Active captain removal strictly blocked with reassign instruction\n");

    // -------------------------------------------------------------------------
    // TEST 15: REGISTRATION VERIFICATION RACE CONDITION
    // Start with PENDING_PAYMENT and delete-eligible player.
    // Simulate registration becoming VERIFIED before authoritative delete transaction.
    // Expected: DELETE BLOCKED inside transaction!
    // -------------------------------------------------------------------------
    console.log("[TEST 15] Testing Registration Verification Race Condition...");
    const teamRace = await prisma.teams.create({
      data: {
        team_name: `Spikers Race ${uniqueSuffix}`,
        slug: `spikers-race-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(teamRace.id);

    // Create new registration starting in PENDING_PAYMENT
    const regRace = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamRace.id,
        registrant_first_name: "Race",
        registrant_last_name: "Coach",
        registrant_contact: "09170009999",
        status: "PENDING_PAYMENT",
        registration_code: `MVA-RACE-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regRace.id);

    const pRace = await prisma.players.create({
      data: { first_name: "Race", last_name: `Candidate${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pRace.id);
    const rpRace = await prisma.registration_players.create({
      data: {
        registration_id: regRace.id,
        player_id: pRace.id,
        jersey_number: 88,
        position: "Setter",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpRace.id);

    // Initial pre-check: eligible when registration is PENDING_PAYMENT
    const evalPreRace = await evaluateRosterMemberDeletionEligibility(rpRace.id);
    assert(evalPreRace.eligible === true, "Must be initially eligible while PENDING_PAYMENT");

    // Race occurs: Another admin concurrently verifies the registration!
    await prisma.registrations.update({
      where: { id: regRace.id },
      data: { status: "VERIFIED" },
    });

    // Authoritative delete transaction is invoked now
    const raceDelRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regRace.id,
      registrationPlayerId: rpRace.id,
      reason: "Attempting delete after concurrent verification",
    });
    assert(raceDelRes.success === false, "Delete MUST fail because registration transitioned to VERIFIED");
    assert(raceDelRes.error === "BLOCKED_VERIFIED_REGISTRATION");
    assert(
      raceDelRes.message === "This registration is already verified. Players can no longer be permanently deleted. Use roster management actions instead.",
      `Unexpected message: ${raceDelRes.message}`
    );
    console.log("  PASS: Test 15: Concurrency race prevented: transaction detects VERIFIED status and blocks deletion\n");

    // -------------------------------------------------------------------------
    // TEST 16: DIRECT SERVER/DOMAIN DELETE INVOCATION AGAINST VERIFIED REGISTRATION FAILS
    // -------------------------------------------------------------------------
    console.log("[TEST 16] Testing Direct Server/Domain Delete Invocation Rejection...");
    const directDelRes = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpActiveUnpaid2.id,
      reason: "Direct API invocation attempt",
    });
    assert(directDelRes.success === false);
    assert(directDelRes.error === "BLOCKED_VERIFIED_REGISTRATION");
    console.log("  PASS: Test 16: Direct server/domain call against VERIFIED registration strictly fails\n");

    // -------------------------------------------------------------------------
    // TEST 17: DUPLICATE PLAYER NAMES DO NOT AFFECT MUTATION TARGETING
    // -------------------------------------------------------------------------
    console.log("[TEST 17] Testing Duplicate Player Names Isolation...");
    const pDup = await prisma.players.create({
      data: { first_name: "Unpaid", last_name: `Member${uniqueSuffix}` }, // Exact same name as pActiveUnpaid
    });
    cleanup.playerIds.push(pDup.id);

    const teamOther = await prisma.teams.create({
      data: { team_name: `Other Team ${uniqueSuffix}`, slug: `other-team-${uniqueSuffix}` },
    });
    cleanup.teamIds.push(teamOther.id);

    const regOther = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamOther.id,
        registrant_first_name: "Other",
        registrant_last_name: "Coach",
        registrant_contact: "09170008888",
        status: "PENDING_PAYMENT",
        registration_code: `MVA-OTHER-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regOther.id);

    const rpDup = await prisma.registration_players.create({
      data: {
        registration_id: regOther.id,
        player_id: pDup.id,
        jersey_number: 7,
        position: "Utility",
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpDup.id);

    // Mismatched registrationId vs registrationPlayerId must be rejected
    const crossRegDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: regVerified.id,
      registrationPlayerId: rpDup.id,
      reason: "Cross-registration targeted delete",
    });
    assert(crossRegDel.success === false && crossRegDel.error === "NOT_FOUND");
    console.log("  PASS: Test 17: Name duplicates across registrations isolated safely by ID\n");

    // -------------------------------------------------------------------------
    // TEST 19: NO VERIFIED FINANCIAL RECORD IS DELETED
    // -------------------------------------------------------------------------
    console.log("[TEST 19] Testing Verified Financial Records Preserved...");
    const verifyPayIntact = await prisma.payments.findUnique({ where: { id: payPaid.id } });
    assert(verifyPayIntact !== null && verifyPayIntact.status === "VERIFIED");
    console.log("  PASS: Test 19: Verified payment records completely untouched and preserved\n");

    console.log("================================================================================");
    console.log("  ALL 20 VERIFICATION TESTS COMPLETED AND PASSED SUCCESSFULLY!");
    console.log("================================================================================\n");
  } finally {
    // Deterministic Cleanup
    console.log("[CLEANUP] Cleaning up test fixtures from local mva_dev...");
    try {
      if (cleanup.profileIds.length > 0) {
        await prisma.admin_audit_logs.deleteMany({
          where: { admin_profile_id: { in: cleanup.profileIds } },
        });
      }
      if (cleanup.paymentIds.length > 0) {
        await prisma.payments.deleteMany({ where: { id: { in: cleanup.paymentIds } } });
      }
      if (cleanup.registrationPlayerIds.length > 0) {
        await prisma.registration_players.deleteMany({
          where: { id: { in: cleanup.registrationPlayerIds } },
        });
      }
      if (cleanup.registrationIds.length > 0) {
        await prisma.registrations.deleteMany({
          where: { id: { in: cleanup.registrationIds } },
        });
      }
      if (cleanup.teamIds.length > 0) {
        await prisma.teams.deleteMany({ where: { id: { in: cleanup.teamIds } } });
      }
      if (cleanup.categoryIds.length > 0) {
        await prisma.league_categories.deleteMany({ where: { id: { in: cleanup.categoryIds } } });
      }
      if (cleanup.leagueIds.length > 0) {
        await prisma.leagues.deleteMany({ where: { id: { in: cleanup.leagueIds } } });
      }
      if (cleanup.playerIds.length > 0) {
        await prisma.players.deleteMany({ where: { id: { in: cleanup.playerIds } } });
      }
      if (cleanup.profileIds.length > 0) {
        await prisma.admin_access.deleteMany({
          where: { profile_id: { in: cleanup.profileIds } },
        });
        await prisma.profiles.deleteMany({
          where: { id: { in: cleanup.profileIds } },
        });
      }
      console.log("  Cleanup finished cleanly.\n");
    } catch (cleanupErr) {
      console.error("  Warning during cleanup:", cleanupErr);
    }

    // -------------------------------------------------------------------------
    // PRESERVATION CHECK: SNAPSHOT AFTER CLEANUP
    // -------------------------------------------------------------------------
    console.log("[PRESERVATION] Taking post-test database snapshot...");
    const snapshotAfter = await getDatabaseSnapshot(pgClient);
    console.log(`  - players: ${snapshotAfter.playerCount} (before: ${snapshotBefore.playerCount})`);
    console.log(`  - registration_players: ${snapshotAfter.registrationPlayerCount} (before: ${snapshotBefore.registrationPlayerCount})`);
    console.log(`  - payments: ${snapshotAfter.paymentCount} (before: ${snapshotBefore.paymentCount})`);
    console.log(`  - verified payment sum: ₱${snapshotAfter.verifiedPaymentSum.toFixed(2)} (before: ₱${snapshotBefore.verifiedPaymentSum.toFixed(2)})`);

    assert(
      snapshotAfter.playerCount === snapshotBefore.playerCount,
      `players count mismatch: before=${snapshotBefore.playerCount}, after=${snapshotAfter.playerCount}`
    );
    assert(
      snapshotAfter.registrationPlayerCount === snapshotBefore.registrationPlayerCount,
      `registration_players count mismatch: before=${snapshotBefore.registrationPlayerCount}, after=${snapshotAfter.registrationPlayerCount}`
    );
    assert(
      snapshotAfter.paymentCount === snapshotBefore.paymentCount,
      `payments count mismatch: before=${snapshotBefore.paymentCount}, after=${snapshotAfter.paymentCount}`
    );
    assert(
      Math.abs(snapshotAfter.verifiedPaymentSum - snapshotBefore.verifiedPaymentSum) < 0.001,
      `verifiedPaymentSum mismatch: before=${snapshotBefore.verifiedPaymentSum}, after=${snapshotAfter.verifiedPaymentSum}`
    );
    console.log("  PASS: Database preservation verified! Zero data drift.\n");

    await pgClient.end();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Verification FAILED:", err);
  process.exit(1);
});
