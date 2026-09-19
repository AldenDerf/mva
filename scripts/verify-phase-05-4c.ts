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
  mutateRegistrationStatus,
  isAllowedTransition,
  getTargetStatusForAction,
  getAuditActionName,
} from "../lib/admin/registration-mutations";
import { AdminContext } from "../lib/auth/admin";

/**
 * PHASE 05.4C: REGISTRATION STATUS MUTATIONS & AUDIT LOGGING VERIFICATION SUITE
 * 
 * Verifies:
 * 1. Strict database safety guard (must be local mva_dev, NEVER remote or production).
 * 2. Static verification of Server Action code & authorization guard (requireAdmin).
 * 3. State Machine transition invariants (allowed vs explicitly blocked transitions).
 * 4. Reason requirements (mandatory for REJECT and CANCEL, optional for VERIFY).
 * 5. Atomic conditional update & concurrency protection (stale-state rejection).
 * 6. Audit logging integrity (exact fields, actor attribution, structured metadata).
 * 7. Transaction atomicity (rollback on audit error).
 * 8. verified_at timestamp preservation (set on VERIFY, retained when VERIFIED -> CANCELLED).
 * 9. Payment separation (payments.status and verified_at remain untouched).
 * 10. registrations.notes immutability (notes remain untouched).
 * 11. Under-minimum roster verification permission (admin override).
 * 12. Missing / pending payment verification permission.
 * 13. Terminal states (REJECTED and CANCELLED cannot transition).
 * 14. 100% clean teardown of all ephemeral test fixtures.
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
  console.log("PHASE 05.4C: REGISTRATION MUTATIONS & AUDIT LOGGING VERIFICATION");
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
    "app/admin/(portal)/registrations/[id]/actions.ts"
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
    actionsCode.includes("mutateRegistrationStatus"),
    "Test 1C: Server Action delegates to domain service mutateRegistrationStatus"
  );

  assert(
    actionsCode.includes("revalidatePath"),
    "Test 1D: Server Action revalidates Next.js cache paths upon mutation"
  );

  // Unit verification of pure state machine transitions
  console.log("\n--- 2. PURE STATE MACHINE TRANSITION RULES ---");
  assert(
    isAllowedTransition("PENDING_PAYMENT", "VERIFIED") &&
      isAllowedTransition("PENDING_PAYMENT", "REJECTED") &&
      isAllowedTransition("PENDING_PAYMENT", "CANCELLED"),
    "Test 2A: PENDING_PAYMENT allows transitions to VERIFIED, REJECTED, and CANCELLED"
  );

  assert(
    isAllowedTransition("VERIFIED", "CANCELLED"),
    "Test 2B: VERIFIED allows transition to CANCELLED"
  );

  assert(
    !isAllowedTransition("VERIFIED", "PENDING_PAYMENT") &&
      !isAllowedTransition("VERIFIED", "REJECTED"),
    "Test 2C: VERIFIED explicitly blocks transitions to PENDING_PAYMENT and REJECTED"
  );

  assert(
    !isAllowedTransition("REJECTED", "VERIFIED") &&
      !isAllowedTransition("REJECTED", "PENDING_PAYMENT") &&
      !isAllowedTransition("REJECTED", "CANCELLED"),
    "Test 2D: REJECTED is strictly a terminal state (all transitions blocked)"
  );

  assert(
    !isAllowedTransition("CANCELLED", "VERIFIED") &&
      !isAllowedTransition("CANCELLED", "PENDING_PAYMENT") &&
      !isAllowedTransition("CANCELLED", "REJECTED"),
    "Test 2E: CANCELLED is strictly a terminal state (all transitions blocked)"
  );

  assert(
    getTargetStatusForAction("VERIFY") === "VERIFIED" &&
      getTargetStatusForAction("REJECT") === "REJECTED" &&
      getTargetStatusForAction("CANCEL") === "CANCELLED",
    "Test 2F: getTargetStatusForAction correctly maps semantic actions to target statuses"
  );

  assert(
    getAuditActionName("VERIFY") === "REGISTRATION_VERIFIED" &&
      getAuditActionName("REJECT") === "REGISTRATION_REJECTED" &&
      getAuditActionName("CANCEL") === "REGISTRATION_CANCELLED",
    "Test 2G: getAuditActionName correctly maps semantic actions to audit action constants"
  );

  // Fixture Tracking Arrays for Guaranteed 100% Cleanup
  const createdProfileIds: string[] = [];
  const createdLeagueIds: string[] = [];
  const createdTeamIds: string[] = [];
  const createdPlayerIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdAuditLogIds: string[] = [];

  try {
    console.log("\n--- 3. EPHEMERAL FIXTURE SETUP IN mva_dev ---");

    // Admin Profile Fixture
    const adminAuthUserId = randomUUID();
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: adminAuthUserId,
        display_name: "Verification Admin",
        email: "verify_admin@example.com",
        admin_access: {
          create: {
            role: "ADMIN",
            is_active: true,
          },
        },
      },
    });
    createdProfileIds.push(adminProfile.id);

    const validAdminContext: AdminContext = {
      authUserId: adminProfile.auth_user_id,
      profileId: adminProfile.id,
      displayName: adminProfile.display_name!,
      email: adminProfile.email!,
      role: "ADMIN",
    };

    const unauthorizedAdminContext: AdminContext = {
      authUserId: randomUUID(),
      profileId: randomUUID(),
      displayName: "Guest User",
      email: "guest@example.com",
      role: "GUEST",
    };

    // League with min_players = 6
    const league = await prisma.leagues.create({
      data: {
        name: `Phase 05.4C Test League ${Date.now()}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
        league_categories: {
          create: [
            {
              name: "Men's Open",
              registration_fee: 300.0,
              min_players: 6,
              max_players: 12,
            },
          ],
        },
      },
      include: {
        league_categories: true,
      },
    });
    createdLeagueIds.push(league.id);
    const category = league.league_categories[0];

    // Teams
    const team1 = await prisma.teams.create({
      data: {
        team_name: `Test Team Alpha ${Date.now()}`,
        slug: `test-team-alpha-${Date.now()}`,
      },
    });
    createdTeamIds.push(team1.id);

    const team2 = await prisma.teams.create({
      data: {
        team_name: `Test Team Beta ${Date.now()}`,
        slug: `test-team-beta-${Date.now()}`,
      },
    });
    createdTeamIds.push(team2.id);

    const team3 = await prisma.teams.create({
      data: {
        team_name: `Test Team Gamma ${Date.now()}`,
        slug: `test-team-gamma-${Date.now()}`,
      },
    });
    createdTeamIds.push(team3.id);

    // Players (2 players, under the 6-player minimum)
    const player1 = await prisma.players.create({
      data: { first_name: "Ramil", last_name: "Abad" },
    });
    createdPlayerIds.push(player1.id);

    const player2 = await prisma.players.create({
      data: { first_name: "Danilo", last_name: "Castillo" },
    });
    createdPlayerIds.push(player2.id);

    // Registration 1 (Alpha): Under-minimum roster (2 players), PENDING payment
    const reg1 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team1.id,
        registrant_first_name: "Ramil",
        registrant_last_name: "Abad",
        registrant_contact: "09181234567",
        registrant_email: "ramil@example.com",
        status: "PENDING_PAYMENT",
        notes: "Initial registrant notes must be preserved untouched.",
        registration_players: {
          create: [
            {
              player_id: player1.id,
              is_captain: true,
              jersey_number: 10,
              position: "Setter",
            },
            {
              player_id: player2.id,
              is_captain: false,
              jersey_number: 4,
              position: "Outside Hitter",
            },
          ],
        },
        payments: {
          create: {
            payment_method: "GCASH",
            amount: 600.0,
            status: "PENDING",
            notes: "Pending online transfer",
          },
        },
      },
      include: {
        payments: true,
      },
    });
    createdRegistrationIds.push(reg1.id);

    // Registration 2 (Beta): For rejection testing
    const reg2 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team2.id,
        registrant_first_name: "Danilo",
        registrant_last_name: "Castillo",
        registrant_contact: "09189876543",
        status: "PENDING_PAYMENT",
        notes: "Beta notes",
      },
    });
    createdRegistrationIds.push(reg2.id);

    // Registration 3 (Gamma): For missing-payment verification testing
    const reg3 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team3.id,
        registrant_first_name: "Maria",
        registrant_last_name: "Agudo",
        registrant_contact: "09185554433",
        status: "PENDING_PAYMENT",
        // No payment records
      },
    });
    createdRegistrationIds.push(reg3.id);

    console.log("\n--- 4. INPUT VALIDATION & AUTHORIZATION BOUNDARIES ---");

    // Test: Invalid UUID
    const resInvalidId = await mutateRegistrationStatus(validAdminContext, {
      registrationId: "not-a-uuid",
      action: "VERIFY",
    });
    assert(
      !resInvalidId.success && resInvalidId.error === "VALIDATION_ERROR",
      "Test 4A: Malformed UUID registration ID is safely rejected with VALIDATION_ERROR"
    );

    // Test: Non-existent UUID
    const resNonExistent = await mutateRegistrationStatus(validAdminContext, {
      registrationId: randomUUID(),
      action: "VERIFY",
    });
    assert(
      !resNonExistent.success && resNonExistent.error === "NOT_FOUND",
      "Test 4B: Non-existent registration ID returns NOT_FOUND error"
    );

    // Test: Unauthorized actor
    const resUnauth = await mutateRegistrationStatus(unauthorizedAdminContext, {
      registrationId: reg1.id,
      action: "VERIFY",
    });
    assert(
      !resUnauth.success && resUnauth.error === "UNAUTHORIZED",
      "Test 4C: Non-admin context is rejected with UNAUTHORIZED"
    );

    // Test: Mandatory reason for REJECT
    const resRejectNoReason = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "REJECT",
      reason: "   ",
    });
    assert(
      !resRejectNoReason.success && resRejectNoReason.error === "VALIDATION_ERROR",
      "Test 4D: REJECT with empty/whitespace reason is rejected with VALIDATION_ERROR"
    );

    // Test: Mandatory reason for CANCEL
    const resCancelNoReason = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "CANCEL",
      reason: "",
    });
    assert(
      !resCancelNoReason.success && resCancelNoReason.error === "VALIDATION_ERROR",
      "Test 4E: CANCEL with empty reason is rejected with VALIDATION_ERROR"
    );

    // Test: Stale expected status
    const resStaleExpected = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "CANCEL",
      expectedStatus: "VERIFIED", // Actual is PENDING_PAYMENT
      reason: "Cancelling old state",
    });
    assert(
      !resStaleExpected.success && resStaleExpected.error === "STALE_STATE",
      "Test 4F: Stale expectedStatus mismatch returns STALE_STATE guard"
    );

    console.log("\n--- 5. VALID VERIFICATION MUTATION & DOMAIN POLICIES ---");

    // Test: Verify Registration 1 (under-minimum roster & pending payment can still verify)
    const resVerify = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "VERIFY",
      expectedStatus: "PENDING_PAYMENT",
      reason: "Admin approved under-minimum roster dispensation",
    });

    assert(
      resVerify.success && resVerify.newStatus === "VERIFIED",
      "Test 5A: Valid PENDING_PAYMENT -> VERIFIED succeeds (under-minimum roster + pending payment allowed)"
    );

    if (resVerify.success) {
      createdAuditLogIds.push(resVerify.auditLogId);
    }

    // Read mutated record from DB
    const dbReg1 = await prisma.registrations.findUnique({
      where: { id: reg1.id },
      include: {
        payments: true,
      },
    });

    assert(
      dbReg1?.status === "VERIFIED",
      "Test 5B: registrations.status in database is updated to VERIFIED"
    );

    assert(
      dbReg1?.verified_at instanceof Date,
      "Test 5C: registrations.verified_at is populated with valid timestamp"
    );

    assert(
      dbReg1?.notes === "Initial registrant notes must be preserved untouched.",
      "Test 5D: registrations.notes remains completely UNCHANGED (no injected text)"
    );

    assert(
      dbReg1?.payments[0].status === "PENDING",
      "Test 5E: payments.status remains UNTOUCHED (PENDING) across registration verification"
    );

    assert(
      dbReg1?.payments[0].verified_at === null,
      "Test 5F: payments.verified_at remains UNTOUCHED (null) across registration verification"
    );

    // Verify Audit Log entry
    const auditLogs1 = await prisma.admin_audit_logs.findMany({
      where: {
        entity_type: "REGISTRATION",
        entity_id: reg1.id,
      },
      include: {
        profiles: true,
      },
    });

    assert(
      auditLogs1.length === 1,
      "Test 5G: Exactly one admin_audit_logs row was created for registration verification"
    );

    const log1 = auditLogs1[0];
    const log1Meta = log1?.metadata as Record<string, unknown>;

    assert(
      log1?.action === "REGISTRATION_VERIFIED" &&
        log1?.admin_profile_id === adminProfile.id &&
        log1?.profiles.email === "verify_admin@example.com",
      "Test 5H: Audit log has action 'REGISTRATION_VERIFIED' and correct admin profile attribution"
    );

    assert(
      Boolean(
        log1Meta?.previous_status === "PENDING_PAYMENT" &&
          log1Meta?.new_status === "VERIFIED" &&
          log1Meta?.actor_email === "verify_admin@example.com" &&
          typeof log1Meta?.team_name === "string" &&
          log1Meta.team_name.startsWith("Test Team Alpha")
      ),
      "Test 5I: Audit log metadata contains previous_status, new_status, team_name, and actor info"
    );

    console.log("\n--- 6. IDEMPOTENCY & STALE CONCURRENCY GUARDS ---");

    // Test: Attempting same-state transition (VERIFIED -> VERIFY)
    const resSameState = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "VERIFY",
    });

    assert(
      !resSameState.success && resSameState.error === "STALE_STATE",
      "Test 6A: Same-state transition attempt is detected and rejected safely"
    );

    const auditCountAfterSameState = await prisma.admin_audit_logs.count({
      where: { entity_type: "REGISTRATION", entity_id: reg1.id },
    });

    assert(
      auditCountAfterSameState === 1,
      "Test 6B: Same-state attempt does NOT create duplicate audit log"
    );

    console.log("\n--- 7. BLOCKED TRANSITIONS FROM VERIFIED ---");

    // Test: VERIFIED -> REJECT is blocked
    const resVerifiedToReject = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "REJECT",
      reason: "Attempting to reject already verified team",
    });

    assert(
      !resVerifiedToReject.success && resVerifiedToReject.error === "INVALID_TRANSITION",
      "Test 7A: VERIFIED -> REJECT is explicitly blocked with INVALID_TRANSITION"
    );

    console.log("\n--- 8. VERIFIED -> CANCELLED TRANSITION & TIMESTAMP PRESERVATION ---");

    const originalVerifiedAt = dbReg1?.verified_at;

    const resCancelVerified = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "CANCEL",
      expectedStatus: "VERIFIED",
      reason: "Team withdrew due to scheduling conflict",
    });

    assert(
      resCancelVerified.success && resCancelVerified.newStatus === "CANCELLED",
      "Test 8A: VERIFIED -> CANCELLED succeeds with required reason"
    );

    if (resCancelVerified.success) {
      createdAuditLogIds.push(resCancelVerified.auditLogId);
    }

    const dbReg1Cancelled = await prisma.registrations.findUnique({
      where: { id: reg1.id },
    });

    assert(
      dbReg1Cancelled?.status === "CANCELLED",
      "Test 8B: Registration status in DB is updated to CANCELLED"
    );

    assert(
      Boolean(
        dbReg1Cancelled?.verified_at &&
          originalVerifiedAt &&
          dbReg1Cancelled.verified_at.getTime() === originalVerifiedAt.getTime()
      ),
      "Test 8C: Historical verified_at timestamp is PRESERVED when cancelling verified registration"
    );

    const cancelAuditLogs = await prisma.admin_audit_logs.findMany({
      where: {
        entity_type: "REGISTRATION",
        entity_id: reg1.id,
        action: "REGISTRATION_CANCELLED",
      },
    });

    assert(
      Boolean(
        cancelAuditLogs.length === 1 &&
          (cancelAuditLogs[0].metadata as Record<string, unknown>)?.reason ===
            "Team withdrew due to scheduling conflict"
      ),
      "Test 8D: Audit log for cancellation correctly captures mandatory reason"
    );

    console.log("\n--- 9. TERMINAL STATE ENFORCEMENT ---");

    // Test: CANCELLED -> VERIFIED blocked
    const resCancelledToVerify = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "VERIFY",
    });

    assert(
      !resCancelledToVerify.success && resCancelledToVerify.error === "INVALID_TRANSITION",
      "Test 9A: CANCELLED -> VERIFIED is blocked (CANCELLED is terminal)"
    );

    // Test: CANCELLED -> REJECTED blocked
    const resCancelledToReject = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg1.id,
      action: "REJECT",
      reason: "Trying to reject cancelled entry",
    });

    assert(
      !resCancelledToReject.success && resCancelledToReject.error === "INVALID_TRANSITION",
      "Test 9B: CANCELLED -> REJECTED is blocked (CANCELLED is terminal)"
    );

    console.log("\n--- 10. REJECTION FLOW & TERMINAL REJECTED STATE ---");

    // Test: Registration 2 REJECT
    const resReject2 = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg2.id,
      action: "REJECT",
      expectedStatus: "PENDING_PAYMENT",
      reason: "Ineligible team registration (player age non-compliance)",
    });

    assert(
      resReject2.success && resReject2.newStatus === "REJECTED",
      "Test 10A: PENDING_PAYMENT -> REJECTED succeeds with required reason"
    );

    if (resReject2.success) {
      createdAuditLogIds.push(resReject2.auditLogId);
    }

    const dbReg2 = await prisma.registrations.findUnique({
      where: { id: reg2.id },
    });

    assert(
      dbReg2?.status === "REJECTED" && dbReg2?.verified_at === null,
      "Test 10B: Rejected registration has status REJECTED and verified_at remains null"
    );

    // Test: REJECTED -> VERIFIED blocked
    const resRejectToVerify = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg2.id,
      action: "VERIFY",
    });

    assert(
      !resRejectToVerify.success && resRejectToVerify.error === "INVALID_TRANSITION",
      "Test 10C: REJECTED -> VERIFIED is blocked (REJECTED is terminal)"
    );

    // Test: REJECTED -> CANCELLED blocked
    const resRejectToCancel = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg2.id,
      action: "CANCEL",
      reason: "Trying to cancel rejected",
    });

    assert(
      !resRejectToCancel.success && resRejectToCancel.error === "INVALID_TRANSITION",
      "Test 10D: REJECTED -> CANCELLED is blocked (REJECTED is terminal)"
    );

    console.log("\n--- 11. REGISTRATION WITHOUT PAYMENT RECORD ---");

    // Test: Registration 3 (Gamma) has 0 payment records; can still verify
    const resVerifyNoPayment = await mutateRegistrationStatus(validAdminContext, {
      registrationId: reg3.id,
      action: "VERIFY",
      expectedStatus: "PENDING_PAYMENT",
    });

    assert(
      resVerifyNoPayment.success && resVerifyNoPayment.newStatus === "VERIFIED",
      "Test 11A: Registration with 0 payment records can still be verified by admin"
    );

    if (resVerifyNoPayment.success) {
      createdAuditLogIds.push(resVerifyNoPayment.auditLogId);
    }

    console.log("\n--- 12. TRANSACTION ROLLBACK INTEGRITY ---");

    // Test: Simulate audit creation failure by supplying an invalid profileId inside a transaction
    const corruptedAdminContext: AdminContext = {
      authUserId: validAdminContext.authUserId,
      profileId: randomUUID(), // Non-existent foreign key in profiles
      displayName: "Fake Admin",
      email: "fake@example.com",
      role: "ADMIN",
    };

    // Create temporary team 4 and registration 4 to test rollback
    const team4 = await prisma.teams.create({
      data: {
        team_name: `Test Team Delta ${Date.now()}`,
        slug: `test-team-delta-${Date.now()}`,
      },
    });
    createdTeamIds.push(team4.id);

    const reg4 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team4.id,
        registrant_first_name: "Rollback",
        registrant_last_name: "Test",
        registrant_contact: "09180000000",
        status: "PENDING_PAYMENT",
      },
    });
    createdRegistrationIds.push(reg4.id);

    const resRollback = await mutateRegistrationStatus(corruptedAdminContext, {
      registrationId: reg4.id,
      action: "VERIFY",
    });

    assert(
      !resRollback.success && resRollback.error === "TRANSACTION_ERROR",
      "Test 12A: Transaction error is caught when audit insertion fails"
    );

    const dbReg4AfterFail = await prisma.registrations.findUnique({
      where: { id: reg4.id },
    });

    assert(
      dbReg4AfterFail?.status === "PENDING_PAYMENT" && dbReg4AfterFail?.verified_at === null,
      "Test 12B: Transaction rollback preserved original PENDING_PAYMENT status upon audit failure"
    );

    console.log("\n--- 13. REAL CONCURRENT MUTATIONS & ISOLATION TESTS ---");

    // Concurrency Fixture A: Double VERIFY
    const teamConcA = await prisma.teams.create({
      data: {
        team_name: `Test Conc Alpha ${Date.now()}`,
        slug: `test-conc-alpha-${Date.now()}`,
      },
    });
    createdTeamIds.push(teamConcA.id);

    const regConcA = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamConcA.id,
        registrant_first_name: "ConcUserA",
        registrant_last_name: "TesterA",
        registrant_contact: "09181112233",
        status: "PENDING_PAYMENT",
        payments: {
          create: {
            payment_method: "CASH",
            amount: 600.0,
            status: "PENDING",
          },
        },
      },
    });
    createdRegistrationIds.push(regConcA.id);

    const prePayA = await prisma.payments.findFirst({
      where: { registration_id: regConcA.id },
    });

    // TEST 1 — DOUBLE VERIFY (concurrent overlapping executions)
    const [resDouble1, resDouble2] = await Promise.all([
      mutateRegistrationStatus(validAdminContext, {
        registrationId: regConcA.id,
        action: "VERIFY",
        expectedStatus: "PENDING_PAYMENT",
      }),
      mutateRegistrationStatus(validAdminContext, {
        registrationId: regConcA.id,
        action: "VERIFY",
        expectedStatus: "PENDING_PAYMENT",
      }),
    ]);

    const doubleSuccesses = [resDouble1, resDouble2].filter((r) => r.success);
    const doubleFailures = [resDouble1, resDouble2].filter((r) => !r.success);

    assert(
      doubleSuccesses.length === 1,
      "Test 13A: Double VERIFY -> exactly one mutation succeeds",
      `Successes: ${doubleSuccesses.length}, Failures: ${doubleFailures.length}`
    );

    assert(
      doubleFailures.length === 1 && doubleFailures[0].error === "STALE_STATE",
      "Test 13B: Competing VERIFY safely reports STALE_STATE conflict error",
      `Error: ${doubleFailures[0]?.error}, Message: ${doubleFailures[0]?.message}`
    );

    const dbRegConcA = await prisma.registrations.findUnique({
      where: { id: regConcA.id },
    });

    assert(
      dbRegConcA?.status === "VERIFIED" && dbRegConcA?.verified_at !== null,
      "Test 13C: Registration final database status is VERIFIED with verified_at populated"
    );

    const auditLogsConcA = await prisma.admin_audit_logs.findMany({
      where: { entity_type: "REGISTRATION", entity_id: regConcA.id },
    });

    assert(
      auditLogsConcA.length === 1 && auditLogsConcA[0].action === "REGISTRATION_VERIFIED",
      "Test 13D: Exactly ONE REGISTRATION_VERIFIED audit log was created for Double VERIFY"
    );

    // Concurrency Fixture B: Competing VERIFY vs REJECT
    const teamConcB = await prisma.teams.create({
      data: {
        team_name: `Test Conc Beta ${Date.now()}`,
        slug: `test-conc-beta-${Date.now()}`,
      },
    });
    createdTeamIds.push(teamConcB.id);

    const regConcB = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: teamConcB.id,
        registrant_first_name: "ConcUserB",
        registrant_last_name: "TesterB",
        registrant_contact: "09189998877",
        status: "PENDING_PAYMENT",
        payments: {
          create: {
            payment_method: "GCASH",
            amount: 600.0,
            status: "PENDING",
          },
        },
      },
    });
    createdRegistrationIds.push(regConcB.id);

    const prePayB = await prisma.payments.findFirst({
      where: { registration_id: regConcB.id },
    });

    // TEST 2 — COMPETING VERIFY VS REJECT (concurrent overlapping executions)
    const [resCompVerify, resCompReject] = await Promise.all([
      mutateRegistrationStatus(validAdminContext, {
        registrationId: regConcB.id,
        action: "VERIFY",
        expectedStatus: "PENDING_PAYMENT",
      }),
      mutateRegistrationStatus(validAdminContext, {
        registrationId: regConcB.id,
        action: "REJECT",
        expectedStatus: "PENDING_PAYMENT",
        reason: "Duplicate submission detected by concurrent review",
      }),
    ]);

    const compSuccesses = [resCompVerify, resCompReject].filter((r) => r.success);
    const compFailures = [resCompVerify, resCompReject].filter((r) => !r.success);

    assert(
      compSuccesses.length === 1,
      "Test 13E: Competing VERIFY vs REJECT -> exactly one mutation succeeds",
      `Successes: ${compSuccesses.length}, Failures: ${compFailures.length}`
    );

    assert(
      compFailures.length === 1 && compFailures[0].error === "STALE_STATE",
      "Test 13F: Losing competing request safely reports STALE_STATE conflict error",
      `Error: ${compFailures[0]?.error}`
    );

    const dbRegConcB = await prisma.registrations.findUnique({
      where: { id: regConcB.id },
    });

    const winningMutation = compSuccesses[0];
    assert(
      dbRegConcB?.status === winningMutation.newStatus,
      "Test 13G: Final registration status matches winning mutation result",
      `DB: ${dbRegConcB?.status}, Winner: ${winningMutation.newStatus}`
    );

    const auditLogsConcB = await prisma.admin_audit_logs.findMany({
      where: { entity_type: "REGISTRATION", entity_id: regConcB.id },
    });

    assert(
      auditLogsConcB.length === 1,
      "Test 13H: Exactly ONE audit record exists for competing VERIFY vs REJECT"
    );

    const winningAudit = auditLogsConcB[0];
    const expectedWinningAction =
      winningMutation.newStatus === "VERIFIED"
        ? "REGISTRATION_VERIFIED"
        : "REGISTRATION_REJECTED";

    assert(
      winningAudit?.action === expectedWinningAction &&
        (winningAudit?.metadata as Record<string, unknown>)?.new_status === winningMutation.newStatus,
      "Test 13I: Audit action and metadata new_status correspond to the winning operation",
      `Action: ${winningAudit?.action}, Expected: ${expectedWinningAction}`
    );

    // TEST 3 — PAYMENT ISOLATION UNDER CONCURRENCY
    const postPayA = await prisma.payments.findMany({
      where: { registration_id: regConcA.id },
    });
    const postPayB = await prisma.payments.findMany({
      where: { registration_id: regConcB.id },
    });

    assert(
      postPayA.length === 1 &&
        postPayA[0].status === prePayA?.status &&
        postPayA[0].verified_at === null,
      "Test 13J: Payment for Reg A remains untouched (status: PENDING, verified_at: null, count: 1)"
    );

    assert(
      postPayB.length === 1 &&
        postPayB[0].status === prePayB?.status &&
        postPayB[0].verified_at === null,
      "Test 13K: Payment for Reg B remains untouched (status: PENDING, verified_at: null, count: 1)"
    );

    // TEST 4 — AUDIT UNIQUENESS & INTEGRITY
    assert(
      auditLogsConcA.length === 1 &&
        auditLogsConcB.length === 1 &&
        !auditLogsConcA.some((a) => a.action === "REGISTRATION_REJECTED") &&
        (winningMutation.newStatus === "VERIFIED"
          ? !auditLogsConcB.some((a) => a.action === "REGISTRATION_REJECTED")
          : !auditLogsConcB.some((a) => a.action === "REGISTRATION_VERIFIED")),
      "Test 13L: No duplicate or contradictory audit logs created across concurrent operations"
    );

  } finally {
    console.log("\n--- 14. EPHEMERAL FIXTURE CLEANUP & RESTORATION ---");

    try {
      // 1. Delete audit logs
      if (createdAuditLogIds.length > 0) {
        await prisma.admin_audit_logs.deleteMany({
          where: { id: { in: createdAuditLogIds } },
        });
      }
      // Also delete any audit logs associated with created registrations
      if (createdRegistrationIds.length > 0) {
        await prisma.admin_audit_logs.deleteMany({
          where: {
            entity_type: "REGISTRATION",
            entity_id: { in: createdRegistrationIds },
          },
        });
      }

      // 2. Delete registration_players
      if (createdRegistrationIds.length > 0) {
        await prisma.registration_players.deleteMany({
          where: { registration_id: { in: createdRegistrationIds } },
        });

        // 3. Delete payments
        await prisma.payments.deleteMany({
          where: { registration_id: { in: createdRegistrationIds } },
        });

        // 4. Delete registrations
        await prisma.registrations.deleteMany({
          where: { id: { in: createdRegistrationIds } },
        });
      }

      // 5. Delete players
      if (createdPlayerIds.length > 0) {
        await prisma.players.deleteMany({
          where: { id: { in: createdPlayerIds } },
        });
      }

      // 6. Delete teams
      if (createdTeamIds.length > 0) {
        await prisma.teams.deleteMany({
          where: { id: { in: createdTeamIds } },
        });
      }

      // 7. Delete league & categories (cascade)
      if (createdLeagueIds.length > 0) {
        await prisma.league_categories.deleteMany({
          where: { league_id: { in: createdLeagueIds } },
        });
        await prisma.leagues.deleteMany({
          where: { id: { in: createdLeagueIds } },
        });
      }

      // 8. Delete admin profile & admin_access
      if (createdProfileIds.length > 0) {
        await prisma.admin_access.deleteMany({
          where: { profile_id: { in: createdProfileIds } },
        });
        await prisma.profiles.deleteMany({
          where: { id: { in: createdProfileIds } },
        });
      }

      console.log("  [CLEANUP] Successfully removed all ephemeral test fixtures from mva_dev.");
    } catch (cleanupErr) {
      console.error("  [CLEANUP ERROR] Failed to clean up fixtures:", cleanupErr);
    }
  }

  console.log("\n===============================================================");
  console.log(`VERIFICATION SUMMARY: ${passes} PASSED, ${failures} FAILED`);
  console.log("===============================================================\n");

  if (failures > 0) {
    process.exit(1);
  }
}

runVerification()
  .catch((err) => {
    console.error("Fatal verification error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
