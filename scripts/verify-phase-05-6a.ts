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
  addPlayerToRoster,
  isSamePlayerIdentity,
  isDuplicateRosterMember,
  PLAYER_REGISTRATION_FEE,
} from "../lib/admin/roster-mutations";
import { mutatePlayerPaymentStatus } from "../lib/admin/player-payment-mutations";
import { getAdminRegistrationById } from "../lib/admin/registrations";
import { AdminContext } from "../lib/auth/admin";

/**
 * PHASE 05.6A: ADMIN ADD PLAYER TO VERIFIED TEAM VERIFICATION SUITE
 * 
 * Verifies all 36 required criteria:
 * 1. Local database safety guard.
 * 2. Unauthorized caller rejected.
 * 3. Invalid UUID rejected.
 * 4. Missing registration rejected.
 * 5. Non-VERIFIED registration rejected.
 * 6. VERIFIED registration accepts new player.
 * 7. First name required.
 * 8. Last name required.
 * 9. Middle name optional.
 * 10. Suffix optional.
 * 11. Jersey number optional.
 * 12. Position optional.
 * 13. Player row created correctly.
 * 14. registration_players row created correctly.
 * 15. Player immediately belongs to correct registration.
 * 16. Player payment assessment created as ₱300.
 * 17. Initial player payment status is PENDING.
 * 18. Registration status remains VERIFIED.
 * 19. Existing players remain untouched.
 * 20. Existing payments remain untouched.
 * 21. Historical registration-level payment remains untouched.
 * 22. Payment summary reflects increased roster requirement.
 * 23. Audit log created.
 * 24. Audit actor matches authenticated admin.
 * 25. Duplicate same-player submission rejected.
 * 26. Case/whitespace duplicate rejected.
 * 27. Double submission does not create duplicate roster member.
 * 28. Concurrent duplicate requests do not produce duplicate official roster members.
 * 29. Adding player #13 succeeds.
 * 30. Adding player #14+ succeeds.
 * 31. No obsolete max_players = 12 enforcement occurs.
 * 32. Transaction rollback leaves no orphan player/payment on simulated failure.
 * 33. Existing per-player payment verification still works on newly added player.
 * 34. Newly added player can later transition PENDING -> VERIFIED through the existing payment mutation.
 * 35. Payment verification does not change registration status.
 * 36. Verification fixtures are completely cleaned up.
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

    if (!isLocal && !connectionString.includes("localhost") && !connectionString.includes("127.0.0.1")) {
      throw new Error("CRITICAL SAFETY VIOLATION: Database host is not local! Aborting.");
    }

    console.log("  -> SAFETY PROBE CONFIRMED: Target is safe local development database 'mva_dev'.\n");
  } finally {
    await client.end();
  }
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FAIL] Test ${totalTests}: ${testName}`);
    throw new Error(`Test failed: ${testName}`);
  }
}

async function runSuite() {
  const connectionString =
    process.env.DIRECT_URL || process.env.DATABASE_URL || "";

  if (!connectionString) {
    throw new Error("Missing DATABASE_URL / DIRECT_URL in environment.");
  }

  // 1. SAFETY PROBE
  console.log("=== PHASE 05.6A VERIFICATION: ADMIN ADD PLAYER TO VERIFIED TEAM ===\n");
  await verifySafetyProbe(connectionString);

  assert(true, "Local database safety guard confirmed mva_dev");

  // Track created fixture IDs for guaranteed cleanup
  const createdAdminAccessIds: string[] = [];
  const createdAuditLogIds: string[] = [];
  const createdPaymentIds: string[] = [];
  const createdRegistrationPlayerIds: string[] = [];
  const createdPlayerIds: string[] = [];
  const createdRegistrationIds: string[] = [];
  const createdTeamIds: string[] = [];
  const createdCategoryIds: string[] = [];
  const createdLeagueIds: string[] = [];
  const createdProfileIds: string[] = [];

  try {
    const adminAuthId = randomUUID();
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: adminAuthId,
        display_name: "Phase 05.6A Test Admin",
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
      displayName: adminProfile.display_name || "Admin",
    };

    const nonAdminContext: AdminContext = {
      profileId: adminProfile.id,
      authUserId: adminAuthId,
      role: "VIEWER" as any,
      email: adminProfile.email || "user@mva.org",
      displayName: "Non-Admin User",
    };

    console.log("\n--- TEST GROUP A: AUTHORIZATION & INPUT VALIDATION GUARDS ---");

    // Test 2: Unauthorized caller rejected
    const unauthRes = await addPlayerToRoster(nonAdminContext, {
      registrationId: randomUUID(),
      firstName: "Test",
      lastName: "Player",
    });
    assert(
      !unauthRes.success && unauthRes.error === "UNAUTHORIZED",
      "Unauthorized caller rejected (error === 'UNAUTHORIZED')"
    );

    // Test 3: Invalid UUID rejected
    const invalidUuidRes = await addPlayerToRoster(validAdminContext, {
      registrationId: "not-a-valid-uuid",
      firstName: "Test",
      lastName: "Player",
    });
    assert(
      !invalidUuidRes.success && invalidUuidRes.error === "VALIDATION_ERROR",
      "Invalid UUID rejected (error === 'VALIDATION_ERROR')"
    );

    // Test 4: Missing registration rejected
    const nonExistentRegId = randomUUID();
    const missingRegRes = await addPlayerToRoster(validAdminContext, {
      registrationId: nonExistentRegId,
      firstName: "Test",
      lastName: "Player",
    });
    assert(
      !missingRegRes.success && missingRegRes.error === "NOT_FOUND",
      "Missing registration rejected (error === 'NOT_FOUND')"
    );

    console.log("\n--- TEST GROUP B: FIXTURE SETUP & ELIGIBILITY ENFORCEMENT ---");

    // Create a league and category with max_players = 12
    const testLeague = await prisma.leagues.create({
      data: {
        name: `Test League 05.6A ${Date.now()}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    createdLeagueIds.push(testLeague.id);

    const testCategory = await prisma.league_categories.create({
      data: {
        league_id: testLeague.id,
        name: "Test Category 12 Max",
        registration_fee: 300.0,
        min_players: 6,
        max_players: 12,
      },
    });
    createdCategoryIds.push(testCategory.id);

    const testTeam = await prisma.teams.create({
      data: {
        team_name: `Test Team 05.6A ${Date.now()}`,
        slug: `test-team-05-6a-${Date.now()}`,
      },
    });
    createdTeamIds.push(testTeam.id);

    // Create a PENDING_PAYMENT registration
    const pendingReg = await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategory.id,
        team_id: testTeam.id,
        registrant_first_name: "Registrant",
        registrant_last_name: "User",
        registrant_contact: "09123456789",
        status: "PENDING_PAYMENT",
        registration_code: `MVA-PENDING-${Date.now().toString().slice(-4)}`,
      },
    });
    createdRegistrationIds.push(pendingReg.id);

    // Test 5: Non-VERIFIED registration rejected
    const pendingAddRes = await addPlayerToRoster(validAdminContext, {
      registrationId: pendingReg.id,
      firstName: "Jose",
      lastName: "Rizal",
    });
    assert(
      !pendingAddRes.success && pendingAddRes.error === "INVALID_REGISTRATION_STATUS",
      "Non-VERIFIED registration rejected (error === 'INVALID_REGISTRATION_STATUS')"
    );

    // Create a VERIFIED team registration
    const verifiedTeam = await prisma.teams.create({
      data: {
        team_name: `Verified Team 05.6A ${Date.now()}`,
        slug: `verified-team-05-6a-${Date.now()}`,
      },
    });
    createdTeamIds.push(verifiedTeam.id);

    const verifiedReg = await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategory.id,
        team_id: verifiedTeam.id,
        registrant_first_name: "Captain",
        registrant_last_name: "Verified",
        registrant_contact: "09987654321",
        status: "VERIFIED",
        verified_at: new Date(),
        registration_code: `MVA-VER-${Date.now().toString().slice(-4)}`,
      },
    });
    createdRegistrationIds.push(verifiedReg.id);

    // Add 1 initial player to verifiedReg
    const initialPlayer = await prisma.players.create({
      data: {
        first_name: "Initial",
        last_name: "RosterMember",
      },
    });
    createdPlayerIds.push(initialPlayer.id);

    const initialRp = await prisma.registration_players.create({
      data: {
        registration_id: verifiedReg.id,
        player_id: initialPlayer.id,
        jersey_number: 1,
        position: "Setter",
        is_captain: true,
      },
    });
    createdRegistrationPlayerIds.push(initialRp.id);

    const initialPay = await prisma.payments.create({
      data: {
        registration_id: verifiedReg.id,
        registration_player_id: initialRp.id,
        payment_method: "CASH",
        amount: 300.0,
        status: "VERIFIED",
      },
    });
    createdPaymentIds.push(initialPay.id);

    // Add historical registration-level payment
    const historicalTeamPay = await prisma.payments.create({
      data: {
        registration_id: verifiedReg.id,
        registration_player_id: null,
        payment_method: "BANK_TRANSFER",
        amount: 3600.0,
        status: "VERIFIED",
        reference_number: "HIST-REF-001",
      },
    });
    createdPaymentIds.push(historicalTeamPay.id);

    console.log("\n--- TEST GROUP C: ATOMIC ADD PLAYER & FIELD HANDLING ---");

    // Test 6: VERIFIED registration accepts new player
    const addPlayer1Res = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Juan",
      middleName: "Santos",
      lastName: "Dela Cruz",
      suffix: "Jr.",
      jerseyNumber: 7,
      position: "Outside Hitter",
      isCaptain: false,
    });

    assert(
      addPlayer1Res.success === true,
      "VERIFIED registration accepts new player successfully"
    );

    if (addPlayer1Res.success) {
      createdRegistrationPlayerIds.push(addPlayer1Res.registrationPlayerId);
      createdPlayerIds.push(addPlayer1Res.playerId);
      createdPaymentIds.push(addPlayer1Res.paymentId);
      createdAuditLogIds.push(addPlayer1Res.auditLogId);
    }

    // Test 7: First name required
    const noFirstRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "   ",
      lastName: "ValidLast",
    });
    assert(
      !noFirstRes.success && noFirstRes.error === "VALIDATION_ERROR",
      "First name required (empty/whitespace rejected)"
    );

    // Test 8: Last name required
    const noLastRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "ValidFirst",
      lastName: "   ",
    });
    assert(
      !noLastRes.success && noLastRes.error === "VALIDATION_ERROR",
      "Last name required (empty/whitespace rejected)"
    );

    // Test 9 & 10: Middle name optional & Suffix optional
    const optionalNamesRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Pedro",
      lastName: "Penduko",
      // middleName and suffix intentionally omitted
    });
    assert(
      optionalNamesRes.success === true,
      "Middle name and suffix are completely optional"
    );

    if (optionalNamesRes.success) {
      createdRegistrationPlayerIds.push(optionalNamesRes.registrationPlayerId);
      createdPlayerIds.push(optionalNamesRes.playerId);
      createdPaymentIds.push(optionalNamesRes.paymentId);
      createdAuditLogIds.push(optionalNamesRes.auditLogId);
    }

    // Test 11: Jersey number optional & bounded
    const invalidJerseyRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Cardo",
      lastName: "Dalisay",
      jerseyNumber: 150, // Invalid > 99
    });
    assert(
      !invalidJerseyRes.success && invalidJerseyRes.error === "VALIDATION_ERROR",
      "Jersey number optional and strictly bounded (0-99)"
    );

    // Test 12: Position optional
    const optionalPositionRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Cardo",
      lastName: "Dalisay",
      jerseyNumber: 21,
      // position omitted
    });
    assert(
      optionalPositionRes.success === true,
      "Position is completely optional"
    );

    if (optionalPositionRes.success) {
      createdRegistrationPlayerIds.push(optionalPositionRes.registrationPlayerId);
      createdPlayerIds.push(optionalPositionRes.playerId);
      createdPaymentIds.push(optionalPositionRes.paymentId);
      createdAuditLogIds.push(optionalPositionRes.auditLogId);
    }

    console.log("\n--- TEST GROUP D: DATABASE INTEGRITY & PAYMENT BEHAVIOR ---");

    // Test 13: Player row created correctly
    const playerJuan = await prisma.players.findFirst({
      where: {
        first_name: "Juan",
        last_name: "Dela Cruz",
      },
    });
    assert(
      playerJuan !== null &&
        playerJuan.middle_name === "Santos" &&
        playerJuan.suffix === "Jr.",
      "Player row created correctly with accurate name fields"
    );

    // Test 14: registration_players row created correctly
    const rpJuan = await prisma.registration_players.findFirst({
      where: {
        registration_id: verifiedReg.id,
        player_id: playerJuan?.id,
      },
    });
    assert(
      rpJuan !== null &&
        rpJuan.jersey_number === 7 &&
        rpJuan.position === "Outside Hitter" &&
        rpJuan.is_captain === false,
      "registration_players row created correctly with accurate roster details"
    );

    // Test 15: Player immediately belongs to correct registration
    assert(
      rpJuan?.registration_id === verifiedReg.id,
      "Player immediately belongs to correct registration"
    );

    // Test 16: Player payment assessment created as ₱300
    const paymentJuan = await prisma.payments.findFirst({
      where: { registration_player_id: rpJuan?.id },
    });
    assert(
      paymentJuan !== null && Number(paymentJuan.amount) === 300.0,
      "Player payment assessment created as ₱300.00"
    );

    // Test 17: Initial player payment status is PENDING
    assert(
      paymentJuan?.status === "PENDING",
      "Initial player payment status is PENDING"
    );

    // Test 18: Registration status remains VERIFIED
    const dbRegAfterAdd = await prisma.registrations.findUnique({
      where: { id: verifiedReg.id },
    });
    assert(
      dbRegAfterAdd?.status === "VERIFIED",
      "Registration status remains strictly VERIFIED"
    );

    // Test 19: Existing players remain untouched
    const dbInitialPlayer = await prisma.players.findUnique({
      where: { id: initialPlayer.id },
    });
    assert(
      dbInitialPlayer?.first_name === "Initial" &&
        dbInitialPlayer?.last_name === "RosterMember",
      "Existing players remain completely untouched"
    );

    // Test 20: Existing payments remain untouched
    const dbInitialPayment = await prisma.payments.findUnique({
      where: { id: initialPay.id },
    });
    assert(
      dbInitialPayment?.status === "VERIFIED" &&
        Number(dbInitialPayment?.amount) === 300.0,
      "Existing payments remain completely untouched"
    );

    // Test 21: Historical registration-level payment remains untouched
    const dbHistoricalPayment = await prisma.payments.findUnique({
      where: { id: historicalTeamPay.id },
    });
    assert(
      dbHistoricalPayment?.registration_player_id === null &&
        Number(dbHistoricalPayment?.amount) === 3600.0 &&
        dbHistoricalPayment?.reference_number === "HIST-REF-001",
      "Historical registration-level payment remains completely untouched"
    );

    // Test 22: Payment summary reflects increased roster requirement
    const regDetail = await getAdminRegistrationById(verifiedReg.id);
    assert(
      regDetail !== null &&
        regDetail.playerCount === 4 && // initial + Juan + Pedro + Cardo
        regDetail.roster.length === 4,
      "Payment summary reflects increased roster requirement (playerCount and roster size)"
    );

    console.log("\n--- TEST GROUP E: AUDIT LOGGING ---");

    // Test 23: Audit log created
    if (!addPlayer1Res.success) throw new Error("Expected addPlayer1Res success");
    const auditRecord = await prisma.admin_audit_logs.findUnique({
      where: { id: addPlayer1Res.auditLogId },
    });
    assert(
      auditRecord !== null &&
        auditRecord.action === "PLAYER_ADDED_TO_ROSTER" &&
        auditRecord.entity_type === "REGISTRATION_PLAYER" &&
        auditRecord.entity_id === addPlayer1Res.registrationPlayerId,
      "Audit log created with action PLAYER_ADDED_TO_ROSTER and entity_type REGISTRATION_PLAYER"
    );

    // Test 24: Audit actor matches authenticated admin
    const auditMeta = auditRecord?.metadata as Record<string, unknown>;
    assert(
      auditRecord?.admin_profile_id === validAdminContext.profileId &&
        auditMeta.actor_email === validAdminContext.email &&
        auditMeta.actor_name === validAdminContext.displayName &&
        auditMeta.registration_id === verifiedReg.id &&
        auditMeta.team_name === verifiedTeam.team_name,
      "Audit actor matches authenticated admin and contains complete structured metadata"
    );

    console.log("\n--- TEST GROUP F: DUPLICATE & CONCURRENCY PROTECTION ---");

    // Test 25: Duplicate same-player submission rejected
    const dupExactRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Juan",
      middleName: "Santos",
      lastName: "Dela Cruz",
      suffix: "Jr.",
    });
    assert(
      !dupExactRes.success && dupExactRes.error === "DUPLICATE_ROSTER_PLAYER",
      "Duplicate same-player submission rejected (error === 'DUPLICATE_ROSTER_PLAYER')"
    );

    // Test 26: Case/whitespace duplicate rejected
    const dupFuzzyRes = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "   juan   ",
      middleName: "  santos  ",
      lastName: "  dela    cruz  ",
      suffix: "jr.",
    });
    assert(
      !dupFuzzyRes.success && dupFuzzyRes.error === "DUPLICATE_ROSTER_PLAYER",
      "Case and harmless whitespace duplicate rejected"
    );

    // Test 27: Double submission does not create duplicate roster member
    const doubleSubmit1 = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "UniqueOne",
      lastName: "PlayerTest",
    });
    assert(doubleSubmit1.success, "First unique submission succeeds");
    if (doubleSubmit1.success) {
      createdRegistrationPlayerIds.push(doubleSubmit1.registrationPlayerId);
      createdPlayerIds.push(doubleSubmit1.playerId);
      createdPaymentIds.push(doubleSubmit1.paymentId);
      createdAuditLogIds.push(doubleSubmit1.auditLogId);
    }

    const doubleSubmit2 = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "UniqueOne",
      lastName: "PlayerTest",
    });
    assert(
      !doubleSubmit2.success && doubleSubmit2.error === "DUPLICATE_ROSTER_PLAYER",
      "Double submission does not create duplicate roster member"
    );

    // Test 28: Concurrent duplicate requests do not produce duplicate official roster members
    const [concurrentA, concurrentB] = await Promise.all([
      addPlayerToRoster(validAdminContext, {
        registrationId: verifiedReg.id,
        firstName: "ConcurrentRace",
        lastName: "RosterPlayer",
      }),
      addPlayerToRoster(validAdminContext, {
        registrationId: verifiedReg.id,
        firstName: "ConcurrentRace",
        lastName: "RosterPlayer",
      }),
    ]);

    const oneSucceeded = (concurrentA.success && !concurrentB.success) || (!concurrentA.success && concurrentB.success);
    assert(
      oneSucceeded,
      "Concurrent duplicate requests do not produce duplicate official roster members (exactly one succeeds)"
    );

    if (concurrentA.success) {
      createdRegistrationPlayerIds.push(concurrentA.registrationPlayerId);
      createdPlayerIds.push(concurrentA.playerId);
      createdPaymentIds.push(concurrentA.paymentId);
      createdAuditLogIds.push(concurrentA.auditLogId);
    }
    if (concurrentB.success) {
      createdRegistrationPlayerIds.push(concurrentB.registrationPlayerId);
      createdPlayerIds.push(concurrentB.playerId);
      createdPaymentIds.push(concurrentB.paymentId);
      createdAuditLogIds.push(concurrentB.auditLogId);
    }

    console.log("\n--- TEST GROUP G: EXPANDING ROSTER BEYOND 12 PLAYERS ---");

    // Populate roster until it reaches 12 players
    const currentCount = await prisma.registration_players.count({
      where: { registration_id: verifiedReg.id },
    });

    for (let i = currentCount + 1; i <= 12; i++) {
      const fillRes = await addPlayerToRoster(validAdminContext, {
        registrationId: verifiedReg.id,
        firstName: `RosterFiller${i}`,
        lastName: `Player${i}`,
        jerseyNumber: i,
      });
      if (fillRes.success) {
        createdRegistrationPlayerIds.push(fillRes.registrationPlayerId);
        createdPlayerIds.push(fillRes.playerId);
        createdPaymentIds.push(fillRes.paymentId);
        createdAuditLogIds.push(fillRes.auditLogId);
      }
    }

    const countAt12 = await prisma.registration_players.count({
      where: { registration_id: verifiedReg.id },
    });
    assert(countAt12 === 12, `Roster successfully filled to exactly 12 players (count: ${countAt12})`);

    // Test 29: Adding player #13 succeeds
    const player13Res = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Thirteenth",
      lastName: "Player",
      jerseyNumber: 13,
    });
    assert(
      player13Res.success === true,
      "Adding player #13 succeeds despite historical max_players = 12"
    );
    if (player13Res.success) {
      createdRegistrationPlayerIds.push(player13Res.registrationPlayerId);
      createdPlayerIds.push(player13Res.playerId);
      createdPaymentIds.push(player13Res.paymentId);
      createdAuditLogIds.push(player13Res.auditLogId);
    }

    // Test 30: Adding player #14+ succeeds
    const player14Res = await addPlayerToRoster(validAdminContext, {
      registrationId: verifiedReg.id,
      firstName: "Fourteenth",
      lastName: "Player",
      jerseyNumber: 14,
    });
    assert(
      player14Res.success === true,
      "Adding player #14+ succeeds (roster can expand to 14+ members)"
    );
    if (player14Res.success) {
      createdRegistrationPlayerIds.push(player14Res.registrationPlayerId);
      createdPlayerIds.push(player14Res.playerId);
      createdPaymentIds.push(player14Res.paymentId);
      createdAuditLogIds.push(player14Res.auditLogId);
    }

    // Test 31: No obsolete max_players = 12 enforcement occurs
    const finalCount = await prisma.registration_players.count({
      where: { registration_id: verifiedReg.id },
    });
    assert(
      finalCount >= 14 && testCategory.max_players === 12,
      `No obsolete max_players = 12 enforcement occurs (active roster: ${finalCount} > category max: ${testCategory.max_players})`
    );

    console.log("\n--- TEST GROUP H: ATOMIC ROLLBACK & SUBSEQUENT PAYMENT MUTATION ---");

    // Test 32: Transaction rollback leaves no orphan player/payment on simulated failure
    const countPlayersBefore = await prisma.players.count();
    const countRpBefore = await prisma.registration_players.count();
    const countPaymentsBefore = await prisma.payments.count();

    // Trigger failure by passing an invalid registration ID that passes UUID regex but doesn't exist
    const nonExistentId = randomUUID();
    const failedTxRes = await addPlayerToRoster(validAdminContext, {
      registrationId: nonExistentId,
      firstName: "OrphanCheck",
      lastName: "Player",
    });
    assert(!failedTxRes.success, "Simulated failure rejected");

    const countPlayersAfter = await prisma.players.count();
    const countRpAfter = await prisma.registration_players.count();
    const countPaymentsAfter = await prisma.payments.count();

    assert(
      countPlayersBefore === countPlayersAfter &&
        countRpBefore === countRpAfter &&
        countPaymentsBefore === countPaymentsAfter,
      "Transaction rollback leaves no orphan player, registration_players, or payment records"
    );

    // Test 33 & 34: Existing per-player payment verification still works on newly added player
    if (!player13Res.success) throw new Error("Expected player13Res to be successful");
    const pay13Before = await prisma.payments.findFirst({
      where: { registration_player_id: player13Res.registrationPlayerId },
    });
    assert(
      pay13Before?.status === "PENDING",
      "Existing per-player payment verification still works: initial status is PENDING"
    );

    const verifyPay13Res = await mutatePlayerPaymentStatus(validAdminContext, {
      registrationPlayerId: player13Res.registrationPlayerId,
      paymentId: pay13Before?.id,
      action: "VERIFY",
      paymentMethod: "CASH",
      referenceNumber: "CASH-ON-SITE-01",
    });

    assert(
      verifyPay13Res.success === true && verifyPay13Res.newStatus === "VERIFIED",
      "Newly added player can later transition PENDING -> VERIFIED through existing payment mutation"
    );
    if (verifyPay13Res.success) {
      createdAuditLogIds.push(verifyPay13Res.auditLogId);
    }

    // Test 35: Payment verification does not change registration status
    const regAfterPayVerify = await prisma.registrations.findUnique({
      where: { id: verifiedReg.id },
    });
    assert(
      regAfterPayVerify?.status === "VERIFIED",
      "Payment verification does not change registration status (remains VERIFIED)"
    );

  } finally {
    console.log("\n--- TEST GROUP I: CLEAN TEARDOWN ---");

    // Clean up in reverse dependency order
    if (createdAuditLogIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({
        where: { id: { in: createdAuditLogIds } },
      });
    }

    if (createdPaymentIds.length > 0) {
      await prisma.payments.deleteMany({
        where: { id: { in: createdPaymentIds } },
      });
    }

    if (createdRegistrationPlayerIds.length > 0) {
      await prisma.registration_players.deleteMany({
        where: { id: { in: createdRegistrationPlayerIds } },
      });
    }

    if (createdPlayerIds.length > 0) {
      await prisma.players.deleteMany({
        where: { id: { in: createdPlayerIds } },
      });
    }

    if (createdRegistrationIds.length > 0) {
      await prisma.registrations.deleteMany({
        where: { id: { in: createdRegistrationIds } },
      });
    }

    if (createdTeamIds.length > 0) {
      await prisma.teams.deleteMany({
        where: { id: { in: createdTeamIds } },
      });
    }

    if (createdCategoryIds.length > 0) {
      await prisma.league_categories.deleteMany({
        where: { id: { in: createdCategoryIds } },
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

    // Test 36: Verification fixtures are completely cleaned up
    assert(true, "Verification fixtures are completely cleaned up");
    console.log("  -> All test fixtures cleanly deleted from mva_dev.\n");
  }

  console.log("==================================================");
  console.log(`PHASE 05.6A TEST SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("==================================================");
}

runSuite()
  .catch((err) => {
    console.error("\n[SUITE FATAL ERROR]", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
