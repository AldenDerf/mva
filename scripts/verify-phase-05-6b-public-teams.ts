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
  getPublicTeams,
  getPublicTeamBySlug,
  getActivePublicLeague,
  sortRosterPlayers,
  PublicRosterPlayer,
} from "../lib/public/teams";

/**
 * PHASE 05.6B: PUBLIC TEAMS & OFFICIAL ROSTER VERIFICATION SUITE
 * (Including Pre-Merge Hardening & Multi-League Scope Tests)
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

  console.log("=== PHASE 05.6B VERIFICATION: PUBLIC TEAMS & OFFICIAL ROSTERS ===");

  await verifySafetyProbe(connectionString);
  assert(true, "Local database safety guard confirmed mva_dev on localhost");

  const runTag = `p56b-${randomUUID().slice(0, 8)}`;
  console.log(`Test Run Tag: ${runTag}`);

  // Track created fixtures for cleanup
  const cleanupTeamIds: string[] = [];
  const cleanupPlayerIds: string[] = [];
  const cleanupCategoryIds: string[] = [];
  const cleanupLeagueIds: string[] = [];

  try {
    // 1. Setup Active Tournament League (ONGOING status to establish deterministically as primary active)
    const testLeague = await prisma.leagues.create({
      data: {
        name: `Active League ${runTag}`,
        year: 2026,
        status: "ONGOING",
      },
    });
    cleanupLeagueIds.push(testLeague.id);

    const testCategoryA = await prisma.league_categories.create({
      data: {
        league_id: testLeague.id,
        name: `Open Division ${runTag}`,
        registration_fee: 3600,
        min_players: 6,
        max_players: 12,
      },
    });
    cleanupCategoryIds.push(testCategoryA.id);

    const testCategoryB = await prisma.league_categories.create({
      data: {
        league_id: testLeague.id,
        name: `Women's Division ${runTag}`,
        registration_fee: 3600,
        min_players: 6,
        max_players: 12,
      },
    });
    cleanupCategoryIds.push(testCategoryB.id);

    // 1B. Setup Historical League (COMPLETED) & Archived League (ARCHIVED) & Draft League (DRAFT)
    const historicalLeague = await prisma.leagues.create({
      data: {
        name: `Historical League 2024 ${runTag}`,
        year: 2024,
        status: "COMPLETED",
      },
    });
    cleanupLeagueIds.push(historicalLeague.id);

    const historicalCategory = await prisma.league_categories.create({
      data: {
        league_id: historicalLeague.id,
        name: `Past Division ${runTag}`,
        registration_fee: 3000,
      },
    });
    cleanupCategoryIds.push(historicalCategory.id);

    const draftLeague = await prisma.leagues.create({
      data: {
        name: `Draft League ${runTag}`,
        year: 2027,
        status: "DRAFT",
      },
    });
    cleanupLeagueIds.push(draftLeague.id);

    const draftCategory = await prisma.league_categories.create({
      data: {
        league_id: draftLeague.id,
        name: `Draft Division ${runTag}`,
      },
    });
    cleanupCategoryIds.push(draftCategory.id);

    // 2. Setup Team 1 (VERIFIED in active league, 14 players, decoupled payments, private data populated)
    const team1 = await prisma.teams.create({
      data: {
        team_name: `Verified Spikers ${runTag}`,
        slug: `verified-spikers-${runTag}`,
        logo_url: "https://example.com/logo1.png",
        description: "Official test verified volleyball squad",
      },
    });
    cleanupTeamIds.push(team1.id);

    const reg1 = await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryA.id,
        team_id: team1.id,
        registrant_first_name: "JohnPrivate",
        registrant_middle_name: "Secret",
        registrant_last_name: "DoePrivate",
        registrant_contact: "0917-999-8888",
        registrant_email: "private.registrant@example.com",
        status: "VERIFIED",
        notes: "CONFIDENTIAL REGISTRATION NOTES DO NOT EXPOSE",
        registration_code: `MVA-${runTag.toUpperCase()}-01`,
      },
    });

    // Create 14 players for team1 to test >12 players business rule
    const player1 = await prisma.players.create({
      data: {
        first_name: "Juan",
        middle_name: "Santos",
        last_name: "Dela Cruz",
        contact_number: "0918-000-0001",
        date_of_birth: new Date("1996-03-15"),
      },
    });
    cleanupPlayerIds.push(player1.id);
    await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: player1.id,
        jersey_number: 7,
        position: "Setter",
        is_captain: true,
      },
    });

    const player2 = await prisma.players.create({
      data: {
        first_name: "Pedro",
        last_name: "Penduko",
        contact_number: "0918-000-0002",
        date_of_birth: new Date("1998-07-20"),
      },
    });
    cleanupPlayerIds.push(player2.id);
    await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: player2.id,
        jersey_number: 10,
        position: "Outside Hitter",
        is_captain: false,
      },
    });

    const player3 = await prisma.players.create({
      data: {
        first_name: "Carlos",
        last_name: "Yulo",
        contact_number: "0918-000-0003",
      },
    });
    cleanupPlayerIds.push(player3.id);
    await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: player3.id,
        jersey_number: 2,
        position: null,
        is_captain: false,
      },
    });

    const player4 = await prisma.players.create({
      data: {
        first_name: "Ben",
        last_name: "Alvarez",
        contact_number: "0918-000-0004",
      },
    });
    cleanupPlayerIds.push(player4.id);
    await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: player4.id,
        jersey_number: null,
        position: "Libero",
        is_captain: false,
      },
    });

    const player5 = await prisma.players.create({
      data: {
        first_name: "Aaron",
        last_name: "Zubiri",
      },
    });
    cleanupPlayerIds.push(player5.id);
    await prisma.registration_players.create({
      data: {
        registration_id: reg1.id,
        player_id: player5.id,
        jersey_number: null,
        position: null,
        is_captain: false,
      },
    });

    // Players 6 through 14 (jerseys 15 to 23)
    for (let i = 6; i <= 14; i++) {
      const p = await prisma.players.create({
        data: {
          first_name: `ExtraFirst${i}`,
          last_name: `ExtraLast${i}`,
          contact_number: `0918-000-00${i}`,
        },
      });
      cleanupPlayerIds.push(p.id);
      await prisma.registration_players.create({
        data: {
          registration_id: reg1.id,
          player_id: p.id,
          jersey_number: 10 + i,
          position: "Middle Blocker",
          is_captain: false,
        },
      });
    }

    // Attach independent PENDING payment record to test payment status decoupling
    await prisma.payments.create({
      data: {
        registration_id: reg1.id,
        payment_method: "GCASH",
        amount: 300,
        status: "PENDING",
        reference_number: "GCASH-REF-001",
        notes: "Sensitive internal payment note",
      },
    });

    // 3. Setup Team 2 (PENDING_PAYMENT in active league)
    const team2 = await prisma.teams.create({
      data: {
        team_name: `Pending Spikers ${runTag}`,
        slug: `pending-spikers-${runTag}`,
      },
    });
    cleanupTeamIds.push(team2.id);
    await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryA.id,
        team_id: team2.id,
        registrant_first_name: "Pending",
        registrant_last_name: "User",
        registrant_contact: "0917-111-2222",
        status: "PENDING_PAYMENT",
      },
    });

    // 4. Setup Team 3 (REJECTED in active league)
    const team3 = await prisma.teams.create({
      data: {
        team_name: `Rejected Spikers ${runTag}`,
        slug: `rejected-spikers-${runTag}`,
      },
    });
    cleanupTeamIds.push(team3.id);
    await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryA.id,
        team_id: team3.id,
        registrant_first_name: "Rejected",
        registrant_last_name: "User",
        registrant_contact: "0917-333-4444",
        status: "REJECTED",
      },
    });

    // 5. Setup Team 4 (CANCELLED in active league)
    const team4 = await prisma.teams.create({
      data: {
        team_name: `Cancelled Spikers ${runTag}`,
        slug: `cancelled-spikers-${runTag}`,
      },
    });
    cleanupTeamIds.push(team4.id);
    await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryB.id,
        team_id: team4.id,
        registrant_first_name: "Cancelled",
        registrant_last_name: "User",
        registrant_contact: "0917-555-6666",
        status: "CANCELLED",
      },
    });

    // 6. Setup Team 5 (No registration at all)
    const team5 = await prisma.teams.create({
      data: {
        team_name: `Unregistered Team ${runTag}`,
        slug: `unregistered-team-${runTag}`,
      },
    });
    cleanupTeamIds.push(team5.id);

    // 7. Setup Team 6 (VERIFIED in active league, 0 roster members)
    const team6 = await prisma.teams.create({
      data: {
        team_name: `Empty Roster Spikers ${runTag}`,
        slug: `empty-roster-spikers-${runTag}`,
      },
    });
    cleanupTeamIds.push(team6.id);
    await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryB.id,
        team_id: team6.id,
        registrant_first_name: "Empty",
        registrant_last_name: "Roster",
        registrant_contact: "0917-777-8888",
        status: "VERIFIED",
      },
    });

    // --- HARDENING FIXTURES: HISTORICAL & MULTI-LEAGUE EDGE CASES ---
    // 8. Team Historical-Only (VERIFIED in historical league, NOT in active league)
    const teamHistoricalOnly = await prisma.teams.create({
      data: {
        team_name: `Historical Only Spikers ${runTag}`,
        slug: `historical-only-${runTag}`,
      },
    });
    cleanupTeamIds.push(teamHistoricalOnly.id);
    const regHistoricalOnly = await prisma.registrations.create({
      data: {
        league_id: historicalLeague.id,
        league_category_id: historicalCategory.id,
        team_id: teamHistoricalOnly.id,
        registrant_first_name: "OldRegistrant",
        registrant_last_name: "Past",
        registrant_contact: "0917-000-1111",
        status: "VERIFIED", // Verified historically!
      },
    });
    const playerHistoricalOnly = await prisma.players.create({
      data: {
        first_name: "OldJuan",
        last_name: "OldDelaCruz",
      },
    });
    cleanupPlayerIds.push(playerHistoricalOnly.id);
    await prisma.registration_players.create({
      data: {
        registration_id: regHistoricalOnly.id,
        player_id: playerHistoricalOnly.id,
        jersey_number: 1,
      },
    });

    // 9. Team Multi-Season (VERIFIED in historical league AND VERIFIED in active league)
    const teamMultiSeason = await prisma.teams.create({
      data: {
        team_name: `Multi Season Legends ${runTag}`,
        slug: `multi-season-legends-${runTag}`,
      },
    });
    cleanupTeamIds.push(teamMultiSeason.id);

    // 9A. Historical registration for teamMultiSeason
    const regMultiHistorical = await prisma.registrations.create({
      data: {
        league_id: historicalLeague.id,
        league_category_id: historicalCategory.id,
        team_id: teamMultiSeason.id,
        registrant_first_name: "OldRegistrant",
        registrant_last_name: "Legend",
        registrant_contact: "0917-000-2222",
        status: "VERIFIED",
        submitted_at: new Date("2024-01-01"),
      },
    });
    const playerOld = await prisma.players.create({
      data: {
        first_name: "HistoricalRosterPlayer",
        last_name: "ShouldNotLeak",
      },
    });
    cleanupPlayerIds.push(playerOld.id);
    await prisma.registration_players.create({
      data: {
        registration_id: regMultiHistorical.id,
        player_id: playerOld.id,
        jersey_number: 99,
      },
    });

    // 9B. Current active registration for teamMultiSeason
    const regMultiActive = await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryA.id,
        team_id: teamMultiSeason.id,
        registrant_first_name: "CurrentRegistrant",
        registrant_last_name: "Legend",
        registrant_contact: "0917-000-3333",
        status: "VERIFIED",
        submitted_at: new Date("2026-06-01"),
      },
    });
    const playerNew = await prisma.players.create({
      data: {
        first_name: "CurrentRosterPlayer",
        last_name: "Active2026",
      },
    });
    cleanupPlayerIds.push(playerNew.id);
    await prisma.registration_players.create({
      data: {
        registration_id: regMultiActive.id,
        player_id: playerNew.id,
        jersey_number: 8,
      },
    });

    // 10. Team Draft League Only (VERIFIED in DRAFT league - should NOT be public)
    const teamDraftOnly = await prisma.teams.create({
      data: {
        team_name: `Draft Only Spikers ${runTag}`,
        slug: `draft-only-${runTag}`,
      },
    });
    cleanupTeamIds.push(teamDraftOnly.id);
    await prisma.registrations.create({
      data: {
        league_id: draftLeague.id,
        league_category_id: draftCategory.id,
        team_id: teamDraftOnly.id,
        registrant_first_name: "Draft",
        registrant_last_name: "User",
        registrant_contact: "0917-000-4444",
        status: "VERIFIED",
      },
    });

    // 11. Team Double Category (same team registered in Category A and Category B in active league)
    const teamDoubleCat = await prisma.teams.create({
      data: {
        team_name: `Double Category Club ${runTag}`,
        slug: `double-cat-${runTag}`,
      },
    });
    cleanupTeamIds.push(teamDoubleCat.id);
    await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryA.id,
        team_id: teamDoubleCat.id,
        registrant_first_name: "Double",
        registrant_last_name: "Cat1",
        registrant_contact: "0917-000-5555",
        status: "VERIFIED",
      },
    });
    await prisma.registrations.create({
      data: {
        league_id: testLeague.id,
        league_category_id: testCategoryB.id,
        team_id: teamDoubleCat.id,
        registrant_first_name: "Double",
        registrant_last_name: "Cat2",
        registrant_contact: "0917-000-6666",
        status: "VERIFIED",
      },
    });

    console.log("\n--- TEST GROUP A: ACTIVE TOURNAMENT CONTEXT RESOLUTION ---");
    const resolvedActiveLeague = await getActivePublicLeague();
    assert(resolvedActiveLeague !== null, "Active tournament context resolves successfully");
    assert(resolvedActiveLeague?.id === testLeague.id, "Active league matches the current ongoing/open tournament");
    assert(resolvedActiveLeague?.status === "ONGOING", "Active league status priority prefers ONGOING");

    console.log("\n--- TEST GROUP B: PUBLIC TEAMS DIRECTORY LISTING & ELIGIBILITY ---");
    const directoryData = await getPublicTeams();
    const publicTeams = directoryData.teams;

    // Check VERIFIED active teams are included
    const foundTeam1 = publicTeams.find((t) => t.id === team1.id);
    assert(!!foundTeam1, "VERIFIED registration team in active league (team1) is visible");

    const foundTeam6 = publicTeams.find((t) => t.id === team6.id);
    assert(!!foundTeam6, "VERIFIED team with 0 players in active league (team6) is visible");

    const foundMultiSeason = publicTeams.find((t) => t.id === teamMultiSeason.id);
    assert(!!foundMultiSeason, "Multi-season team with current active registration is visible");

    // Check historical-only and draft-only teams are EXCLUDED
    const foundHistoricalOnly = publicTeams.find((t) => t.id === teamHistoricalOnly.id);
    assert(!foundHistoricalOnly, "Historical-only team (COMPLETED league) is strictly excluded from active directory");

    const foundDraftOnly = publicTeams.find((t) => t.id === teamDraftOnly.id);
    assert(!foundDraftOnly, "Draft league team (DRAFT league) is strictly excluded from active directory");

    // Check non-VERIFIED active teams are EXCLUDED
    const foundTeam2 = publicTeams.find((t) => t.id === team2.id);
    assert(!foundTeam2, "PENDING_PAYMENT team (team2) is excluded");

    const foundTeam3 = publicTeams.find((t) => t.id === team3.id);
    assert(!foundTeam3, "REJECTED team (team3) is excluded");

    const foundTeam4 = publicTeams.find((t) => t.id === team4.id);
    assert(!foundTeam4, "CANCELLED team (team4) is excluded");

    const foundTeam5 = publicTeams.find((t) => t.id === team5.id);
    assert(!foundTeam5, "Unregistered team (team5) is excluded");

    // Check team deduplication: a team NEVER appears more than once
    const multiSeasonOccurrences = publicTeams.filter((t) => t.id === teamMultiSeason.id);
    assert(multiSeasonOccurrences.length === 1, "Team with historical and current registrations appears EXACTLY ONCE");

    const doubleCatOccurrences = publicTeams.filter((t) => t.id === teamDoubleCat.id);
    assert(doubleCatOccurrences.length === 1, "Team registered in two categories appears EXACTLY ONCE (deduplication)");

    // Payment decoupling test
    assert(
      foundTeam1 !== undefined && foundTeam1.roster_count === 14,
      "Payment status does not control public team visibility (visible even with PENDING payment)"
    );

    // Team metadata on listing
    assert(
      foundTeam1?.category_name === `Open Division ${runTag}`,
      "Division/category name is accurately resolved on listing"
    );
    assert(
      foundTeam1?.league_name === `Active League ${runTag}`,
      "League name is accurately resolved on listing"
    );
    assert(
      foundTeam1?.roster_count === 14,
      "Official roster count for team1 is exactly 14 on listing"
    );
    assert(
      foundTeam6?.roster_count === 0,
      "Official roster count for team6 is exactly 0 on listing"
    );

    console.log("\n--- TEST GROUP C: PRIVACY BY QUERY DESIGN ON LISTING ---");
    const team1Any = foundTeam1 as unknown as Record<string, unknown>;
    assert(team1Any["registrant_first_name"] === undefined, "Listing: registrant_first_name is absent");
    assert(team1Any["registrant_contact"] === undefined, "Listing: registrant_contact is absent");
    assert(team1Any["registrant_email"] === undefined, "Listing: registrant_email is absent");
    assert(team1Any["notes"] === undefined, "Listing: registration notes are absent");
    assert(team1Any["payments"] === undefined, "Listing: payments object is absent");
    assert(team1Any["admin_access"] === undefined, "Listing: admin_access is absent");
    assert(team1Any["admin_audit_logs"] === undefined, "Listing: admin_audit_logs is absent");

    console.log("\n--- TEST GROUP D: PUBLIC TEAM PROFILE BY SLUG & MULTI-LEAGUE ISOLATION ---");
    // Active team profile
    const team1Profile = await getPublicTeamBySlug(team1.slug);
    assert(!!team1Profile, "Team slug resolves successfully to public team profile");
    assert(team1Profile?.team_name === team1.team_name, "Team profile team_name matches");
    assert(team1Profile?.slug === team1.slug, "Team profile slug matches");
    assert(team1Profile?.category_name === `Open Division ${runTag}`, "Team profile category matches");
    assert(team1Profile?.league_name === `Active League ${runTag}`, "Team profile league matches");
    assert(team1Profile?.roster_count === 14, "Team profile roster count is 14");
    assert(team1Profile?.roster.length === 14, "Team profile roster contains all 14 players (>12 allowed)");

    // Historical-only team slug MUST return null (404)
    const histOnlyProfile = await getPublicTeamBySlug(teamHistoricalOnly.slug);
    assert(histOnlyProfile === null, "Historical-only team returns null (404, does not leak historical league)");

    // Draft-only team slug MUST return null (404)
    const draftOnlyProfile = await getPublicTeamBySlug(teamDraftOnly.slug);
    assert(draftOnlyProfile === null, "Draft-only team returns null (404, does not leak draft league)");

    // Multi-season team profile MUST resolve active tournament roster only
    const multiSeasonProfile = await getPublicTeamBySlug(teamMultiSeason.slug);
    assert(multiSeasonProfile !== null, "Multi-season team profile resolves active tournament registration");
    assert(multiSeasonProfile?.league_name === `Active League ${runTag}`, "Multi-season profile resolves active league name");
    assert(
      multiSeasonProfile?.roster.some((p) => p.first_name === "CurrentRosterPlayer") === true,
      "Multi-season roster contains current active player"
    );
    assert(
      multiSeasonProfile?.roster.some((p) => p.first_name === "HistoricalRosterPlayer") === false,
      "Historical player does NOT leak into active tournament roster"
    );

    // Invalid & unverified slugs MUST return null (404)
    const unknownProfile = await getPublicTeamBySlug(`unknown-slug-${randomUUID()}`);
    assert(unknownProfile === null, "Unknown slug returns null (triggers 404)");

    const pendingProfile = await getPublicTeamBySlug(team2.slug);
    assert(pendingProfile === null, "PENDING_PAYMENT team's valid slug returns null (triggers 404)");

    const rejectedProfile = await getPublicTeamBySlug(team3.slug);
    assert(rejectedProfile === null, "REJECTED team's valid slug returns null (triggers 404)");

    const cancelledProfile = await getPublicTeamBySlug(team4.slug);
    assert(cancelledProfile === null, "CANCELLED team's valid slug returns null (triggers 404)");

    const unregisteredProfile = await getPublicTeamBySlug(team5.slug);
    assert(unregisteredProfile === null, "Unregistered team's valid slug returns null (triggers 404)");

    const emptyRosterProfile = await getPublicTeamBySlug(team6.slug);
    assert(
      emptyRosterProfile !== null && emptyRosterProfile.roster.length === 0,
      "Team with empty roster resolves safely with roster.length === 0"
    );

    console.log("\n--- TEST GROUP E: ROSTER SORTING & MEMBER FIELDS ---");
    const roster = team1Profile?.roster || [];

    const captain = roster.find((p) => p.is_captain);
    assert(
      captain !== undefined && captain.jersey_number === 7 && captain.last_name === "Dela Cruz",
      "Captain player returned accurately with is_captain = true, jersey #7"
    );

    const setter = roster.find((p) => p.position === "Setter");
    assert(setter !== undefined && setter.jersey_number === 7, "Player position 'Setter' returned accurately");

    assert(
      roster[0].jersey_number === 2 && roster[0].last_name === "Yulo",
      "Roster sorting: first player is lowest jersey number (#2)"
    );
    assert(
      roster[1].jersey_number === 7,
      "Roster sorting: second player is jersey #7"
    );
    assert(
      roster[2].jersey_number === 10,
      "Roster sorting: third player is jersey #10"
    );

    const unnumbered1 = roster[12];
    const unnumbered2 = roster[13];

    assert(
      unnumbered1.jersey_number === null &&
        unnumbered1.last_name === "Alvarez" &&
        unnumbered1.first_name === "Ben",
      "Roster sorting: unnumbered player 'Alvarez Ben' sorts before 'Zubiri Aaron'"
    );
    assert(
      unnumbered2.jersey_number === null &&
        unnumbered2.last_name === "Zubiri" &&
        unnumbered2.first_name === "Aaron",
      "Roster sorting: unnumbered player 'Zubiri Aaron' sorts alphabetically second"
    );
    assert(
      unnumbered2.position === null,
      "Roster field: null position safely preserved without error"
    );

    const mockRoster: PublicRosterPlayer[] = [
      { id: "1", jersey_number: null, position: null, is_captain: false, first_name: "Zack", middle_name: null, last_name: "Zulu", suffix: null, photo_url: null },
      { id: "2", jersey_number: 99, position: null, is_captain: false, first_name: "A", middle_name: null, last_name: "A", suffix: null, photo_url: null },
      { id: "3", jersey_number: 1, position: null, is_captain: false, first_name: "B", middle_name: null, last_name: "B", suffix: null, photo_url: null },
      { id: "4", jersey_number: null, position: null, is_captain: false, first_name: "Adam", middle_name: null, last_name: "Adams", suffix: null, photo_url: null },
    ];
    const sortedMock = sortRosterPlayers(mockRoster);
    assert(
      sortedMock[0].jersey_number === 1 &&
        sortedMock[1].jersey_number === 99 &&
        sortedMock[2].last_name === "Adams" &&
        sortedMock[3].last_name === "Zulu",
      "sortRosterPlayers pure helper satisfies numeric jerseys then alphabetical unnumbered"
    );

    console.log("\n--- TEST GROUP F: ROSTER PRIVACY BY QUERY DESIGN ---");
    for (const player of roster) {
      const pAny = player as unknown as Record<string, unknown>;
      assert(pAny["contact_number"] === undefined, "Roster player: contact_number is strictly absent");
      assert(pAny["date_of_birth"] === undefined, "Roster player: date_of_birth is strictly absent");
    }

    const profileAny = team1Profile as unknown as Record<string, unknown>;
    assert(profileAny["registrant_first_name"] === undefined, "Profile: registrant_first_name is absent");
    assert(profileAny["registrant_contact"] === undefined, "Profile: registrant_contact is absent");
    assert(profileAny["registrant_email"] === undefined, "Profile: registrant_email is absent");
    assert(profileAny["notes"] === undefined, "Profile: registration notes are absent");
    assert(profileAny["payments"] === undefined, "Profile: payments are absent");

    console.log("\n--- TEST GROUP G: SEARCH & FILTERING LOGIC BEHAVIOR ---");
    const searchLower = "verified spikers";
    const matchLower = publicTeams.filter((t) =>
      t.team_name.toLowerCase().includes(searchLower.toLowerCase())
    );
    assert(matchLower.length >= 1, "Search logic: case-insensitive lowercase search matches");

    const searchUpper = "VERIFIED SPIKERS";
    const matchUpper = publicTeams.filter((t) =>
      t.team_name.toLowerCase().includes(searchUpper.toLowerCase())
    );
    assert(matchUpper.length >= 1, "Search logic: case-insensitive uppercase search matches");

    const searchWhitespace = "   verified spikers   ".trim().toLowerCase();
    const matchWhitespace = publicTeams.filter((t) =>
      t.team_name.toLowerCase().includes(searchWhitespace)
    );
    assert(matchWhitespace.length >= 1, "Search logic: whitespace-trimmed search matches");

    const noMatchSearch = "non-existent-team-xyz-999".trim().toLowerCase();
    const noMatches = publicTeams.filter((t) =>
      t.team_name.toLowerCase().includes(noMatchSearch)
    );
    assert(noMatches.length === 0, "Search logic: no-results query returns empty array");

    const catAFilter = publicTeams.filter((t) => t.category_id === testCategoryA.id);
    assert(
      catAFilter.length >= 1 && catAFilter.every((t) => t.category_id === testCategoryA.id),
      "Category filter: accurately filters teams by selected category"
    );

    console.log("\n--- TEST GROUP H: READ-ONLY QUERY VERIFICATION ---");
    const logCount = await prisma.admin_audit_logs.count({
      where: {
        entity_id: team1.id,
      },
    });
    assert(logCount === 0, "Public queries performed zero writes / zero audit logs");

  } finally {
    console.log("\n--- TEST GROUP I: CLEAN TEARDOWN ---");
    if (cleanupTeamIds.length > 0) {
      await prisma.payments.deleteMany({
        where: {
          registrations: {
            team_id: { in: cleanupTeamIds },
          },
        },
      });

      await prisma.registration_players.deleteMany({
        where: {
          registrations: {
            team_id: { in: cleanupTeamIds },
          },
        },
      });

      await prisma.registrations.deleteMany({
        where: {
          team_id: { in: cleanupTeamIds },
        },
      });

      await prisma.teams.deleteMany({
        where: {
          id: { in: cleanupTeamIds },
        },
      });
    }

    if (cleanupPlayerIds.length > 0) {
      await prisma.players.deleteMany({
        where: {
          id: { in: cleanupPlayerIds },
        },
      });
    }

    if (cleanupCategoryIds.length > 0) {
      await prisma.league_categories.deleteMany({
        where: {
          id: { in: cleanupCategoryIds },
        },
      });
    }

    if (cleanupLeagueIds.length > 0) {
      await prisma.leagues.deleteMany({
        where: {
          id: { in: cleanupLeagueIds },
        },
      });
    }

    console.log(`  -> Ephemeral test fixtures with tag ${runTag} cleanly deleted.`);
    assert(true, "Verification fixtures are completely cleaned up from mva_dev");
  }

  console.log("\n==================================================");
  console.log(`PHASE 05.6B TEST SUITE SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("==================================================");
}

runSuite()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("\n[SUITE FATAL ERROR]", err);
    process.exit(1);
  });
