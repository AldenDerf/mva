import { prisma } from "../lib/prisma";
import pg from "pg";
import assert from "assert";
import {
  evaluateRosterMemberDeletionEligibility,
  evaluateRegistrationDeletionEligibility,
  executeUnverifiedRosterMemberHardDelete,
  executeRosterMemberSoftRemoval,
} from "../lib/admin/roster-safety";
import { AdminContext } from "../lib/auth/admin";

if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

async function run() {
  console.log("================================================================================");
  console.log("  PHASE 05.7D.3 — ROSTER SAFETY FOUNDATION & DELETION POLICIES VERIFICATION");
  console.log("================================================================================\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is missing");
  }

  // -------------------------------------------------------------------------
  // TEST 1: SAFETY PROBE
  // -------------------------------------------------------------------------
  console.log("[TEST 1] Running Safety Probe...");
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
  console.log("  PASS: Safety probe passed (local mva_dev database verified)\n");

  // Track created entities for deterministic cleanup
  const cleanup = {
    profileId: "",
    leagueId: "",
    categoryId1: "",
    categoryId2: "",
    teamId1: "",
    teamId2: "",
    registrationId1: "",
    registrationId2: "",
    registrationPlayerIds: [] as string[],
    playerIds: [] as string[],
    paymentIds: [] as string[],
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 2: POSTGRES FOREIGN KEY INVARIANT (confdeltype = 'r')
    // -------------------------------------------------------------------------
    console.log("[TEST 2] Verifying Postgres Foreign Key constraint on payments...");
    const constraintRes = await pgClient.query(`
      SELECT conname, confdeltype 
      FROM pg_constraint 
      WHERE conname = 'fk_payments_registration_player';
    `);
    assert(constraintRes.rows.length === 1, "Constraint fk_payments_registration_player must exist");
    const confdeltype = constraintRes.rows[0].confdeltype;
    console.log(`  - fk_payments_registration_player confdeltype: '${confdeltype}'`);
    assert(
      confdeltype === "r",
      `Expected confdeltype = 'r' (RESTRICT), got '${confdeltype}'. Generic cascade must NOT exist!`
    );
    console.log("  PASS: Foreign key constraint is strictly RESTRICT (confdeltype = 'r')\n");

    // -------------------------------------------------------------------------
    // SETUP TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log("[SETUP] Provisioning test entities in local mva_dev...");
    const uniqueSuffix = Date.now().toString().slice(-6);

    // 1. Admin Profile
    const adminAuthUserId = `00000000-0000-0000-0000-057d3${uniqueSuffix.slice(0, 7)}`.padEnd(36, "0");
    const profile = await prisma.profiles.create({
      data: {
        auth_user_id: adminAuthUserId,
        email: `admin-057d3-${uniqueSuffix}@mva.test`,
        display_name: "Phase 05.7D.3 Test Admin",
        admin_access: {
          create: {
            role: "ADMIN",
            is_active: true,
          },
        },
      },
    });
    cleanup.profileId = profile.id;

    const adminContext: AdminContext = {
      authUserId: adminAuthUserId,
      profileId: profile.id,
      email: profile.email ?? "admin@mva.test",
      displayName: profile.display_name ?? "Admin",
      role: "ADMIN",
    };

    // 2. League & Categories
    const league = await prisma.leagues.create({
      data: {
        name: `MVA Test Safety League ${uniqueSuffix}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    cleanup.leagueId = league.id;

    const cat1 = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Men's Open ${uniqueSuffix}`,
        registration_fee: 300.0,
        min_players: 6,
        max_players: 14,
      },
    });
    cleanup.categoryId1 = cat1.id;

    const cat2 = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Mahatao Only ${uniqueSuffix}`,
        registration_fee: 300.0,
        min_players: 6,
        max_players: 14,
      },
    });
    cleanup.categoryId2 = cat2.id;

    // 3. Teams
    const team1 = await prisma.teams.create({
      data: {
        team_name: `Safety Thunder ${uniqueSuffix}`,
        slug: `safety-thunder-${uniqueSuffix}`,
      },
    });
    cleanup.teamId1 = team1.id;

    // 4. Registrations
    const reg1 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: cat1.id,
        team_id: team1.id,
        registrant_first_name: "Maria",
        registrant_last_name: "Gomez",
        registrant_contact: "09171112222",
        status: "VERIFIED",
        registration_code: `MVA-SAFE-${uniqueSuffix}`,
      },
    });
    cleanup.registrationId1 = reg1.id;

    // 5. Players & Roster entries
    // Player A: Paid / Verified Roster Member
    const playerA = await prisma.players.create({
      data: {
        first_name: "Juan",
        last_name: "Dela Cruz",
      },
    });
    cleanup.playerIds.push(playerA.id);

    const rpA = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: playerA.id,
        jersey_number: 7,
        position: "Setter",
        is_captain: true,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpA.id);

    const payVerified = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rpA.id,
        payment_method: "GCASH",
        amount: 300.0,
        status: "VERIFIED",
        verified_at: new Date(),
        verified_by_profile_id: profile.id,
        reference_number: `VER-${uniqueSuffix}`,
      },
    });
    cleanup.paymentIds.push(payVerified.id);

    // Player B: Unverified / Unpaid Roster Member with PENDING payment placeholder
    const playerB = await prisma.players.create({
      data: {
        first_name: "Pedro",
        last_name: "Santos",
      },
    });
    cleanup.playerIds.push(playerB.id);

    const rpB = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: playerB.id,
        jersey_number: 10,
        position: "Outside Hitter",
        is_captain: false,
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpB.id);

    const payPending = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rpB.id,
        payment_method: "OTHER",
        amount: 300.0,
        status: "PENDING",
        notes: "Player registration fee assessment",
      },
    });
    cleanup.paymentIds.push(payPending.id);

    console.log("  Setup complete.\n");

    // -------------------------------------------------------------------------
    // TEST 3: DB LEVEL CASCADE BLOCKED (ON DELETE RESTRICT)
    // -------------------------------------------------------------------------
    console.log("[TEST 3] Testing DB level rejection of direct DELETE on paid roster player...");
    let directDeleteError: { code?: string; message?: string } | null = null;
    try {
      await pgClient.query("DELETE FROM registration_players WHERE id = $1;", [rpA.id]);
    } catch (err: unknown) {
      directDeleteError = err as { code?: string; message?: string };
    }

    assert(directDeleteError !== null, "Direct deletion of paid roster member MUST be rejected by Postgres");
    assert(
      directDeleteError.code === "23001" || directDeleteError.code === "23503",
      `Expected Postgres error code 23001 (restrict_violation) or 23503 (foreign_key_violation), got ${directDeleteError.code}`
    );
    assert(
      Boolean(directDeleteError.message && directDeleteError.message.includes("fk_payments_registration_player")),
      "Error must reference fk_payments_registration_player constraint"
    );
    console.log("  PASS: Direct SQL DELETE strictly rejected by Postgres constraint fk_payments_registration_player\n");

    // -------------------------------------------------------------------------
    // TEST 4: VERIFIED PAYMENT PRESERVATION INVARIANT
    // -------------------------------------------------------------------------
    console.log("[TEST 4] Verifying that verified payment and roster anchor are 100% intact...");
    const verifiedPaymentAfter = await prisma.payments.findUnique({
      where: { id: payVerified.id },
    });
    assert(verifiedPaymentAfter !== null, "Verified payment record must still exist");
    assert(verifiedPaymentAfter.status === "VERIFIED", "Payment status must remain VERIFIED");
    assert(
      verifiedPaymentAfter.registration_player_id === rpA.id,
      "Payment anchor to registration_players must be intact"
    );
    console.log("  PASS: Verified payment was NOT lost or modified\n");

    // -------------------------------------------------------------------------
    // TEST 5: POLICY EVALUATION FOR VERIFIED ROSTER MEMBER
    // -------------------------------------------------------------------------
    console.log("[TEST 5] Testing evaluateRosterMemberDeletionEligibility on VERIFIED player...");
    const evalA = await evaluateRosterMemberDeletionEligibility(rpA.id);
    assert(evalA.eligible === false, "Verified player must NOT be eligible for deletion");
    assert(
      evalA.policy === "BLOCKED_VERIFIED_PAYMENT",
      `Expected policy 'BLOCKED_VERIFIED_PAYMENT', got '${evalA.policy}'`
    );
    assert(evalA.verifiedPaymentCount === 1, "Must report 1 verified payment");
    console.log(`  - Reason: "${evalA.reason}"`);
    console.log("  PASS: Verified roster member correctly BLOCKED from hard deletion\n");

    // -------------------------------------------------------------------------
    // TEST 6: POLICY EVALUATION FOR UNVERIFIED ROSTER MEMBER
    // -------------------------------------------------------------------------
    console.log("[TEST 6] Testing evaluateRosterMemberDeletionEligibility on UNVERIFIED player...");
    const evalB = await evaluateRosterMemberDeletionEligibility(rpB.id);
    assert(evalB.eligible === true, "Unverified player must be eligible for deletion");
    assert(
      evalB.policy === "UNVERIFIED_HARD_DELETE_ALLOWED",
      `Expected policy 'UNVERIFIED_HARD_DELETE_ALLOWED', got '${evalB.policy}'`
    );
    assert(evalB.verifiedPaymentCount === 0, "Must report 0 verified payments");
    assert(evalB.pendingPaymentCount === 1, "Must detect 1 pending payment placeholder");
    assert(evalB.pendingPaymentIds.includes(payPending.id), "Pending payment ID must be detected");
    console.log(`  - Reason: "${evalB.reason}"`);
    console.log("  PASS: Unverified roster member correctly approved for guarded hard deletion\n");

    // -------------------------------------------------------------------------
    // TEST 7: SAFE ATOMIC HARD DELETION OF UNVERIFIED ROSTER MEMBER
    // -------------------------------------------------------------------------
    console.log("[TEST 7] Executing guarded hard deletion of unverified player B...");
    const delResult = await executeUnverifiedRosterMemberHardDelete(adminContext, {
      registrationPlayerId: rpB.id,
      registrationId: reg1.id,
    });

    assert(delResult.success === true, `Deletion should succeed: ${delResult.error} - ${delResult.message}`);
    assert(delResult.deletedRegistrationPlayerId === rpB.id);
    assert(delResult.purgedPendingPaymentIds?.includes(payPending.id));

    // Verify DB state:
    // a. registration_players row deleted
    const checkRpB = await prisma.registration_players.findUnique({
      where: { id: rpB.id },
    });
    assert(checkRpB === null, "registration_players row must be deleted");

    // b. pending payment placeholder deleted
    const checkPayPending = await prisma.payments.findUnique({
      where: { id: payPending.id },
    });
    assert(checkPayPending === null, "Pending payment placeholder must be deleted");

    // c. Global player record in players table MUST BE PRESERVED (Section E)
    const checkPlayerB = await prisma.players.findUnique({
      where: { id: playerB.id },
    });
    assert(checkPlayerB !== null, "CRITICAL: Global players record must be PRESERVED after roster membership deletion");
    console.log("  - Global player record preserved:", checkPlayerB.id, `${checkPlayerB.first_name} ${checkPlayerB.last_name}`);

    // d. Audit log recorded
    assert(delResult.auditLogId, "Audit log ID must be returned");
    const auditLog = await prisma.admin_audit_logs.findUnique({
      where: { id: delResult.auditLogId },
    });
    assert(auditLog !== null, "Audit log record must exist in DB");
    assert(auditLog.action === "ROSTER_MEMBER_DELETED");
    const auditMeta = (auditLog.metadata ?? {}) as Record<string, unknown>;
    assert(auditMeta.registration_id === reg1.id, "Audit log must contain registration_id");
    assert(auditMeta.global_player_preserved === true, "Audit log must record global player preservation");
    console.log("  PASS: Atomic unverified deletion completed safely with audit trail and global player preserved\n");

    // -------------------------------------------------------------------------
    // TEST 8: ATTEMPT HARD DELETE ON VERIFIED PLAYER MUST THROW
    // -------------------------------------------------------------------------
    console.log("[TEST 8] Verifying executeUnverifiedRosterMemberHardDelete rejects VERIFIED player...");
    let caughtError: Error | null = null;
    try {
      await executeUnverifiedRosterMemberHardDelete(adminContext, {
        registrationPlayerId: rpA.id,
        registrationId: reg1.id,
      });
    } catch (err: unknown) {
      caughtError = err as Error;
    }
    assert(caughtError !== null, "executeUnverifiedRosterMemberHardDelete must throw on verified player");
    assert(
      Boolean(caughtError.message && caughtError.message.includes("CRITICAL_FINANCIAL_INVARIANT_VIOLATION")),
      "Error must state financial invariant violation"
    );
    console.log("  PASS: Hard delete function strictly refuses to delete player with verified payment\n");

    // -------------------------------------------------------------------------
    // TEST 9: ROSTER STATUS LIFECYCLE (SOFT REMOVAL OF VERIFIED PLAYER)
    // -------------------------------------------------------------------------
    console.log("[TEST 9] Executing soft removal (ACTIVE -> REMOVED) for verified player A...");
    const removeResult = await executeRosterMemberSoftRemoval(adminContext, {
      registrationPlayerId: rpA.id,
      registrationId: reg1.id,
      reason: "Medical injury before match",
    });

    assert(removeResult.success === true, "Soft removal must succeed");
    assert(removeResult.newStatus === "REMOVED");

    const rpAAfterRemoval = await prisma.registration_players.findUniqueOrThrow({
      where: { id: rpA.id },
    });
    assert(rpAAfterRemoval.status === "REMOVED", "Status must be REMOVED");
    assert(rpAAfterRemoval.removed_at !== null, "removed_at must be populated");
    assert(rpAAfterRemoval.removed_by_profile_id === profile.id, "removed_by_profile_id must be admin profile ID");
    assert(rpAAfterRemoval.is_captain === false, "Captaincy must be relinquished on removal");

    // Verified payment remains intact and attached
    const payVerifiedAfterSoft = await prisma.payments.findUniqueOrThrow({
      where: { id: payVerified.id },
    });
    assert(payVerifiedAfterSoft.status === "VERIFIED", "Payment must remain VERIFIED");
    assert(payVerifiedAfterSoft.registration_player_id === rpA.id, "Payment anchor intact");
    console.log("  PASS: Verified player safely transitioned to REMOVED with financial history intact\n");

    // -------------------------------------------------------------------------
    // TEST 10: REGISTRATION DELETION ELIGIBILITY (CANCELLED ONLY)
    // -------------------------------------------------------------------------
    console.log("[TEST 10] Testing evaluateRegistrationDeletionEligibility (CANCELLED only policy)...");
    // Reg 1 is VERIFIED: must be blocked
    const evalReg1 = await evaluateRegistrationDeletionEligibility(reg1.id);
    assert(evalReg1.eligible === false, "VERIFIED registration must NOT be eligible for deletion");
    assert(
      evalReg1.policy === "BLOCKED_NOT_CANCELLED",
      `Expected 'BLOCKED_NOT_CANCELLED', got '${evalReg1.policy}'`
    );
    console.log(`  - Non-cancelled registration evaluation: "${evalReg1.reason}"`);

    // Create a CANCELLED registration
    const team2 = await prisma.teams.create({
      data: {
        team_name: `Cancelled Team ${uniqueSuffix}`,
        slug: `cancelled-team-${uniqueSuffix}`,
      },
    });
    cleanup.teamId2 = team2.id;

    const regCancelled = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: cat2.id,
        team_id: team2.id,
        registrant_first_name: "Test",
        registrant_last_name: "Registrant",
        registrant_contact: "09170009999",
        status: "CANCELLED",
        registration_code: `MVA-CANC-${uniqueSuffix}`,
      },
    });
    cleanup.registrationId2 = regCancelled.id;

    const evalRegCancelled = await evaluateRegistrationDeletionEligibility(regCancelled.id);
    assert(evalRegCancelled.eligible === true, "CANCELLED registration may be eligible for deletion");
    assert(
      evalRegCancelled.policy === "CANCELLED_DELETE_ALLOWED",
      `Expected 'CANCELLED_DELETE_ALLOWED', got '${evalRegCancelled.policy}'`
    );
    console.log(`  - Cancelled registration evaluation: "${evalRegCancelled.reason}"`);
    console.log("  PASS: Team / Registration deletion policy strictly enforces CANCELLED requirement\n");

    // -------------------------------------------------------------------------
    // TEST 11: PUBLIC TEAM PROFILE QUERY EXCLUDES REMOVED PLAYERS
    // -------------------------------------------------------------------------
    console.log("[TEST 11] Verifying roster query semantics (excludes REMOVED players)...");
    // Add an active player C to team1
    const playerC = await prisma.players.create({
      data: { first_name: "Carlos", last_name: "Reyes" },
    });
    cleanup.playerIds.push(playerC.id);

    const rpC = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: playerC.id,
        jersey_number: 12,
        position: "Libero",
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpC.id);

    // Query team1 roster using the public query filter: where: { status: "ACTIVE" }
    const teamWithActiveRoster = await prisma.teams.findUniqueOrThrow({
      where: { id: team1.id },
      include: {
        registrations: {
          where: { id: reg1.id },
          include: {
            registration_players: {
              where: { status: "ACTIVE" },
            },
            _count: {
              select: {
                registration_players: {
                  where: { status: "ACTIVE" },
                },
              },
            },
          },
        },
      },
    });

    const activeRoster = teamWithActiveRoster.registrations[0].registration_players;
    const activeCount = teamWithActiveRoster.registrations[0]._count.registration_players;

    console.log(`  - Total active players returned: ${activeRoster.length} (count: ${activeCount})`);
    assert(activeRoster.length === 1, `Expected 1 active player, got ${activeRoster.length}`);
    assert(activeCount === 1, `Expected active count 1, got ${activeCount}`);
    assert(activeRoster[0].id === rpC.id, "Active roster must contain active player C");
    const containsRemoved = activeRoster.some((p) => p.id === rpA.id);
    assert(!containsRemoved, "CRITICAL: REMOVED player A must NOT appear in active roster queries");
    console.log("  PASS: Active roster query semantics correctly filter out REMOVED players\n");

    // -------------------------------------------------------------------------
    // TEST 12: MULTI-DIVISION PARTICIPATION SAFETY
    // -------------------------------------------------------------------------
    console.log("[TEST 12] Verifying multi-division participation invariant...");
    // Player A (Juan) can have another active roster entry in a different category or league
    const reg3 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: cat2.id, // Mahatao Only category
        team_id: team1.id,
        registrant_first_name: "Maria",
        registrant_last_name: "Gomez",
        registrant_contact: "09171112222",
        status: "VERIFIED",
        registration_code: `MVA-CAT2-${uniqueSuffix}`,
      },
    });
    cleanup.registrationPlayerIds.push(
      (
        await prisma.registration_players.create({
          data: {
            registration_id: reg3.id,
            player_id: playerA.id,
            jersey_number: 7,
            position: "Setter",
            status: "ACTIVE",
          },
        })
      ).id
    );
    // Cleanup reg3
    await prisma.registration_players.deleteMany({ where: { registration_id: reg3.id } });
    await prisma.registrations.delete({ where: { id: reg3.id } });
    console.log("  PASS: Multi-division roster participation permitted without artificial 1-to-1 restriction\n");

    console.log("================================================================================");
    console.log("  ALL 12 PHASE 05.7D.3 SAFETY INVARIANT TESTS PASSED!");
    console.log("================================================================================\n");
  } finally {
    // Deterministic Cleanup
    console.log("[CLEANUP] Cleaning up test fixtures from local mva_dev...");
    try {
      if (cleanup.profileId) {
        await prisma.admin_audit_logs.deleteMany({ where: { admin_profile_id: cleanup.profileId } });
      }
      if (cleanup.paymentIds.length > 0) {
        await prisma.payments.deleteMany({ where: { id: { in: cleanup.paymentIds } } });
      }
      if (cleanup.registrationPlayerIds.length > 0) {
        await prisma.registration_players.deleteMany({ where: { id: { in: cleanup.registrationPlayerIds } } });
      }
      if (cleanup.registrationId1) {
        await prisma.registrations.deleteMany({ where: { id: cleanup.registrationId1 } });
      }
      if (cleanup.registrationId2) {
        await prisma.registrations.deleteMany({ where: { id: cleanup.registrationId2 } });
      }
      if (cleanup.teamId1) {
        await prisma.teams.deleteMany({ where: { id: cleanup.teamId1 } });
      }
      if (cleanup.teamId2) {
        await prisma.teams.deleteMany({ where: { id: cleanup.teamId2 } });
      }
      if (cleanup.categoryId1) {
        await prisma.league_categories.deleteMany({ where: { id: cleanup.categoryId1 } });
      }
      if (cleanup.categoryId2) {
        await prisma.league_categories.deleteMany({ where: { id: cleanup.categoryId2 } });
      }
      if (cleanup.leagueId) {
        await prisma.leagues.deleteMany({ where: { id: cleanup.leagueId } });
      }
      if (cleanup.playerIds.length > 0) {
        await prisma.players.deleteMany({ where: { id: { in: cleanup.playerIds } } });
      }
      if (cleanup.profileId) {
        await prisma.admin_access.deleteMany({ where: { profile_id: cleanup.profileId } });
        await prisma.profiles.deleteMany({ where: { id: cleanup.profileId } });
      }
      console.log("  Cleanup finished cleanly.");
    } catch (cleanupErr) {
      console.error("  Warning during cleanup:", cleanupErr);
    }
    await pgClient.end();
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error("Verification FAILED:", err);
  process.exit(1);
});
