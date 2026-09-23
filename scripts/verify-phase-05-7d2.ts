import pg from "pg";
import { randomUUID } from "crypto";
import { prisma } from "../lib/prisma";
import { AdminContext } from "../lib/auth/admin";
import { correctPlayerAndRosterDetails } from "../lib/admin/player-corrections";
import { correctTeamName } from "../lib/admin/team-corrections";
import { calculateRegistrationAccounting } from "../lib/admin/accounting";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  [PASS] ${message}`);
}

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

async function run() {
  console.log("===============================================================");
  console.log("PHASE 05.7D.2: SAFE METADATA CORRECTIONS VERIFICATION SUITE");
  console.log("===============================================================\n");

  const connStr = process.env.DATABASE_URL;
  if (!connStr) {
    throw new Error("DATABASE_URL is not defined in environment");
  }

  // 1. Safety Probe
  await verifySafetyProbe(connStr);

  const cleanup = {
    profileId: "",
    adminAccessId: "",
    leagueId: "",
    categoryId: "",
    team1Id: "",
    team2Id: "",
    reg1Id: "",
    reg2Id: "",
    playerIds: [] as string[],
    registrationPlayerIds: [] as string[],
    paymentIds: [] as string[],
    auditLogIds: [] as string[],
  };

  try {
    console.log("--- SETUP: CREATING ISOLATED TEST FIXTURES ---");

    // Admin profile
    const authId = randomUUID();
    const adminProfile = await prisma.profiles.create({
      data: {
        auth_user_id: authId,
        display_name: "Phase 05.7D2 Admin",
        email: `admin-057d2-${Date.now()}@mva.org`,
      },
    });
    cleanup.profileId = adminProfile.id;

    const adminAccess = await prisma.admin_access.create({
      data: {
        profile_id: adminProfile.id,
        role: "ADMIN",
        is_active: true,
      },
    });
    cleanup.adminAccessId = adminAccess.id;

    const validAdmin: AdminContext = {
      profileId: adminProfile.id,
      authUserId: authId,
      role: "ADMIN",
      displayName: adminProfile.display_name || "Admin",
      email: adminProfile.email || "admin@mva.org",
    };

    const unauthorizedAdmin: AdminContext = {
      profileId: adminProfile.id,
      authUserId: authId,
      role: "USER", // Unauthorized
      displayName: adminProfile.display_name || "User",
      email: adminProfile.email || "user@mva.org",
    };

    // League & Category
    const league = await prisma.leagues.create({
      data: {
        name: `Test League ${Date.now()}`,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    cleanup.leagueId = league.id;

    const category = await prisma.league_categories.create({
      data: {
        league_id: league.id,
        name: "Open Division",
        registration_fee: 300.0,
        min_players: 6,
        max_players: 14,
      },
    });
    cleanup.categoryId = category.id;

    // Team 1
    const originalSlug = `test-team-alpha-${Date.now()}`;
    const originalTeamName = "Alpha Spikers VC";
    const team1 = await prisma.teams.create({
      data: {
        team_name: originalTeamName,
        slug: originalSlug,
      },
    });
    cleanup.team1Id = team1.id;

    // Team 2 (for collision check)
    const team2 = await prisma.teams.create({
      data: {
        team_name: `Beta Blockers VC ${Date.now()}`,
        slug: `beta-blockers-${Date.now()}`,
      },
    });
    cleanup.team2Id = team2.id;

    // Registration 1
    const reg1 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team1.id,
        registrant_first_name: "Team",
        registrant_last_name: "Manager",
        registrant_contact: "09123456789",
        status: "VERIFIED",
        registration_code: `MVA-${Date.now().toString().slice(-6)}`,
      },
    });
    cleanup.reg1Id = reg1.id;

    // Create 3 Players for Team 1
    // Player 1: Initial captain, VERIFIED payment
    const p1 = await prisma.players.create({
      data: {
        first_name: "Juan",
        middle_name: "Santos",
        last_name: "Dela Cruz",
        suffix: "Jr.",
        contact_number: "09111111111",
        date_of_birth: new Date("1995-05-15"),
      },
    });
    cleanup.playerIds.push(p1.id);

    const rp1 = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: p1.id,
        jersey_number: 10,
        position: "Setter",
        is_captain: true,
      },
    });
    cleanup.registrationPlayerIds.push(rp1.id);

    const pay1 = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rp1.id,
        payment_method: "CASH",
        amount: 300.0,
        status: "VERIFIED",
        reference_number: "REF-001",
      },
    });
    cleanup.paymentIds.push(pay1.id);

    // Player 2: Member, PENDING payment
    const p2 = await prisma.players.create({
      data: {
        first_name: "Pedro",
        last_name: "Penduko",
      },
    });
    cleanup.playerIds.push(p2.id);

    const rp2 = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: p2.id,
        jersey_number: 7,
        position: "Outside Hitter",
        is_captain: false,
      },
    });
    cleanup.registrationPlayerIds.push(rp2.id);

    const pay2 = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rp2.id,
        payment_method: "OTHER",
        amount: 300.0,
        status: "PENDING",
      },
    });
    cleanup.paymentIds.push(pay2.id);

    // Player 3: Shared player profile (appears in Team 2 as well)
    const p3 = await prisma.players.create({
      data: {
        first_name: "Maria",
        last_name: "Clara",
      },
    });
    cleanup.playerIds.push(p3.id);

    const rp3 = await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: p3.id,
        jersey_number: 3,
        position: "Libero",
        is_captain: false,
      },
    });
    cleanup.registrationPlayerIds.push(rp3.id);

    const pay3 = await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        registration_player_id: rp3.id,
        payment_method: "OTHER",
        amount: 300.0,
        status: "PENDING",
      },
    });
    cleanup.paymentIds.push(pay3.id);

    // Registration 2 (shares Player 3)
    const reg2 = await prisma.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: team2.id,
        registrant_first_name: "Beta",
        registrant_last_name: "Manager",
        registrant_contact: "09222222222",
        status: "PENDING_PAYMENT",
        registration_code: `MVA-${(Date.now() + 1).toString().slice(-6)}`,
      },
    });
    cleanup.reg2Id = reg2.id;

    const rp3InTeam2 = await prisma.registration_players.create({
      data: {
        registration_id: reg2.id,
        player_id: p3.id,
        jersey_number: 99, // Different jersey on Team 2
        position: "Utility",
        is_captain: false,
      },
    });
    cleanup.registrationPlayerIds.push(rp3InTeam2.id);

    console.log("  [PASS] Isolated test fixtures created successfully.\n");

    // =========================================================================
    // BASELINE ACCOUNTING SNAPSHOT
    // =========================================================================
    const loadReg1Accounting = async () => {
      const reg = await prisma.registrations.findUniqueOrThrow({
        where: { id: reg1.id },
        select: {
          id: true,
          registration_code: true,
          status: true,
          teams: { select: { id: true, team_name: true, slug: true } },
          leagues: { select: { id: true, name: true, status: true } },
          league_categories_registrations_league_category_idToleague_categories: {
            select: { id: true, name: true, registration_fee: true, min_players: true, max_players: true },
          },
          registration_players: {
            select: {
              id: true,
              jersey_number: true,
              position: true,
              is_captain: true,
              players: {
                select: { id: true, first_name: true, middle_name: true, last_name: true, suffix: true },
              },
              payments: {
                select: {
                  id: true,
                  amount: true,
                  status: true,
                  payment_method: true,
                  reference_number: true,
                  verified_at: true,
                  created_at: true,
                },
              },
            },
          },
          payments: {
            where: { registration_player_id: null },
            select: {
              id: true,
              registration_player_id: true,
              amount: true,
              status: true,
              payment_method: true,
              reference_number: true,
              verified_at: true,
              created_at: true,
              notes: true,
            },
          },
        },
      });
      return calculateRegistrationAccounting(reg);
    };

    const initialAccounting = await loadReg1Accounting();
    assert(initialAccounting.rosterCount === 3, "Baseline roster count is 3");
    assert(initialAccounting.expectedAmount === 900.0, "Baseline expected amount is ₱900.00");
    assert(initialAccounting.verifiedPaidAmount === 300.0, "Baseline verified paid amount is ₱300.00");
    assert(initialAccounting.balance === 600.0, "Baseline balance is ₱600.00");
    assert(initialAccounting.paidPlayerCount === 1, "Baseline paid player count is 1");
    assert(initialAccounting.unpaidPlayerCount === 2, "Baseline unpaid player count is 2");

    // =========================================================================
    // TEST 1: UNAUTHORIZED CALLER REJECTION
    // =========================================================================
    console.log("\n--- TEST 1: UNAUTHORIZED CALLER REJECTION ---");
    const unauthPlayerResult = await correctPlayerAndRosterDetails(unauthorizedAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp1.id,
      playerId: p1.id,
      firstName: "Hacked",
      lastName: "Name",
    });
    assert(unauthPlayerResult.success === false, "Unauthorized player correction fails");
    assert(unauthPlayerResult.error === "UNAUTHORIZED", "Returns UNAUTHORIZED error");

    const unauthTeamResult = await correctTeamName(unauthorizedAdmin, {
      teamId: team1.id,
      teamName: "Hacked Team",
    });
    assert(unauthTeamResult.success === false, "Unauthorized team correction fails");
    assert(unauthTeamResult.error === "UNAUTHORIZED", "Returns UNAUTHORIZED error");

    // =========================================================================
    // TEST 2: ADMIN CAN UPDATE SAFE PLAYER PERSONAL FIELDS
    // =========================================================================
    console.log("\n--- TEST 2: SAFE PLAYER PERSONAL FIELD EDIT ---");
    const updatedDob = "1996-08-20";
    const playerEditResult = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp1.id,
      playerId: p1.id,
      firstName: "Juanito",
      middleName: "Santos-Cruz",
      lastName: "Dela Cruz",
      suffix: "III",
      contactNumber: "09998887777",
      dateOfBirth: updatedDob,
    });

    assert(playerEditResult.success === true, "Player personal edit succeeds");
    if (playerEditResult.playerAuditLogId) {
      cleanup.auditLogIds.push(playerEditResult.playerAuditLogId);
    }

    // Verify DB state
    const p1Db = await prisma.players.findUniqueOrThrow({ where: { id: p1.id } });
    assert(p1Db.first_name === "Juanito", "Player first_name updated to Juanito");
    assert(p1Db.middle_name === "Santos-Cruz", "Player middle_name updated");
    assert(p1Db.suffix === "III", "Player suffix updated to III");
    assert(p1Db.contact_number === "09998887777", "Player contact number updated");
    assert(p1Db.date_of_birth?.toISOString().split("T")[0] === "1996-08-20", "Player date_of_birth updated");
    assert(p1Db.id === p1.id, "CRITICAL: players.id is strictly preserved");

    // =========================================================================
    // TEST 3: ADMIN CAN UPDATE ROSTER METADATA & REASSIGN CAPTAIN
    // =========================================================================
    console.log("\n--- TEST 3: ROSTER METADATA & CAPTAIN TRANSFER ---");
    // Promote Player 2 (rp2) to Captain, change jersey to 24 and position to "Opposite Spiker"
    const rosterEditResult = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp2.id,
      playerId: p2.id,
      firstName: "Pedro",
      lastName: "Penduko",
      jerseyNumber: 24,
      position: "Opposite Spiker",
      isCaptain: true,
    });

    assert(rosterEditResult.success === true, "Roster edit succeeds");
    if (rosterEditResult.rosterAuditLogId) {
      cleanup.auditLogIds.push(rosterEditResult.rosterAuditLogId);
    }

    const rp2Db = await prisma.registration_players.findUniqueOrThrow({ where: { id: rp2.id } });
    assert(rp2Db.jersey_number === 24, "Player 2 jersey number updated to 24");
    assert(rp2Db.position === "Opposite Spiker", "Player 2 position updated to Opposite Spiker");
    assert(rp2Db.is_captain === true, "Player 2 promoted to captain");
    assert(rp2Db.id === rp2.id, "CRITICAL: registration_players.id is strictly preserved");

    // Verify atomic captain unassignment on Player 1
    const rp1DbAfter = await prisma.registration_players.findUniqueOrThrow({ where: { id: rp1.id } });
    assert(rp1DbAfter.is_captain === false, "Previous captain (Player 1) atomically unassigned");

    // =========================================================================
    // TEST 4: ADMIN CAN UPDATE TEAM NAME & PRESERVE SLUG
    // =========================================================================
    console.log("\n--- TEST 4: TEAM NAME UPDATE & STRICT SLUG PRESERVATION ---");
    const updatedTeamName = "Alpha Spikers Volleyball Club";
    const teamEditResult = await correctTeamName(validAdmin, {
      teamId: team1.id,
      teamName: updatedTeamName,
      expectedTeamName: originalTeamName,
      registrationId: reg1.id,
    });

    assert(teamEditResult.success === true, "Team name update succeeds");
    cleanup.auditLogIds.push(teamEditResult.auditLogId);

    const team1Db = await prisma.teams.findUniqueOrThrow({ where: { id: team1.id } });
    assert(team1Db.team_name === updatedTeamName, "team_name updated in database");
    assert(team1Db.slug === originalSlug, "CRITICAL: team.slug is 100% PRESERVED, keeping public URLs intact");
    assert(team1Db.id === team1.id, "CRITICAL: team.id is strictly preserved");

    // =========================================================================
    // TEST 5: PAYMENT RECORDS REMAIN UNTOUCHED
    // =========================================================================
    console.log("\n--- TEST 5: PAYMENT RECORDS REMAIN UNTOUCHED ---");
    const paymentsDb = await prisma.payments.findMany({
      where: { registration_id: reg1.id },
      orderBy: { created_at: "asc" },
    });

    assert(paymentsDb.length === 3, "Exact same 3 payment records exist");
    assert(paymentsDb[0].id === pay1.id, "Payment 1 ID unchanged");
    assert(Number(paymentsDb[0].amount) === 300.0, "Payment 1 amount unchanged (₱300.00)");
    assert(paymentsDb[0].status === "VERIFIED", "Payment 1 status unchanged (VERIFIED)");
    assert(paymentsDb[0].reference_number === "REF-001", "Payment 1 reference unchanged");
    assert(paymentsDb[0].registration_player_id === rp1.id, "Payment 1 anchor unchanged");

    assert(paymentsDb[1].id === pay2.id, "Payment 2 ID unchanged");
    assert(Number(paymentsDb[1].amount) === 300.0, "Payment 2 amount unchanged (₱300.00)");
    assert(paymentsDb[1].status === "PENDING", "Payment 2 status unchanged (PENDING)");

    // =========================================================================
    // TEST 6: ACCOUNTING TOTALS INVARIANT PROOF
    // =========================================================================
    console.log("\n--- TEST 6: ACCOUNTING INVARIANT PROOF ---");
    const postEditAccounting = await loadReg1Accounting();
    assert(postEditAccounting.rosterCount === initialAccounting.rosterCount, "rosterCount identical (3)");
    assert(postEditAccounting.expectedAmount === initialAccounting.expectedAmount, "expectedAmount identical (₱900.00)");
    assert(postEditAccounting.verifiedPaidAmount === initialAccounting.verifiedPaidAmount, "verifiedPaidAmount identical (₱300.00)");
    assert(postEditAccounting.balance === initialAccounting.balance, "balance identical (₱600.00)");
    assert(postEditAccounting.paidPlayerCount === initialAccounting.paidPlayerCount, "paidPlayerCount identical (1)");
    assert(postEditAccounting.unpaidPlayerCount === initialAccounting.unpaidPlayerCount, "unpaidPlayerCount identical (2)");
    assert(postEditAccounting.paymentCompletionStatus === initialAccounting.paymentCompletionStatus, "paymentCompletionStatus identical (INCOMPLETE)");
    console.log("  [PASS] Mathematical accounting invariant holds: zero financial shift after metadata edits.");

    // =========================================================================
    // TEST 7: AUDIT LOGS STRUCTURE & BEFORE/AFTER SNAPSHOTS
    // =========================================================================
    console.log("\n--- TEST 7: AUDIT LOG VERIFICATION ---");
    const auditLogs = await prisma.admin_audit_logs.findMany({
      where: { id: { in: cleanup.auditLogIds } },
    });

    const playerLog = auditLogs.find((l) => l.action === "PLAYER_PROFILE_UPDATED");
    assert(Boolean(playerLog), "PLAYER_PROFILE_UPDATED audit log created");
    const playerMeta = playerLog!.metadata as Record<string, unknown>;
    assert(playerMeta.registration_id === reg1.id, "Audit metadata includes registration_id");
    assert((playerMeta.before as Record<string, unknown>).first_name === "Juan", "Records 'before' first_name");
    assert((playerMeta.after as Record<string, unknown>).first_name === "Juanito", "Records 'after' first_name");

    const rosterLog = auditLogs.find((l) => l.action === "ROSTER_MEMBER_UPDATED");
    assert(Boolean(rosterLog), "ROSTER_MEMBER_UPDATED audit log created");
    const rosterMeta = rosterLog!.metadata as Record<string, unknown>;
    assert(rosterMeta.registration_id === reg1.id, "Audit metadata includes registration_id");
    assert((rosterMeta.before as Record<string, unknown>).is_captain === false, "Records 'before' captain false");
    assert((rosterMeta.after as Record<string, unknown>).is_captain === true, "Records 'after' captain true");

    const teamLog = auditLogs.find((l) => l.action === "TEAM_PROFILE_UPDATED");
    assert(Boolean(teamLog), "TEAM_PROFILE_UPDATED audit log created");
    const teamMeta = teamLog!.metadata as Record<string, unknown>;
    assert(teamMeta.registration_id === reg1.id, "Audit metadata includes registration_id");
    assert((teamMeta.before as Record<string, unknown>).team_name === originalTeamName, "Records 'before' team_name");
    assert((teamMeta.after as Record<string, unknown>).team_name === updatedTeamName, "Records 'after' team_name");

    // =========================================================================
    // TEST 8: STALE SUBMISSIONS & DUPLICATE NAME COLLISION
    // =========================================================================
    console.log("\n--- TEST 8: STALE STATE & DUPLICATE NAME COLLISION ---");
    // Attempt to rename Team 1 to Team 2's name
    const team2Record = await prisma.teams.findUniqueOrThrow({ where: { id: team2.id } });
    const duplicateNameResult = await correctTeamName(validAdmin, {
      teamId: team1.id,
      teamName: team2Record.team_name,
    });
    assert(duplicateNameResult.success === false, "Colliding team name rejected");
    assert(duplicateNameResult.error === "DUPLICATE_NAME", "Returns DUPLICATE_NAME error");

    // Stale expected team name
    const staleTeamResult = await correctTeamName(validAdmin, {
      teamId: team1.id,
      teamName: "Another Name",
      expectedTeamName: "Outdated Expected Name",
    });
    assert(staleTeamResult.success === false, "Stale team name submission rejected");
    assert(staleTeamResult.error === "STALE_STATE", "Returns STALE_STATE error");

    // No-op detection
    const noOpTeamResult = await correctTeamName(validAdmin, {
      teamId: team1.id,
      teamName: updatedTeamName,
    });
    assert(noOpTeamResult.success === false, "No-op team name submission detected");
    assert(noOpTeamResult.error === "NO_CHANGE", "Returns NO_CHANGE");

    const noOpPlayerResult = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp1.id,
      playerId: p1.id,
      firstName: "Juanito",
      middleName: "Santos-Cruz",
      lastName: "Dela Cruz",
      suffix: "III",
      contactNumber: "09998887777",
      dateOfBirth: updatedDob,
      jerseyNumber: 10,
      position: "Setter",
      isCaptain: false,
    });
    assert(noOpPlayerResult.success === false, "No-op player submission detected");
    assert(noOpPlayerResult.error === "NO_CHANGE", "Returns NO_CHANGE");

    // =========================================================================
    // TEST 9: NO AUTOMATIC MERGING WHEN PLAYER NAMES MATCH
    // =========================================================================
    console.log("\n--- TEST 9: NO AUTOMATIC MERGING WHEN NAMES MATCH ---");
    // Create another distinct player with name "Juanito Dela Cruz" on a different registration
    const distinctPlayer = await prisma.players.create({
      data: {
        first_name: "Juanito",
        last_name: "Dela Cruz",
      },
    });
    cleanup.playerIds.push(distinctPlayer.id);

    // Editing Player 2 on reg1 to also be named "Juanito Dela Cruz"
    const renamePlayer2Result = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp2.id,
      playerId: p2.id,
      firstName: "Juanito",
      lastName: "Dela Cruz",
    });

    assert(renamePlayer2Result.success === true, "Renaming player to an existing name succeeds");
    if (renamePlayer2Result.playerAuditLogId) {
      cleanup.auditLogIds.push(renamePlayer2Result.playerAuditLogId);
    }

    // Verify Player 1, Player 2, and Distinct Player all have separate unique IDs
    const allJuanitos = await prisma.players.findMany({
      where: { id: { in: [p1.id, p2.id, distinctPlayer.id] } },
    });
    assert(allJuanitos.length === 3, "Three distinct player records preserved in DB");
    assert(new Set(allJuanitos.map((p) => p.id)).size === 3, "CRITICAL: Zero player merging occurred based on matching names");

    // =========================================================================
    // TEST 10: SHARED PLAYER PROFILE BEHAVIOR
    // =========================================================================
    console.log("\n--- TEST 10: SHARED PLAYER PROFILE BEHAVIOR ---");
    // Player 3 is in both reg1 and reg2.
    // Query registration count:
    const p3Count = await prisma.registration_players.count({
      where: { player_id: p3.id },
    });
    assert(p3Count === 2, "Player 3 is verified to participate in 2 registrations");

    // Correct Player 3 personal name to "Maria Clara-Cruz" via Team 1
    const p3EditResult = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp3.id,
      playerId: p3.id,
      firstName: "Maria Clara",
      lastName: "Cruz",
    });
    assert(p3EditResult.success === true, "Shared player personal update succeeds");
    if (p3EditResult.playerAuditLogId) {
      cleanup.auditLogIds.push(p3EditResult.playerAuditLogId);
    }

    // Verify that Team 2's roster record for Player 3 preserved its own jersey and position
    const rp3InTeam2After = await prisma.registration_players.findUniqueOrThrow({
      where: { id: rp3InTeam2.id },
    });
    assert(rp3InTeam2After.jersey_number === 99, "Team 2 roster jersey number untouched (99)");
    assert(rp3InTeam2After.position === "Utility", "Team 2 roster position untouched (Utility)");

    // =========================================================================
    // TEST 11: INVALID INPUT REJECTION
    // =========================================================================
    console.log("\n--- TEST 11: INVALID INPUT REJECTION ---");
    const emptyFirst = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp1.id,
      playerId: p1.id,
      firstName: "   ",
      lastName: "Valid",
    });
    assert(emptyFirst.success === false && emptyFirst.error === "VALIDATION_ERROR", "Empty first name rejected");

    const emptyLast = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp1.id,
      playerId: p1.id,
      firstName: "Valid",
      lastName: "   ",
    });
    assert(emptyLast.success === false && emptyLast.error === "VALIDATION_ERROR", "Empty last name rejected");

    const badJersey = await correctPlayerAndRosterDetails(validAdmin, {
      registrationId: reg1.id,
      registrationPlayerId: rp1.id,
      playerId: p1.id,
      firstName: "Valid",
      lastName: "Valid",
      jerseyNumber: 150, // Exceeds 99
    });
    assert(badJersey.success === false && badJersey.error === "VALIDATION_ERROR", "Jersey > 99 rejected");

    const emptyTeam = await correctTeamName(validAdmin, {
      teamId: team1.id,
      teamName: "   ",
    });
    assert(emptyTeam.success === false && emptyTeam.error === "VALIDATION_ERROR", "Empty team name rejected");

    console.log("\n===============================================================");
    console.log("ALL 11 TEST SUITES PASSED STRICTLY IN mva_dev!");
    console.log("===============================================================\n");
  } finally {
    console.log("--- CLEANING UP EPHEMERAL FIXTURES ---");
    if (cleanup.profileId) {
      await prisma.admin_audit_logs.deleteMany({ where: { admin_profile_id: cleanup.profileId } });
    }
    if (cleanup.auditLogIds.length > 0) {
      await prisma.admin_audit_logs.deleteMany({ where: { id: { in: cleanup.auditLogIds } } });
    }
    if (cleanup.paymentIds.length > 0) {
      await prisma.payments.deleteMany({ where: { id: { in: cleanup.paymentIds } } });
    }
    if (cleanup.registrationPlayerIds.length > 0) {
      await prisma.registration_players.deleteMany({ where: { id: { in: cleanup.registrationPlayerIds } } });
    }
    if (cleanup.reg1Id || cleanup.reg2Id) {
      await prisma.registrations.deleteMany({ where: { id: { in: [cleanup.reg1Id, cleanup.reg2Id].filter(Boolean) } } });
    }
    if (cleanup.playerIds.length > 0) {
      await prisma.players.deleteMany({ where: { id: { in: cleanup.playerIds } } });
    }
    if (cleanup.team1Id || cleanup.team2Id) {
      await prisma.teams.deleteMany({ where: { id: { in: [cleanup.team1Id, cleanup.team2Id].filter(Boolean) } } });
    }
    if (cleanup.categoryId) {
      await prisma.league_categories.deleteMany({ where: { id: cleanup.categoryId } });
    }
    if (cleanup.leagueId) {
      await prisma.leagues.deleteMany({ where: { id: cleanup.leagueId } });
    }
    if (cleanup.adminAccessId) {
      await prisma.admin_access.deleteMany({ where: { id: cleanup.adminAccessId } });
    }
    if (cleanup.profileId) {
      await prisma.profiles.deleteMany({ where: { id: cleanup.profileId } });
    }
    console.log("  [PASS] Ephemeral test fixtures cleanly removed.");
  }
}

run()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Test execution failed:", err);
    process.exit(1);
  });
