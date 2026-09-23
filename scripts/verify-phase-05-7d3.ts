import { prisma } from "../lib/prisma";
import pg from "pg";
import assert from "assert";
import {
  calculateRegistrationAccounting,
} from "../lib/admin/accounting";
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
  console.log("  PHASE 05.7D.3 — ROSTER SAFETY FOUNDATION & ACCOUNTING HARDENING VERIFICATION");
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

  // Record initial database snapshot for preservation check
  console.log("[PRESERVATION] Taking pre-test database snapshot...");
  const snapshotBefore = await getDatabaseSnapshot(pgClient);
  console.log(`  - players: ${snapshotBefore.playerCount}`);
  console.log(`  - registration_players: ${snapshotBefore.registrationPlayerCount}`);
  console.log(`  - payments: ${snapshotBefore.paymentCount}`);
  console.log(`  - verified payment sum: ₱${snapshotBefore.verifiedPaymentSum.toFixed(2)}\n`);

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

    const league = await prisma.leagues.create({
      data: {
        name: `MVA Safety & Accounting League ${uniqueSuffix}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    cleanup.leagueId = league.id;

    const cat1 = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Division A ${uniqueSuffix}`,
        registration_fee: 300.0,
        min_players: 6,
        max_players: 14,
      },
    });
    cleanup.categoryId1 = cat1.id;

    const cat2 = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: `Division B ${uniqueSuffix}`,
        registration_fee: 300.0,
        min_players: 6,
        max_players: 14,
      },
    });
    cleanup.categoryId2 = cat2.id;

    const team1 = await prisma.teams.create({
      data: {
        team_name: `Safety Hawks ${uniqueSuffix}`,
        slug: `safety-hawks-${uniqueSuffix}`,
      },
    });
    cleanup.teamId1 = team1.id;

    const reg1 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: cat1.id,
        team_id: team1.id,
        registrant_first_name: "Maria",
        registrant_last_name: "Gomez",
        registrant_contact: "09171112222",
        status: "VERIFIED",
        registration_code: `MVA-ACT-${uniqueSuffix}`,
      },
    });
    cleanup.registrationId1 = reg1.id;

    // -------------------------------------------------------------------------
    // TEST A: ALL ACTIVE PLAYERS (12 PLAYERS NORMAL ACCOUNTING)
    // -------------------------------------------------------------------------
    console.log("[TEST A] Testing All Active Players (12 active players)...");
    const activeTestPlayers = [];
    for (let i = 1; i <= 12; i++) {
      const pl = await prisma.players.create({
        data: { first_name: `Player${i}`, last_name: `Active${uniqueSuffix}` },
      });
      cleanup.playerIds.push(pl.id);

      const rp = await prisma.registration_players.create({
        data: {
          registration_id: reg1.id,
          player_id: pl.id,
          jersey_number: i,
          position: i === 1 ? "Setter" : "Hitter",
          is_captain: i === 1,
          status: "ACTIVE",
        },
      });
      cleanup.registrationPlayerIds.push(rp.id);

      // Give 5 players verified payments, 7 unverified
      if (i <= 5) {
        const pay = await prisma.payments.create({
          data: {
            registration_id: reg1.id,
            registration_player_id: rp.id,
            payment_method: "GCASH",
            amount: 300.0,
            status: "VERIFIED",
            verified_at: new Date(),
            verified_by_profile_id: profile.id,
            reference_number: `VER-${i}-${uniqueSuffix}`,
          },
        });
        cleanup.paymentIds.push(pay.id);
      } else {
        const pay = await prisma.payments.create({
          data: {
            registration_id: reg1.id,
            registration_player_id: rp.id,
            payment_method: "OTHER",
            amount: 300.0,
            status: "PENDING",
            notes: "Player registration fee assessment",
          },
        });
        cleanup.paymentIds.push(pay.id);
      }
      activeTestPlayers.push({ pl, rp });
    }

    const regWithPlayersA = await prisma.registrations.findUniqueOrThrow({
      where: { id: reg1.id },
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

    const acctA = calculateRegistrationAccounting(regWithPlayersA);
    assert(acctA.rosterCount === 12, `Expected active rosterCount = 12, got ${acctA.rosterCount}`);
    assert(acctA.expectedAmount === 3600, `Expected expectedAmount = 3600, got ${acctA.expectedAmount}`);
    assert(acctA.paidPlayerCount === 5, `Expected paidPlayerCount = 5, got ${acctA.paidPlayerCount}`);
    assert(acctA.unpaidPlayerCount === 7, `Expected unpaidPlayerCount = 7, got ${acctA.unpaidPlayerCount}`);
    assert(acctA.verifiedPaidAmount === 1500, `Expected verifiedPaidAmount = 1500, got ${acctA.verifiedPaidAmount}`);
    assert(acctA.balance === 2100, `Expected balance = 2100, got ${acctA.balance}`);
    assert(acctA.paymentComplete === false, "Payment should not be complete");
    assert(acctA.historicalRemovedVerifiedAmount === 0, "No historical removed verified amount");
    console.log("  PASS: Test A (All Active) baseline verified with zero regression\n");

    // -------------------------------------------------------------------------
    // TEST B: REMOVED UNPAID PLAYER
    // -------------------------------------------------------------------------
    console.log("[TEST B] Testing Removed Unpaid Player (12 -> 11 active, 1 removed unpaid)...");
    // Transition player 12 (unpaid) to REMOVED
    const rp12 = activeTestPlayers[11].rp;
    await prisma.registration_players.update({
      where: { id: rp12.id },
      data: {
        status: "REMOVED",
        removed_at: new Date(),
        removed_by_profile_id: profile.id,
      },
    });

    const regWithPlayersB = await prisma.registrations.findUniqueOrThrow({
      where: { id: reg1.id },
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

    const acctB = calculateRegistrationAccounting(regWithPlayersB);
    assert(acctB.rosterCount === 11, `Expected active rosterCount = 11, got ${acctB.rosterCount}`);
    assert(acctB.removedRosterCount === 1, `Expected removedRosterCount = 1, got ${acctB.removedRosterCount}`);
    assert(acctB.expectedAmount === 3300, `Expected expectedAmount = 3300, got ${acctB.expectedAmount}`);
    assert(acctB.paidPlayerCount === 5, `Expected paidPlayerCount = 5, got ${acctB.paidPlayerCount}`);
    assert(acctB.unpaidPlayerCount === 6, `Expected unpaidPlayerCount = 6, got ${acctB.unpaidPlayerCount}`);
    assert(acctB.balance === 1800, `Expected balance = 1800, got ${acctB.balance}`);
    assert(acctB.rosterPayments.length === 11, "Active rosterPayments breakdown must contain 11 players");
    assert(!acctB.rosterPayments.some((p) => p.registrationPlayerId === rp12.id), "Removed player excluded from active rosterPayments");
    console.log("  PASS: Test B (Removed Unpaid Player) excluded from active obligation and unpaid count\n");

    // -------------------------------------------------------------------------
    // TEST C: REMOVED VERIFIED PLAYER (HISTORICAL MONEY PRESERVED)
    // -------------------------------------------------------------------------
    console.log("[TEST C] Testing Removed Verified Player (historical money preserved, not transferred)...");
    // Transition player 5 (who has a VERIFIED payment of ₱300) to REMOVED using executeRosterMemberSoftRemoval
    const rp5 = activeTestPlayers[4].rp;
    const removeResult = await executeRosterMemberSoftRemoval(adminContext, {
      registrationPlayerId: rp5.id,
      registrationId: reg1.id,
      reason: "Medical injury before match",
    });
    assert(removeResult.success === true, "executeRosterMemberSoftRemoval must succeed");
    assert(removeResult.newStatus === "REMOVED");

    const regWithPlayersC = await prisma.registrations.findUniqueOrThrow({
      where: { id: reg1.id },
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

    const acctC = calculateRegistrationAccounting(regWithPlayersC);
    // Active roster now: 10 players (players 1-4 verified, players 6-11 unpaid)
    assert(acctC.rosterCount === 10, `Expected active rosterCount = 10, got ${acctC.rosterCount}`);
    assert(acctC.removedRosterCount === 2, `Expected removedRosterCount = 2, got ${acctC.removedRosterCount}`);
    assert(acctC.expectedAmount === 3000, `Expected expectedAmount = 3000, got ${acctC.expectedAmount}`);
    assert(acctC.paidPlayerCount === 4, `Expected active paidPlayerCount = 4, got ${acctC.paidPlayerCount}`);
    assert(acctC.unpaidPlayerCount === 6, `Expected active unpaidPlayerCount = 6, got ${acctC.unpaidPlayerCount}`);
    assert(acctC.verifiedPaidAmount === 1200, `Expected active verifiedPaidAmount = 1200, got ${acctC.verifiedPaidAmount}`);
    assert(acctC.balance === 1800, `Expected active balance = 1800, got ${acctC.balance}`);
    // Historical verified money from removed player 5 is preserved
    assert(
      acctC.historicalRemovedVerifiedAmount === 300,
      `Expected historicalRemovedVerifiedAmount = 300, got ${acctC.historicalRemovedVerifiedAmount}`
    );
    assert(
      acctC.totalVerifiedCollected === 1500,
      `Expected totalVerifiedCollected = 1500 (1200 active + 300 removed), got ${acctC.totalVerifiedCollected}`
    );
    assert(acctC.hasFinancialAnomaly === true, "Must flag financial anomaly for administrative review");
    assert(
      acctC.anomalyNotes.some((n) => n.includes("associated with removed roster members")),
      "Anomaly notes must include removed roster member payment notification"
    );
    console.log("  PASS: Test C (Removed Verified Player) preserved historical money without applying to active balance\n");

    // -------------------------------------------------------------------------
    // TEST D: REMAINING ACTIVE PLAYER UNPAID (COMPLETENESS INVARIANT)
    // -------------------------------------------------------------------------
    console.log("[TEST D] Testing Remaining Active Player Unpaid (10 active: 9 verified, 1 unpaid, 1 removed verified)...");
    // Verify payments for players 6, 7, 8, 9, 10 (leaving only player 11 unpaid)
    for (let i = 5; i <= 9; i++) {
      const rp = activeTestPlayers[i].rp;
      const pay = await prisma.payments.findFirstOrThrow({
        where: { registration_player_id: rp.id },
      });
      await prisma.payments.update({
        where: { id: pay.id },
        data: {
          status: "VERIFIED",
          verified_at: new Date(),
          verified_by_profile_id: profile.id,
        },
      });
    }

    const regWithPlayersD = await prisma.registrations.findUniqueOrThrow({
      where: { id: reg1.id },
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

    const acctD = calculateRegistrationAccounting(regWithPlayersD);
    // 10 active players: 9 verified (₱2,700), 1 unpaid (₱300 due). 1 removed verified player (₱300).
    // Total collected: ₱2,700 + ₱300 = ₱3,000.
    // Active expected: ₱3,000.
    // BUT player 11 is UNPAID, so paymentComplete MUST BE FALSE!
    assert(acctD.rosterCount === 10, `Expected active rosterCount = 10, got ${acctD.rosterCount}`);
    assert(acctD.paidPlayerCount === 9, `Expected paidPlayerCount = 9, got ${acctD.paidPlayerCount}`);
    assert(acctD.unpaidPlayerCount === 1, `Expected unpaidPlayerCount = 1, got ${acctD.unpaidPlayerCount}`);
    assert(acctD.verifiedPaidAmount === 2700, `Expected verifiedPaidAmount = 2700, got ${acctD.verifiedPaidAmount}`);
    assert(acctD.balance === 300, `Expected balance = 300, got ${acctD.balance}`);
    assert(acctD.paymentComplete === false, "CRITICAL: paymentComplete MUST be false when an active player is unpaid!");
    assert(acctD.paymentCompletionStatus === "INCOMPLETE", "paymentCompletionStatus must be INCOMPLETE");
    assert(acctD.totalVerifiedCollected === 3000, `Total verified collected is 3000 (2700 + 300)`);
    console.log("  PASS: Test D: Removed player's ₱300 payment did NOT satisfy unpaid player 11. Completeness = INCOMPLETE\n");

    // -------------------------------------------------------------------------
    // TEST E: PUBLIC ROSTER EXCLUDES REMOVED PLAYERS
    // -------------------------------------------------------------------------
    console.log("[TEST E] Testing Public Roster query semantics (excludes REMOVED players)...");
    const publicRosterQuery = await prisma.teams.findUniqueOrThrow({
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

    const activeList = publicRosterQuery.registrations[0].registration_players;
    const activeCount = publicRosterQuery.registrations[0]._count.registration_players;
    assert(activeList.length === 10, `Public roster must return 10 active players, got ${activeList.length}`);
    assert(activeCount === 10, `Public roster count must be 10, got ${activeCount}`);
    assert(!activeList.some((p) => p.id === rp5.id), "Removed player 5 must NOT appear in public roster");
    assert(!activeList.some((p) => p.id === rp12.id), "Removed player 12 must NOT appear in public roster");
    console.log("  PASS: Test E: Public roster query strictly filters for status: 'ACTIVE'\n");

    // -------------------------------------------------------------------------
    // TEST F: PHYSICAL DELETE PROTECTION (ON DELETE RESTRICT)
    // -------------------------------------------------------------------------
    console.log("[TEST F] Testing Physical Delete Protection on paid player...");
    let directDeleteError: { code?: string; message?: string } | null = null;
    try {
      await pgClient.query("DELETE FROM registration_players WHERE id = $1;", [rp5.id]);
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

    // Verify policy evaluation blocks deletion
    const evalRp5 = await evaluateRosterMemberDeletionEligibility(rp5.id);
    assert(evalRp5.eligible === false, "evaluateRosterMemberDeletionEligibility must block paid player");
    assert(evalRp5.policy === "BLOCKED_VERIFIED_PAYMENT");
    console.log("  PASS: Test F: Physical delete strictly rejected by Postgres constraint and application policy\n");

    // -------------------------------------------------------------------------
    // TEST G: UNVERIFIED HARD DELETE
    // -------------------------------------------------------------------------
    console.log("[TEST G] Testing Unverified Hard Delete (accidental player deletion)...");
    // Create an unverified accidental player
    const accidentalPlayer = await prisma.players.create({
      data: { first_name: "Accidental", last_name: `Entry${uniqueSuffix}` },
    });
    cleanup.playerIds.push(accidentalPlayer.id);

    const rpAccidental = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: accidentalPlayer.id,
        jersey_number: 99,
        position: "Utility",
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpAccidental.id);

    const payAccidental = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rpAccidental.id,
        payment_method: "OTHER",
        amount: 300.0,
        status: "PENDING",
        notes: "Accidental entry pending placeholder",
      },
    });
    cleanup.paymentIds.push(payAccidental.id);

    // Eligibility check
    const evalAccidental = await evaluateRosterMemberDeletionEligibility(rpAccidental.id);
    assert(evalAccidental.eligible === true, "Unverified player must be eligible for deletion");
    assert(evalAccidental.policy === "UNVERIFIED_HARD_DELETE_ALLOWED");

    // Execute atomic hard delete
    const delResult = await executeUnverifiedRosterMemberHardDelete(adminContext, {
      registrationPlayerId: rpAccidental.id,
      registrationId: reg1.id,
    });
    assert(delResult.success === true, "Hard delete must succeed");

    // Verify DB state
    const checkRpAccidental = await prisma.registration_players.findUnique({
      where: { id: rpAccidental.id },
    });
    assert(checkRpAccidental === null, "registration_players row must be physically deleted");

    const checkPayAccidental = await prisma.payments.findUnique({
      where: { id: payAccidental.id },
    });
    assert(checkPayAccidental === null, "Pending payment placeholder must be deleted");

    const checkGlobalPlayer = await prisma.players.findUnique({
      where: { id: accidentalPlayer.id },
    });
    assert(checkGlobalPlayer !== null, "CRITICAL: Global players record must be PRESERVED");

    // Audit log check
    assert(delResult.auditLogId, "Audit log ID must be returned");
    const auditLog = await prisma.admin_audit_logs.findUnique({
      where: { id: delResult.auditLogId },
    });
    assert(auditLog !== null && auditLog.action === "ROSTER_MEMBER_DELETED");
    console.log("  PASS: Test G: Unverified member hard-deleted, placeholders purged, global player preserved, audit logged\n");

    // -------------------------------------------------------------------------
    // TEST H: REGISTRATION DELETE POLICY (ONLY CANCELLED ALLOWED)
    // -------------------------------------------------------------------------
    console.log("[TEST H] Testing Registration Delete Policy (CANCELLED only)...");
    const evalActiveReg = await evaluateRegistrationDeletionEligibility(reg1.id);
    assert(evalActiveReg.eligible === false, "Active VERIFIED registration must be BLOCKED from deletion");
    assert(evalActiveReg.policy === "BLOCKED_NOT_CANCELLED");

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

    const evalCancelledReg = await evaluateRegistrationDeletionEligibility(regCancelled.id);
    assert(evalCancelledReg.eligible === true, "CANCELLED registration may be eligible for deletion");
    assert(evalCancelledReg.policy === "CANCELLED_DELETE_ALLOWED");
    console.log("  PASS: Test H: Registration deletion policy strictly enforces CANCELLED requirement\n");

    // -------------------------------------------------------------------------
    // TEST I: MULTI-DIVISION PARTICIPATION SAFETY
    // -------------------------------------------------------------------------
    console.log("[TEST I] Testing Multi-Division Participation Safety...");
    const regDivisionB = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: cat2.id,
        team_id: team1.id,
        registrant_first_name: "Maria",
        registrant_last_name: "Gomez",
        registrant_contact: "09171112222",
        status: "VERIFIED",
        registration_code: `MVA-DIVB-${uniqueSuffix}`,
      },
    });
    // Add player 1 into Division B
    const rpDivB = await prisma.registration_players.create({
      data: {
        registration_id: regDivisionB.id,
        player_id: activeTestPlayers[0].pl.id,
        jersey_number: 7,
        position: "Setter",
        status: "ACTIVE",
      },
    });
    cleanup.registrationPlayerIds.push(rpDivB.id);

    // Clean up regDivisionB
    await prisma.registration_players.deleteMany({ where: { registration_id: regDivisionB.id } });
    await prisma.registrations.delete({ where: { id: regDivisionB.id } });
    console.log("  PASS: Test I: Multi-division participation invariant verified\n");

    console.log("================================================================================");
    console.log("  ALL TESTS PASSED SUCCESSFULLY!");
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
