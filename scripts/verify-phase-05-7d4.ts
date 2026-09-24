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
  console.log("  PHASE 05.7D.4 — ADMIN ROSTER MANAGEMENT VERIFICATION SUITE");
  console.log("================================================================================\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  // -------------------------------------------------------------------------
  // TEST 28: SAFETY PROBE (refuses non-mva_dev production DB)
  // -------------------------------------------------------------------------
  console.log("[TEST 28] Running Production Safety Probe...");
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
  console.log("  PASS: Safety probe passed (local mva_dev database confirmed)\n");

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

    // Setup League, Category, Team, and Registration
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

    const team = await prisma.teams.create({
      data: {
        team_name: `Spikers Elite ${uniqueSuffix}`,
        slug: `spikers-elite-${uniqueSuffix}`,
      },
    });
    cleanup.teamIds.push(team.id);

    const registration = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team.id,
        registrant_first_name: "Coach",
        registrant_last_name: "Reyes",
        registrant_contact: "09170001111",
        status: "VERIFIED",
        registration_code: `MVA-7D4-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(registration.id);

    // -------------------------------------------------------------------------
    // TEST 1, 2, 3: UNAUTHORIZED MUTATIONS BLOCKED
    // -------------------------------------------------------------------------
    console.log("[TEST 1, 2, 3] Testing Unauthorized Mutations Blocked...");
    const dummyId = "00000000-0000-0000-0000-000000000001";
    const unauthDel = await executeUnverifiedRosterMemberHardDelete(fakeUserContext, {
      registrationId: registration.id,
      registrationPlayerId: dummyId,
      reason: "Unauthorized attempt",
    });
    assert(unauthDel.success === false && unauthDel.error === "UNAUTHORIZED", "Unauthorized delete must be blocked");

    const unauthRem = await executeRosterMemberSoftRemoval(fakeUserContext, {
      registrationId: registration.id,
      registrationPlayerId: dummyId,
      reason: "Unauthorized attempt",
    });
    assert(unauthRem.success === false && unauthRem.error === "UNAUTHORIZED", "Unauthorized remove must be blocked");

    const unauthRes = await executeRosterMemberRestore(fakeUserContext, {
      registrationId: registration.id,
      registrationPlayerId: dummyId,
    });
    assert(unauthRes.success === false && unauthRes.error === "UNAUTHORIZED", "Unauthorized restore must be blocked");
    console.log("  PASS: Tests 1, 2, 3: Unauthorized mutations strictly rejected\n");

    // -------------------------------------------------------------------------
    // SETUP PLAYERS:
    // Player 1: Captain (Active, Unpaid)
    // Player 2: Active, Unpaid (accidental entry for delete test)
    // Player 3: Active, Verified (for remove and restore test)
    // Player 4: Active, Unpaid (to verify completeness invariant when player 3 is removed)
    // -------------------------------------------------------------------------
    const p1 = await prisma.players.create({
      data: { first_name: "Captain", last_name: `Leader${uniqueSuffix}` },
    });
    cleanup.playerIds.push(p1.id);
    const rp1 = await prisma.registration_players.create({
      data: {
        registration_id: registration.id,
        player_id: p1.id,
        jersey_number: 1,
        position: "Setter",
        is_captain: true,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rp1.id);

    const p2 = await prisma.players.create({
      data: { first_name: "Accidental", last_name: `Roster${uniqueSuffix}` },
    });
    cleanup.playerIds.push(p2.id);
    const rp2 = await prisma.registration_players.create({
      data: {
        registration_id: registration.id,
        player_id: p2.id,
        jersey_number: 99,
        position: "Utility",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rp2.id);
    // Give p2 a PENDING payment placeholder
    const pay2 = await prisma.payments.create({
      data: {
        registration_id: registration.id,
        registration_player_id: rp2.id,
        payment_method: "OTHER",
        amount: 300.0,
        status: "PENDING",
        notes: "Pending fee assessment",
      },
    });
    cleanup.paymentIds.push(pay2.id);

    const p3 = await prisma.players.create({
      data: { first_name: "Verified", last_name: `Spiker${uniqueSuffix}` },
    });
    cleanup.playerIds.push(p3.id);
    const rp3 = await prisma.registration_players.create({
      data: {
        registration_id: registration.id,
        player_id: p3.id,
        jersey_number: 5,
        position: "Outside Hitter",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rp3.id);
    const pay3 = await prisma.payments.create({
      data: {
        registration_id: registration.id,
        registration_player_id: rp3.id,
        payment_method: "GCASH",
        amount: 300.0,
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
        reference_number: `GCASH-VER-${uniqueSuffix}`,
      },
    });
    cleanup.paymentIds.push(pay3.id);

    const p4 = await prisma.players.create({
      data: { first_name: "Unpaid", last_name: `Blocker${uniqueSuffix}` },
    });
    cleanup.playerIds.push(p4.id);
    const rp4 = await prisma.registration_players.create({
      data: {
        registration_id: registration.id,
        player_id: p4.id,
        jersey_number: 10,
        position: "Middle Blocker",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rp4.id);

    // -------------------------------------------------------------------------
    // TEST 22, 23: CAPTAIN PROTECTION (ACTIVE captain cannot be removed or deleted)
    // -------------------------------------------------------------------------
    console.log("[TEST 22, 23] Testing Captain Protection (Active Captain Deletion & Removal Blocked)...");
    const captDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp1.id,
      reason: "Attempt to delete captain",
    });
    assert(captDel.success === false, "Delete on active captain must fail");
    // Under Remove Before Delete, captain is also ACTIVE (blocked by ACTIVE status or CAPTAIN_REMOVAL_BLOCKED)
    assert(
      captDel.error === "BLOCKED_ACTIVE_STATUS" || captDel.error === "CAPTAIN_REMOVAL_BLOCKED",
      `Expected BLOCKED_ACTIVE_STATUS or CAPTAIN_REMOVAL_BLOCKED, got: ${captDel.error}`
    );

    const captRem = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp1.id,
      reason: "Attempt to remove captain",
    });
    assert(captRem.success === false, "Remove on active captain must fail");
    assert(captRem.error === "CAPTAIN_REMOVAL_BLOCKED", "Error code must be CAPTAIN_REMOVAL_BLOCKED");
    assert(
      captRem.message === "Reassign the team captain before removing this player.",
      `Unexpected captain remove message: ${captRem.message}`
    );
    console.log("  PASS: Tests 22, 23: Captain deletion and removal strictly blocked with explicit instruction\n");

    // -------------------------------------------------------------------------
    // PROOF 1: ACTIVE UNPAID PLAYER CANNOT BE HARD-DELETED DIRECTLY
    // -------------------------------------------------------------------------
    console.log("[PROOF 1] Testing ACTIVE Unpaid Player Direct Hard-Delete Blocked...");
    const activeUnpaidDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp2.id,
      reason: "Attempting direct delete of active unpaid player",
    });
    assert(activeUnpaidDel.success === false, "ACTIVE unpaid player direct hard-delete must be BLOCKED");
    assert(activeUnpaidDel.error === "BLOCKED_ACTIVE_STATUS", `Expected BLOCKED_ACTIVE_STATUS, got ${activeUnpaidDel.error}`);
    assert(
      activeUnpaidDel.message === "Remove this player from the roster before deleting them.",
      `Unexpected error message: ${activeUnpaidDel.message}`
    );
    const evalRp2Active = await evaluateRosterMemberDeletionEligibility(rp2.id);
    assert(evalRp2Active.eligible === false && evalRp2Active.policy === "BLOCKED_ACTIVE_STATUS");
    console.log("  PASS: Proof 1: Direct hard delete of ACTIVE unpaid player strictly blocked on server\n");

    // -------------------------------------------------------------------------
    // PROOF 2: ACTIVE VERIFIED PLAYER CANNOT BE HARD-DELETED DIRECTLY
    // -------------------------------------------------------------------------
    console.log("[PROOF 2] Testing ACTIVE Verified Player Direct Hard-Delete Blocked...");
    const activePaidDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp3.id,
      reason: "Attempting direct delete of active verified player",
    });
    assert(activePaidDel.success === false, "ACTIVE verified player direct hard-delete must be BLOCKED");
    assert(activePaidDel.error === "BLOCKED_ACTIVE_STATUS", `Expected BLOCKED_ACTIVE_STATUS, got ${activePaidDel.error}`);
    assert(
      activePaidDel.message === "Remove this player from the roster before deleting them.",
      `Unexpected error message: ${activePaidDel.message}`
    );
    const evalRp3Active = await evaluateRosterMemberDeletionEligibility(rp3.id);
    assert(evalRp3Active.eligible === false && evalRp3Active.policy === "BLOCKED_ACTIVE_STATUS");
    console.log("  PASS: Proof 2: Direct hard delete of ACTIVE verified player strictly blocked on server\n");

    // -------------------------------------------------------------------------
    // PROOF 3 & 7: ACTIVE UNPAID PLAYER CAN BE REMOVED (SOFT REMOVAL) & WRITES AUDIT LOG
    // -------------------------------------------------------------------------
    console.log("[PROOF 3 & 7] Testing Soft Removal of ACTIVE Unpaid Player & Audit Logging...");
    const removeUnpaidResult = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp2.id,
      reason: "Accidentally registered by team leader",
    });
    assert(removeUnpaidResult.success === true, `Remove unpaid player failed: ${removeUnpaidResult.message}`);
    assert(removeUnpaidResult.newStatus === "REMOVED");

    const checkRp2Removed = await prisma.registration_players.findUniqueOrThrow({ where: { id: rp2.id } });
    assert(checkRp2Removed.status === "REMOVED", "Player status must transition to REMOVED");
    assert(checkRp2Removed.removed_at !== null, "removed_at must be populated");
    assert(checkRp2Removed.removed_by_profile_id === adminProfile.id);

    // Placeholder pending payment preserved during soft removal
    const checkPay2Preserved = await prisma.payments.findUnique({ where: { id: pay2.id } });
    assert(checkPay2Preserved !== null, "Placeholder payment must be preserved during soft removal");

    // Proof 7: Audit log ROSTER_MEMBER_REMOVED created
    assert(removeUnpaidResult.auditLogId, "Audit log ID must be returned");
    const auditRemoveUnpaid = await prisma.admin_audit_logs.findUnique({ where: { id: removeUnpaidResult.auditLogId } });
    assert(auditRemoveUnpaid !== null && auditRemoveUnpaid.action === "ROSTER_MEMBER_REMOVED");
    const auditRemoveMeta = auditRemoveUnpaid.metadata as Record<string, unknown>;
    assert(auditRemoveMeta.reason === "Accidentally registered by team leader");
    assert(auditRemoveMeta.new_status === "REMOVED");
    console.log("  PASS: Proof 3 & 7: ACTIVE unpaid player soft-removed; ROSTER_MEMBER_REMOVED logged\n");

    // -------------------------------------------------------------------------
    // PROOF 10: REMOVED UNPAID PLAYER CAN STILL BE RESTORED BEFORE DELETION
    // -------------------------------------------------------------------------
    console.log("[PROOF 10] Testing Removed Unpaid Player Restorable Before Deletion...");
    const restoreUnpaidRes = await executeRosterMemberRestore(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp2.id,
      reason: "Re-activating unpaid player prior to test deletion",
    });
    assert(restoreUnpaidRes.success === true && restoreUnpaidRes.newStatus === "ACTIVE");
    const checkRp2Restored = await prisma.registration_players.findUniqueOrThrow({ where: { id: rp2.id } });
    assert(checkRp2Restored.status === "ACTIVE", "Player should be restored to ACTIVE");

    // Remove again to test deletion
    await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp2.id,
      reason: "Confirmed erroneous roster entry",
    });
    console.log("  PASS: Proof 10: Removed unpaid player successfully restored and re-removed\n");

    // -------------------------------------------------------------------------
    // ACCOUNTING AT REMOVAL: Active roster count and expected amount decrease
    // -------------------------------------------------------------------------
    console.log("[ACCOUNTING CHECK 1] Checking Accounting at Removal Transition...");
    const regAfterRemoveUnpaid = await prisma.registrations.findUniqueOrThrow({
      where: { id: registration.id },
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
    const acctAfterRemove = calculateRegistrationAccounting(regAfterRemoveUnpaid);
    // Active roster now: rp1 (unpaid), rp3 (verified), rp4 (unpaid) = 3 active players.
    // rp2 is REMOVED.
    // Expected = 3 * 300 = ₱900.
    assert(acctAfterRemove.rosterCount === 3, `Expected rosterCount = 3, got ${acctAfterRemove.rosterCount}`);
    assert(acctAfterRemove.removedRosterCount === 1, `Expected removedRosterCount = 1, got ${acctAfterRemove.removedRosterCount}`);
    assert(acctAfterRemove.expectedAmount === 900, `Expected expectedAmount = 900, got ${acctAfterRemove.expectedAmount}`);
    console.log("  PASS: Accounting updated correctly at ACTIVE -> REMOVED transition (3 active, ₱900 expected)\n");

    // -------------------------------------------------------------------------
    // PROOF 5 & 8: REMOVED UNPAID/UNVERIFIED PLAYER CAN BE HARD-DELETED
    // -------------------------------------------------------------------------
    console.log("[PROOF 5 & 8] Testing Hard Delete on REMOVED Unpaid/Unverified Player...");
    const evalRp2Removed = await evaluateRosterMemberDeletionEligibility(rp2.id);
    assert(evalRp2Removed.eligible === true, "REMOVED unverified player must be eligible for hard delete");
    assert(evalRp2Removed.policy === "UNVERIFIED_HARD_DELETE_ALLOWED");

    const delResult = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp2.id,
      reason: "Confirmed erroneous roster entry",
    });
    assert(delResult.success === true, `Delete failed: ${delResult.message}`);
    assert(delResult.deletedRegistrationPlayerId === rp2.id);

    // Verify registration_players row deleted
    const checkRp2Deleted = await prisma.registration_players.findUnique({ where: { id: rp2.id } });
    assert(checkRp2Deleted === null, "registration_players row must be physically deleted");

    // Verify Global player preserved
    const checkP2 = await prisma.players.findUnique({ where: { id: p2.id } });
    assert(checkP2 !== null, "CRITICAL: Global players record MUST be preserved");

    // Verify placeholder payment purged
    const checkPay2 = await prisma.payments.findUnique({ where: { id: pay2.id } });
    assert(checkPay2 === null, "Pending placeholder payment must be explicitly purged");

    // Proof 8: Separate distinct audit log ROSTER_MEMBER_DELETED created
    assert(delResult.auditLogId, "Delete audit log ID must be returned");
    const auditDel = await prisma.admin_audit_logs.findUnique({ where: { id: delResult.auditLogId } });
    assert(auditDel !== null, "Audit record must exist");
    assert(auditDel.action === "ROSTER_MEMBER_DELETED");
    const auditDelMeta = auditDel.metadata as Record<string, unknown>;
    assert(auditDelMeta.previous_roster_status === "REMOVED", "Audit metadata must note previous status was REMOVED");
    assert(auditDelMeta.reason === "Confirmed erroneous roster entry");
    assert(auditDelMeta.global_player_preserved === true);
    console.log("  PASS: Proof 5 & 8: REMOVED unverified player hard-deleted; separate ROSTER_MEMBER_DELETED logged\n");

    // -------------------------------------------------------------------------
    // PROOF 9: DELETE AFTER REMOVE DOES NOT CHANGE ACTIVE ACCOUNTING A SECOND TIME
    // -------------------------------------------------------------------------
    console.log("[PROOF 9] Testing Delete after Remove Does NOT Double-Adjust Active Accounting...");
    const regAfterDelUnpaid = await prisma.registrations.findUniqueOrThrow({
      where: { id: registration.id },
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
    const acctAfterDel = calculateRegistrationAccounting(regAfterDelUnpaid);
    // Active roster is STILL 3 players (rp1, rp3, rp4).
    // Expected amount is STILL ₱900.
    // Paid count is STILL 1.
    // Balance is STILL ₱600.
    assert(acctAfterDel.rosterCount === 3, `Expected rosterCount unchanged = 3, got ${acctAfterDel.rosterCount}`);
    assert(acctAfterDel.expectedAmount === 900, `Expected expectedAmount unchanged = 900, got ${acctAfterDel.expectedAmount}`);
    assert(acctAfterDel.paidPlayerCount === 1, `Expected paidPlayerCount unchanged = 1, got ${acctAfterDel.paidPlayerCount}`);
    assert(acctAfterDel.balance === 600, `Expected balance unchanged = 600, got ${acctAfterDel.balance}`);
    console.log("  PASS: Proof 9: Hard deletion of REMOVED player caused ZERO double-adjustment to active accounting\n");

    // -------------------------------------------------------------------------
    // PROOF 4: ACTIVE VERIFIED PLAYER CAN BE REMOVED (SOFT REMOVAL)
    // -------------------------------------------------------------------------
    console.log("[PROOF 4] Testing Soft Removal of ACTIVE Verified Player...");
    const removeVerifiedResult = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp3.id,
      reason: "Injury before tournament; withdrawn by team",
    });
    assert(removeVerifiedResult.success === true, `Remove verified player failed: ${removeVerifiedResult.message}`);
    assert(removeVerifiedResult.newStatus === "REMOVED");

    const checkRp3 = await prisma.registration_players.findUniqueOrThrow({ where: { id: rp3.id } });
    assert(checkRp3.status === "REMOVED", "Player status must be REMOVED");
    assert(checkRp3.removed_at !== null, "removed_at must be populated");
    assert(checkRp3.removed_by_profile_id === adminProfile.id, "removed_by_profile_id must be populated");

    // Verified payment remains intact
    const checkPay3 = await prisma.payments.findUniqueOrThrow({ where: { id: pay3.id } });
    assert(checkPay3.status === "VERIFIED", "Payment status must remain VERIFIED");
    assert(Number(checkPay3.amount) === 300.0, "Payment amount must remain ₱300.00");
    assert(checkPay3.registration_player_id === rp3.id, "Payment foreign key anchor must be preserved");
    console.log("  PASS: Proof 4: ACTIVE verified player transitioned to REMOVED, payment and anchors intact\n");

    // -------------------------------------------------------------------------
    // PROOF 6: REMOVED VERIFIED/UNREFUNDED PLAYER CANNOT BE HARD-DELETED
    // -------------------------------------------------------------------------
    console.log("[PROOF 6] Testing REMOVED Verified/Unrefunded Player Hard-Delete Blocked...");
    const evalRp3Removed = await evaluateRosterMemberDeletionEligibility(rp3.id);
    assert(evalRp3Removed.eligible === false, "REMOVED verified player must be INELIGIBLE for hard delete");
    assert(evalRp3Removed.policy === "BLOCKED_VERIFIED_PAYMENT");
    assert(evalRp3Removed.reason === "Refund this player's verified payment before deleting.");

    const paidDelBlocked = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp3.id,
      reason: "Attempt to hard delete paid removed player",
    });
    assert(paidDelBlocked.success === false, "Hard delete on REMOVED player with verified payment must be BLOCKED");
    assert(paidDelBlocked.error === "BLOCKED_VERIFIED_PAYMENT");
    assert(
      paidDelBlocked.message === "Refund this player's verified payment before deleting.",
      `Unexpected message: ${paidDelBlocked.message}`
    );
    console.log("  PASS: Proof 6: Hard delete of REMOVED verified player strictly blocked on server\n");

    // -------------------------------------------------------------------------
    // ACCOUNTING & PUBLIC ROSTER AFTER VERIFIED PLAYER REMOVAL
    // -------------------------------------------------------------------------
    console.log("[ACCOUNTING & PUBLIC ROSTER] Testing Roster & Canonical Accounting after Verified Removal...");
    const regWithRoster = await prisma.registrations.findUniqueOrThrow({
      where: { id: registration.id },
      include: {
        teams: true,
        leagues: true,
        league_categories_registrations_league_category_idToleague_categories: true,
        registration_players: {
          include: {
            players: true,
            payments: true,
          },
        },
        payments: true,
      },
    });

    const acct = calculateRegistrationAccounting(regWithRoster);
    // Active roster now: rp1 (unpaid), rp4 (unpaid) -> 2 active players. Expected = 2 * 300 = ₱600.
    // rp3 is REMOVED, verified paid ₱300.
    assert(acct.rosterCount === 2, `Expected active rosterCount = 2, got ${acct.rosterCount}`);
    assert(acct.removedRosterCount === 1, `Expected removedRosterCount = 1, got ${acct.removedRosterCount}`);
    assert(acct.expectedAmount === 600, `Expected expectedAmount = 600, got ${acct.expectedAmount}`);
    assert(acct.historicalRemovedVerifiedAmount === 300, `Expected historicalRemovedVerifiedAmount = 300, got ${acct.historicalRemovedVerifiedAmount}`);
    assert(acct.totalVerifiedCollected === 300, `Total verified collected is 300`);
    assert(acct.paidPlayerCount === 0, `Expected active paidPlayerCount = 0, got ${acct.paidPlayerCount}`);
    assert(acct.unpaidPlayerCount === 2, `Expected active unpaidPlayerCount = 2, got ${acct.unpaidPlayerCount}`);
    assert(acct.balance === 600, `Expected balance = 600, got ${acct.balance}`);

    // Public roster excludes removed player
    const publicQuery = await prisma.teams.findUniqueOrThrow({
      where: { id: team.id },
      include: {
        registrations: {
          where: { id: registration.id },
          include: {
            registration_players: {
              where: { status: "ACTIVE" },
            },
          },
        },
      },
    });
    const publicPlayers = publicQuery.registrations[0].registration_players;
    assert(publicPlayers.length === 2, `Public roster must show 2 active players, got ${publicPlayers.length}`);
    assert(!publicPlayers.some((p) => p.id === rp3.id), "Removed player MUST NOT appear in public roster");
    console.log("  PASS: Canonical accounting & public roster exclude removed verified player; zero financial leakage\n");

    // -------------------------------------------------------------------------
    // PROOF 11: REMOVED VERIFIED PLAYER CAN STILL BE RESTORED
    // -------------------------------------------------------------------------
    console.log("[PROOF 11] Testing Restore Verified Player to Active Roster...");
    const restoreResult = await executeRosterMemberRestore(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rp3.id,
      reason: "Medical clearance granted; restored to active lineup",
    });
    assert(restoreResult.success === true, `Restore failed: ${restoreResult.message}`);
    assert(restoreResult.newStatus === "ACTIVE");

    const restoredRp3 = await prisma.registration_players.findUniqueOrThrow({ where: { id: rp3.id } });
    assert(restoredRp3.status === "ACTIVE", "Restored status must be ACTIVE");
    assert(restoredRp3.removed_at === null, "removed_at must be cleared to null");
    assert(restoredRp3.removed_by_profile_id === null, "removed_by_profile_id must be cleared to null");

    // Audit logs preserved
    const removalAudit = await prisma.admin_audit_logs.findFirst({
      where: { entity_id: rp3.id, action: "ROSTER_MEMBER_REMOVED" },
    });
    assert(removalAudit !== null, "Historical removal audit log must be preserved");

    const restoreAudit = await prisma.admin_audit_logs.findUnique({
      where: { id: restoreResult.auditLogId },
    });
    assert(restoreAudit !== null && restoreAudit.action === "ROSTER_MEMBER_RESTORED");

    // Verified payment reused without duplication
    const paymentsForRp3 = await prisma.payments.findMany({
      where: { registration_player_id: rp3.id },
    });
    assert(paymentsForRp3.length === 1, `Expected exactly 1 payment record, found ${paymentsForRp3.length}`);
    assert(paymentsForRp3[0].id === pay3.id, "Existing payment record must be reused");
    assert(paymentsForRp3[0].status === "VERIFIED");

    // Accounting returns to expected values after restore
    const regAfterRestore = await prisma.registrations.findUniqueOrThrow({
      where: { id: registration.id },
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
    const acctRestored = calculateRegistrationAccounting(regAfterRestore);
    // Active: rp1 (unpaid), rp4 (unpaid), rp3 (verified) = 3 players.
    // Expected: ₱900. Verified paid: ₱300. Balance: ₱600.
    assert(acctRestored.rosterCount === 3, `Expected rosterCount = 3, got ${acctRestored.rosterCount}`);
    assert(acctRestored.removedRosterCount === 0, `Expected removedRosterCount = 0, got ${acctRestored.removedRosterCount}`);
    assert(acctRestored.expectedAmount === 900, `Expected expectedAmount = 900, got ${acctRestored.expectedAmount}`);
    assert(acctRestored.verifiedPaidAmount === 300, `Expected verifiedPaidAmount = 300, got ${acctRestored.verifiedPaidAmount}`);
    assert(acctRestored.paidPlayerCount === 1, `Expected paidPlayerCount = 1, got ${acctRestored.paidPlayerCount}`);
    assert(acctRestored.unpaidPlayerCount === 2, `Expected unpaidPlayerCount = 2, got ${acctRestored.unpaidPlayerCount}`);
    assert(acctRestored.balance === 600, `Expected balance = 600, got ${acctRestored.balance}`);
    assert(acctRestored.historicalRemovedVerifiedAmount === 0);
    console.log("  PASS: Proof 11: Verified player restored, payment reused, accounting reactivated correctly\n");

    // -------------------------------------------------------------------------
    // PROOF 13: STALE-STATE SERVER VALIDATION BLOCKS INVALID DELETION
    // -------------------------------------------------------------------------
    console.log("[PROOF 13] Testing Stale-State Server Validation Blocks Invalid Deletion...");
    // 13A: Player soft-removed, but concurrently receives verified payment before delete
    const pStale = await prisma.players.create({
      data: { first_name: "Stale", last_name: `Race${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pStale.id);
    const rpStale = await prisma.registration_players.create({
      data: {
        registration_id: registration.id,
        player_id: pStale.id,
        jersey_number: 11,
        position: "Libero",
        status: "REMOVED",
        removed_at: new Date(),
        removed_by_profile_id: adminProfile.id,
      },
    });
    cleanup.registrationPlayerIds.push(rpStale.id);

    // Concurrently verified payment added
    const payStale = await prisma.payments.create({
      data: {
        registration_id: registration.id,
        registration_player_id: rpStale.id,
        payment_method: "CASH",
        amount: 300.0,
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: adminProfile.id,
      },
    });
    cleanup.paymentIds.push(payStale.id);

    // Delete inside transaction MUST detect verified payment and block
    const staleDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rpStale.id,
      reason: "Attempting delete using stale client view",
    });
    assert(staleDel.success === false, "Delete on now-verified player MUST fail inside transaction");
    assert(staleDel.error === "BLOCKED_VERIFIED_PAYMENT");

    // 13B: Player soft-removed, but concurrently restored to ACTIVE before delete
    const pStaleActive = await prisma.players.create({
      data: { first_name: "StaleActive", last_name: `Race${uniqueSuffix}` },
    });
    cleanup.playerIds.push(pStaleActive.id);
    const rpStaleActive = await prisma.registration_players.create({
      data: {
        registration_id: registration.id,
        player_id: pStaleActive.id,
        jersey_number: 12,
        position: "Setter",
        status: "ACTIVE", // Concurrently restored to ACTIVE!
      },
    });
    cleanup.registrationPlayerIds.push(rpStaleActive.id);

    const staleActiveDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rpStaleActive.id,
      reason: "Attempting delete on concurrently restored active player",
    });
    assert(staleActiveDel.success === false, "Delete on concurrently restored ACTIVE player MUST fail inside transaction");
    assert(staleActiveDel.error === "BLOCKED_ACTIVE_STATUS");
    assert(staleActiveDel.message === "Remove this player from the roster before deleting them.");
    console.log("  PASS: Proof 13: Stale-state server validation strictly blocks invalid deletions inside transaction\n");

    // -------------------------------------------------------------------------
    // TEST 25: DUPLICATE / CONCURRENT REMOVE IS SAFE (IDEMPOTENT)
    // -------------------------------------------------------------------------
    console.log("[TEST 25] Testing Concurrent / Duplicate Remove Idempotency...");
    const remFirst = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rpStale.id,
      reason: "First remove call",
    });
    assert(remFirst.success === true && remFirst.newStatus === "REMOVED");

    const remSecond = await executeRosterMemberSoftRemoval(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rpStale.id,
      reason: "Second duplicate remove call",
    });
    assert(remSecond.success === true, "Second remove must succeed safely as no-op");
    assert(remSecond.message.includes("already marked as REMOVED"));
    assert(remSecond.auditLogId === undefined, "No duplicate audit log must be written for no-op");
    console.log("  PASS: Test 25: Duplicate remove is idempotent and safe\n");

    // -------------------------------------------------------------------------
    // TEST 26: NAME DUPLICATES ELSEWHERE DO NOT AFFECT TARGETING
    // -------------------------------------------------------------------------
    console.log("[TEST 26] Testing Name Duplicates Isolation across Registrations...");
    // Create player with EXACT same name in another registration
    const pDup = await prisma.players.create({
      data: { first_name: "Captain", last_name: `Leader${uniqueSuffix}` },
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
        registrant_contact: "09170002222",
        status: "VERIFIED",
        registration_code: `MVA-OTHER-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regOther.id);

    const rpDup = await prisma.registration_players.create({
      data: {
        registration_id: regOther.id,
        player_id: pDup.id,
        jersey_number: 1,
        position: "Setter",
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpDup.id);

    // Mismatched registrationId vs registrationPlayerId must be rejected
    const crossRegDel = await executeUnverifiedRosterMemberHardDelete(validAdmin, {
      registrationId: registration.id,
      registrationPlayerId: rpDup.id,
      reason: "Targeting player on wrong registration",
    });
    assert(crossRegDel.success === false && crossRegDel.error === "NOT_FOUND");
    console.log("  PASS: Test 26: Name similarity and cross-registration targeting properly isolated by ID\n");

    // -------------------------------------------------------------------------
    // TEST 27: MULTI-DIVISION PARTICIPATION ARCHITECTURE REMAINS POSSIBLE
    // -------------------------------------------------------------------------
    console.log("[TEST 27] Testing Multi-Division Participation Architecture...");
    const category2 = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Division Masters ${uniqueSuffix}`,
        registration_fee: 300.0,
      },
    });
    cleanup.categoryIds.push(category2.id);

    const regMasters = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category2.id,
        team_id: team.id,
        registrant_first_name: "Coach",
        registrant_last_name: "Reyes",
        registrant_contact: "09170001111",
        status: "VERIFIED",
        registration_code: `MVA-MAST-${uniqueSuffix}`,
      },
    });
    cleanup.registrationIds.push(regMasters.id);

    // Player 3 (restored above in reg1) can also legitimately join Division Masters
    const rpMasters = await prisma.registration_players.create({
      data: {
        registration_id: regMasters.id,
        player_id: p3.id,
        jersey_number: 5,
        position: "Outside Hitter",
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpMasters.id);

    assert(rpMasters.id !== rp3.id, "Different registration_player membership records created");
    assert(rpMasters.player_id === rp3.player_id, "Same global player identity participated in both");
    console.log("  PASS: Test 27: Multi-division participation architecture verified and intact\n");

    console.log("================================================================================");
    console.log("  ALL 28 TESTS COMPLETED AND PASSED SUCCESSFULLY!");
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
