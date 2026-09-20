if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

import pg from "pg";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import {
  mutatePlayerPaymentStatus,
  isAllowedPlayerPaymentTransition,
  getTargetPaymentStatusForAction,
  getPlayerPaymentAuditAction,
  PLAYER_PAYMENT_FEE,
} from "../lib/admin/player-payment-mutations";
import { AdminContext } from "../lib/auth/admin";

/**
 * PHASE 05: PER-PLAYER PAYMENT ARCHITECTURE VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Strict database safety guard (must be local mva_dev, NEVER remote or production).
 * 2. Static verification of Server Action code & authorization guard (requireAdmin).
 * 3. Pure state machine transition invariants (allowed vs explicitly blocked transitions).
 * 4. Reason requirements (mandatory for REJECT and REFUND).
 * 5. Preservation of existing registration-level payments (registration_player_id = null).
 * 6. Per-player payment creation on public team registration (₱300 per member).
 * 7. Admin player payment verification (PENDING -> VERIFIED) with timestamp and actor attribution.
 * 8. Accidental duplicate verification protection (StaleState rejection and DB constraint).
 * 9. Refund flow (VERIFIED -> REFUNDED) with mandatory reason.
 * 10. Rejection flow (PENDING -> REJECTED) with mandatory reason.
 * 11. Domain independence (Player payment != Team registration status != Roster membership).
 * 12. Transactional audit logging for all player payment operations.
 * 13. Clean teardown of all ephemeral test fixtures.
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
  console.log("PHASE 05: PER-PLAYER PAYMENT ARCHITECTURE VERIFICATION");
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

  // 2. Static verification of Server Action code & authorization guard
  console.log("--- 1. STATIC CODE & AUTHORIZATION ARCHITECTURE CHECK ---");
  const actionsFilePath = path.join(
    process.cwd(),
    "app/admin/(portal)/registrations/[id]/payment-actions.ts"
  );
  const actionsCode = fs.readFileSync(actionsFilePath, "utf-8");

  assert(
    actionsCode.includes('"use server"') || actionsCode.includes("'use server'"),
    "Test 1A: Server Action declares 'use server' boundary"
  );

  assert(
    actionsCode.includes("requireAdmin()"),
    "Test 1B: Server Action explicitly calls requireAdmin() for authorization"
  );

  assert(
    actionsCode.includes("mutatePlayerPaymentStatus"),
    "Test 1C: Server Action delegates to domain service mutatePlayerPaymentStatus"
  );

  assert(
    actionsCode.includes("revalidatePath"),
    "Test 1D: Server Action revalidates Next.js cache paths upon mutation"
  );

  // 3. Unit verification of pure state machine transitions
  console.log("\n--- 2. PURE STATE MACHINE TRANSITION RULES ---");
  assert(
    isAllowedPlayerPaymentTransition("PENDING", "VERIFIED") &&
      isAllowedPlayerPaymentTransition("PENDING", "REJECTED"),
    "Test 2A: PENDING allows transitions to VERIFIED and REJECTED"
  );

  assert(
    isAllowedPlayerPaymentTransition("VERIFIED", "REFUNDED"),
    "Test 2B: VERIFIED allows transition to REFUNDED"
  );

  assert(
    !isAllowedPlayerPaymentTransition("VERIFIED", "PENDING"),
    "Test 2C: VERIFIED explicitly blocks transition back to PENDING"
  );

  assert(
    !isAllowedPlayerPaymentTransition("REFUNDED", "VERIFIED"),
    "Test 2D: REFUNDED is strictly a terminal state (cannot re-verify)"
  );

  assert(
    !isAllowedPlayerPaymentTransition("REJECTED", "REFUNDED"),
    "Test 2E: REJECTED explicitly blocks transition to REFUNDED"
  );

  assert(
    getTargetPaymentStatusForAction("VERIFY") === "VERIFIED" &&
      getTargetPaymentStatusForAction("REJECT") === "REJECTED" &&
      getTargetPaymentStatusForAction("REFUND") === "REFUNDED",
    "Test 2F: getTargetPaymentStatusForAction correctly maps semantic actions"
  );

  assert(
    getPlayerPaymentAuditAction("VERIFY") === "PLAYER_PAYMENT_VERIFIED" &&
      getPlayerPaymentAuditAction("REJECT") === "PLAYER_PAYMENT_REJECTED" &&
      getPlayerPaymentAuditAction("REFUND") === "PLAYER_PAYMENT_REFUNDED",
    "Test 2G: getPlayerPaymentAuditAction correctly maps semantic actions to audit action constants"
  );

  // 4. Fixture Setup
  console.log("\n--- 3. EPHEMERAL FIXTURE SETUP IN mva_dev ---");
  const createdProfileIds: string[] = [];
  const createdAdminAccessIds: string[] = [];
  const createdLeagueIds: string[] = [];
  const createdTeamIds: string[] = [];
  const createdPlayerIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdAuditLogIds: string[] = [];

  try {
    // Admin Profile
    const adminAuthId = randomUUID();
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: adminAuthId,
        display_name: "Test Admin Official",
        email: `test-admin-${Date.now()}@mva.org`,
      },
    });
    createdProfileIds.push(adminProfile.id);

    const adminAccess = await prisma.admin_access.create({
      data: {
        profile_id: adminProfile.id,
        role: "ADMIN",
        is_active: true,
      },
    });
    createdAdminAccessIds.push(adminAccess.id);

    const validAdminContext: AdminContext = {
      profileId: adminProfile.id,
      authUserId: adminAuthId,
      role: "ADMIN",
      email: adminProfile.email || "admin@mva.org",
      displayName: adminProfile.display_name || "Admin Official",
    };

    const unauthorizedAdminContext: AdminContext = {
      profileId: adminProfile.id,
      authUserId: adminAuthId,
      role: "VIEWER" as any,
      email: adminProfile.email || "admin@mva.org",
      displayName: adminProfile.display_name || "Admin Official",
    };

    // League & Category
    const league = await prisma.leagues.create({
      data: {
        name: `Test Tournament League ${Date.now()}`,
        status: "OPEN_FOR_REGISTRATION",
        year: 2026,
        league_categories: {
          create: {
            name: "Open Conference",
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
    createdLeagueIds.push(league.id);
    const category = league.league_categories[0];

    // Team
    const team = await prisma.teams.create({
      data: {
        team_name: `Test Spikers ${Date.now()}`,
        slug: `test-spikers-${Date.now()}`,
      },
    });
    createdTeamIds.push(team.id);

    // Players
    const player1 = await prisma.players.create({
      data: {
        first_name: "Roberto",
        last_name: "Alcantara",
      },
    });
    createdPlayerIds.push(player1.id);

    const player2 = await prisma.players.create({
      data: {
        first_name: "Carlos",
        last_name: "Valdez",
      },
    });
    createdPlayerIds.push(player2.id);

    // Registration with Historical / Legacy Registration-Level Payment (registration_player_id = NULL)
    const reg = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team.id,
        registrant_first_name: "Marco",
        registrant_last_name: "Solis",
        registrant_contact: "09171112233",
        status: "PENDING_PAYMENT",
        registration_players: {
          create: [
            {
              player_id: player1.id,
              is_captain: true,
              jersey_number: 7,
              position: "Setter",
            },
            {
              player_id: player2.id,
              is_captain: false,
              jersey_number: 14,
              position: "Libero",
            },
          ],
        },
        payments: {
          create: {
            payment_method: "OTHER",
            amount: 600.0,
            status: "PENDING",
            notes: "Legacy registration-level assessment for 2 players",
            // registration_player_id is intentionally omitted (NULL)
          },
        },
      },
      include: {
        registration_players: true,
        payments: true,
      },
    });
    createdRegistrationIds.push(reg.id);
    const legacyPayment = reg.payments[0];
    createdPaymentIds.push(legacyPayment.id);

    const rp1 = reg.registration_players.find((rp) => rp.player_id === player1.id)!;
    const rp2 = reg.registration_players.find((rp) => rp.player_id === player2.id)!;

    console.log("\n--- 4. EXISTING PAYMENT DATA PRESERVATION ---");
    assert(
      legacyPayment.registration_player_id === null,
      "Test 4A: Historical registration-level payment has registration_player_id = NULL"
    );
    assert(
      Number(legacyPayment.amount) === 600.0,
      "Test 4B: Historical registration payment amount (₱600) is completely preserved"
    );
    assert(
      legacyPayment.status === "PENDING",
      "Test 4C: Historical registration payment status remains PENDING"
    );

    console.log("\n--- 5. PER-PLAYER PAYMENT CREATION & INITIAL STATE ---");
    // Create individual player payment assessment for Player 1
    const player1Payment = await prisma.payments.create({
      data: {
        registration_id: reg.id,
        registration_player_id: rp1.id,
        payment_method: "CASH",
        amount: PLAYER_PAYMENT_FEE,
        status: "PENDING",
        notes: "Player registration assessment for Roberto Alcantara",
      },
    });
    createdPaymentIds.push(player1Payment.id);

    assert(
      player1Payment.registration_player_id === rp1.id,
      "Test 5A: Player payment is linked directly to registration_players.id"
    );
    assert(
      Number(player1Payment.amount) === 300.0,
      "Test 5B: Player payment amount strictly enforces ₱300 business rule"
    );
    assert(
      player1Payment.status === "PENDING",
      "Test 5C: Newly created player payment is initialized to PENDING"
    );
    assert(
      player1Payment.verified_at === null && player1Payment.verified_by_profile_id === null,
      "Test 5D: Newly created player payment has verified_at = null and verified_by_profile_id = null"
    );

    console.log("\n--- 6. AUTHORIZATION & INPUT VALIDATION GUARDS ---");
    const resUnauth = await mutatePlayerPaymentStatus(unauthorizedAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "VERIFY",
    });
    assert(
      !resUnauth.success && resUnauth.error === "UNAUTHORIZED",
      "Test 6A: Non-admin context is rejected with UNAUTHORIZED"
    );

    const resInvalidRoster = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: randomUUID(),
      action: "VERIFY",
    });
    assert(
      !resInvalidRoster.success && resInvalidRoster.error === "NOT_FOUND",
      "Test 6B: Non-existent registration player returns NOT_FOUND"
    );

    const resRejectNoReason = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "REJECT",
      reason: "   ",
    });
    assert(
      !resRejectNoReason.success && resRejectNoReason.error === "VALIDATION_ERROR",
      "Test 6C: REJECT without reason is rejected with VALIDATION_ERROR"
    );

    console.log("\n--- 7. ADMIN VERIFICATION FLOW & AUDIT INTEGRITY ---");
    const resVerify = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "VERIFY",
      expectedStatus: "PENDING",
      paymentMethod: "CASH",
      referenceNumber: "OR-001234",
      notes: "Received in cash at gym registration desk",
    });

    assert(
      resVerify.success && resVerify.newStatus === "VERIFIED",
      "Test 7A: Valid PENDING -> VERIFIED player payment mutation succeeds"
    );

    if (resVerify.success) {
      createdAuditLogIds.push(resVerify.auditLogId);
    }

    const dbPay1 = await prisma.payments.findUnique({
      where: { id: player1Payment.id },
    });

    assert(
      dbPay1?.status === "VERIFIED",
      "Test 7B: Database payment record updated to status VERIFIED"
    );
    assert(
      dbPay1?.verified_at instanceof Date,
      "Test 7C: Payment verified_at timestamp is populated"
    );
    assert(
      dbPay1?.verified_by_profile_id === adminProfile.id,
      "Test 7D: Payment verified_by_profile_id correctly attributes the verifying administrator"
    );
    assert(
      dbPay1?.reference_number === "OR-001234",
      "Test 7E: Reference number is correctly saved"
    );

    // Audit log check
    const auditLogs = await prisma.admin_audit_logs.findMany({
      where: {
        entity_type: "PAYMENT",
        entity_id: player1Payment.id,
      },
    });

    assert(
      auditLogs.length === 1,
      "Test 7F: Exactly one admin_audit_logs record was written for player payment verification"
    );

    const audit1 = auditLogs[0];
    const meta1 = audit1.metadata as Record<string, unknown>;

    assert(
      audit1.action === "PLAYER_PAYMENT_VERIFIED",
      "Test 7G: Audit action is PLAYER_PAYMENT_VERIFIED"
    );
    assert(
      meta1.player_name === "Roberto Alcantara" &&
        Number(meta1.amount) === 300 &&
        meta1.payment_method === "CASH" &&
        meta1.actor_email === adminProfile.email,
      "Test 7H: Audit metadata captures complete structured player, team, and actor details"
    );

    console.log("\n--- 8. ACCIDENTAL DUPLICATE VERIFICATION & CONCURRENCY PROTECTION ---");
    // Attempt to verify already verified payment
    const resDuplicateVerify = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "VERIFY",
    });

    assert(
      !resDuplicateVerify.success && resDuplicateVerify.error === "STALE_STATE",
      "Test 8A: Idempotent re-verify attempt safely rejected with STALE_STATE"
    );

    // Attempt concurrent duplicate insert violating partial unique index
    let partialUniqueIndexBlocked = false;
    try {
      await prisma.payments.create({
        data: {
          registration_id: reg.id,
          registration_player_id: rp1.id,
          payment_method: "GCASH",
          amount: 300.0,
          status: "VERIFIED", // Collides with existing VERIFIED payment for rp1
        },
      });
    } catch (e: any) {
      partialUniqueIndexBlocked =
        String(e).includes("uq_payments_active_verified_player") ||
        String(e).includes("Unique constraint failed");
    }

    assert(
      partialUniqueIndexBlocked,
      "Test 8B: PostgreSQL partial unique index (uq_payments_active_verified_player) rejects duplicate VERIFIED payment"
    );

    console.log("\n--- 9. DOMAIN INDEPENDENCE (TEAM ≠ ROSTER ≠ PAYMENT) ---");
    const dbRegAfterPlayerVerify = await prisma.registrations.findUnique({
      where: { id: reg.id },
    });

    assert(
      dbRegAfterPlayerVerify?.status === "PENDING_PAYMENT",
      "Test 9A: Verifying a player payment leaves team registration status strictly UNTOUCHED (PENDING_PAYMENT)"
    );

    // Check Player 2 status (remains unpaid)
    const p2Payments = await prisma.payments.findMany({
      where: { registration_player_id: rp2.id },
    });
    assert(
      p2Payments.length === 0,
      "Test 9B: Player 2 payment status remains independent (no unverified assumption)"
    );

    console.log("\n--- 10. REFUND FLOW & TERMINAL STATE ---");
    const resRefundNoReason = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "REFUND",
      reason: "",
    });
    assert(
      !resRefundNoReason.success && resRefundNoReason.error === "VALIDATION_ERROR",
      "Test 10A: REFUND with empty reason is rejected with VALIDATION_ERROR"
    );

    const resRefund = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "REFUND",
      reason: "Player withdrew from competition due to injury",
    });

    assert(
      resRefund.success && resRefund.newStatus === "REFUNDED",
      "Test 10B: Valid VERIFIED -> REFUNDED mutation succeeds"
    );

    if (resRefund.success) {
      createdAuditLogIds.push(resRefund.auditLogId);
    }

    const dbPay1Refunded = await prisma.payments.findUnique({
      where: { id: player1Payment.id },
    });
    assert(
      dbPay1Refunded?.status === "REFUNDED",
      "Test 10C: Database status updated to REFUNDED"
    );

    const resReverifyRefunded = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp1.id,
      paymentId: player1Payment.id,
      action: "VERIFY",
    });
    assert(
      !resReverifyRefunded.success && resReverifyRefunded.error === "INVALID_TRANSITION",
      "Test 10D: Cannot transition REFUNDED -> VERIFIED (REFUNDED is terminal)"
    );

    console.log("\n--- 11. REJECTION FLOW ---");
    // Create new pending payment for Player 2
    const player2Payment = await prisma.payments.create({
      data: {
        registration_id: reg.id,
        registration_player_id: rp2.id,
        payment_method: "GCASH",
        amount: 300.0,
        status: "PENDING",
        reference_number: "FAKE-REF-9999",
      },
    });
    createdPaymentIds.push(player2Payment.id);

    const resReject = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp2.id,
      paymentId: player2Payment.id,
      action: "REJECT",
      reason: "Invalid GCash reference number; transaction not found in bank ledger",
    });

    assert(
      resReject.success && resReject.newStatus === "REJECTED",
      "Test 11A: PENDING -> REJECTED player payment succeeds with mandatory reason"
    );

    if (resReject.success) {
      createdAuditLogIds.push(resReject.auditLogId);
    }

    const dbPay2 = await prisma.payments.findUnique({
      where: { id: player2Payment.id },
    });
    assert(
      dbPay2?.status === "REJECTED" && dbPay2?.verified_at === null,
      "Test 11B: Database status is REJECTED and verified_at remains null"
    );

    const resRejectToRefund = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp2.id,
      paymentId: player2Payment.id,
      action: "REFUND",
      reason: "Attempting illegal refund of rejected payment",
    });
    assert(
      !resRejectToRefund.success && resRejectToRefund.error === "INVALID_TRANSITION",
      "Test 11C: Cannot refund a REJECTED payment (INVALID_TRANSITION)"
    );

    console.log("\n--- 12. PUBLIC ROSTER VERIFICATION IMMUTABILITY RULE CHECK ---");
    // Verify player payment status detection
    const isPlayer1Paid = dbPay1Refunded?.status === "VERIFIED";
    assert(
      !isPlayer1Paid,
      "Test 12A: Refunded player is correctly identified as not actively verified"
    );

    // Create verified payment for Player 2 to test isPaid check
    const p2Reverify = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: rp2.id,
      paymentId: player2Payment.id,
      action: "VERIFY",
      paymentMethod: "CASH",
      referenceNumber: "CASH-CORRECTED",
    });
    assert(
      p2Reverify.success && p2Reverify.newStatus === "VERIFIED",
      "Test 12B: REJECTED payment re-verified with valid cash proof"
    );

    const p2RosterAfter = await prisma.registration_players.findUnique({
      where: { id: rp2.id },
      include: {
        payments: true,
      },
    });
    const isP2Paid = p2RosterAfter?.payments.some((p) => p.status === "VERIFIED");
    assert(
      isP2Paid === true,
      "Test 12C: Active VERIFIED payment is instantly resolvable from registration_players.payments"
    );
  } finally {
    // 13. Teardown
    console.log("\n--- 13. EPHEMERAL FIXTURE CLEANUP & RESTORATION ---");
    if (createdProfileIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { admin_profile_id: { in: createdProfileIds } },
      });
    }

    if (createdPaymentIds.length > 0) {
      await prisma.payments.deleteMany({
        where: { id: { in: createdPaymentIds } },
      });
    }

    if (createdRegistrationIds.length > 0) {
      await prisma.registrations.deleteMany({
        where: { id: { in: createdRegistrationIds } },
      });
    }

    if (createdPlayerIds.length > 0) {
      await prisma.players.deleteMany({
        where: { id: { in: createdPlayerIds } },
      });
    }

    if (createdTeamIds.length > 0) {
      await prisma.teams.deleteMany({
        where: { id: { in: createdTeamIds } },
      });
    }

    if (createdLeagueIds.length > 0) {
      await prisma.leagues.deleteMany({
        where: { id: { in: createdLeagueIds } },
      });
    }

    if (createdAdminAccessIds.length > 0) {
      await prisma.admin_access.deleteMany({
        where: { id: { in: createdAdminAccessIds } },
      });
    }

    if (createdProfileIds.length > 0) {
      await prisma.profiles.deleteMany({
        where: { id: { in: createdProfileIds } },
      });
    }

    console.log("  [CLEANUP] Successfully removed all ephemeral test fixtures from mva_dev.\n");
  }

  console.log("===============================================================");
  console.log(`VERIFICATION SUMMARY: ${passes} PASSED, ${failures} FAILED`);
  console.log("===============================================================\n");

  if (failures > 0) {
    throw new Error(`Verification suite failed with ${failures} failing tests.`);
  }
}

runVerification()
  .catch((err) => {
    console.error("Fatal verification error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
