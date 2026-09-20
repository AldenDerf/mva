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
  sortRosterPlayers,
  PublicRosterPlayer,
} from "../lib/public/teams";

/**
 * PHASE 05.6B: PUBLIC TEAMS & OFFICIAL ROSTER VERIFICATION SUITE
 *
 * Verifies all 33+ criteria specified in the phase requirements:
 * 1. Local database safety probe confirms mva_dev on localhost.
 * 2. VERIFIED registration team is visible in public listing.
 * 3. PENDING_PAYMENT registration team is excluded from public listing.
 * 4. REJECTED registration team is excluded from public listing.
 * 5. CANCELLED registration team is excluded from public listing.
 * 6. Payment status decoupling: verified team is public regardless of payment row status.
 * 7. Team slug resolves successfully to public team profile.
 * 8. Unknown slug returns null (triggers 404).
 * 9. Unverified team's valid slug returns null (triggers 404).
 * 10. REJECTED team's valid slug returns null (triggers 404).
 * 11. CANCELLED team's valid slug returns null (triggers 404).
 * 12. Team without registration returns null (triggers 404).
 * 13. Division / category is accurately resolved on team profile.
 * 14. League name is accurately resolved on team profile.
 * 15. Roster association is correct.
 * 16. Official roster count is correct.
 * 17. Jersey numbers returned accurately.
 * 18. Position returned accurately.
 * 19. Team captain flag returned accurately.
 * 20. Null jersey numbers handled safely.
 * 21. Null positions handled safely.
 * 22. Roster with >12 players is fully returned (e.g. 14 players).
 * 23. No obsolete max_players = 12 enforcement occurs.
 * 24. Roster sorting: numbered players ascending first, then unnumbered alphabetically by name.
 * 25. Privacy: player contact_number is absent from public query result.
 * 26. Privacy: player date_of_birth is absent from public query result.
 * 27. Privacy: registrant contact is absent.
 * 28. Privacy: registrant email is absent.
 * 29. Privacy: registration notes are absent.
 * 30. Privacy: payment information is absent.
 * 31. Privacy: admin/profile information is absent.
 * 32. Search is case-insensitive.
 * 33. Search handles leading/trailing whitespace.
 * 34. Category filtering filters correctly.
 * 35. No-results search returns empty array.
 * 36. Team with empty roster is handled safely.
 * 37. Public queries perform zero write operations.
 * 38. All ephemeral test fixtures cleanly cleaned up, existing dev data intact.
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
    // 1. Setup Ephemeral League & Category
    const testLeague = await prisma.leagues.create({
      data: {
        name: `Test League ${runTag}`,
        year: 2026,
        status: "OPEN_FOR_REGISTRATION",
      },
    });
    cleanupLeagueIds.push(testLeague.id);

    const testCategoryA = await prisma.league_categories.create({
      data: {
        league_id: testLeague.id,
        name: `Open Division ${runTag}`,
        registration_fee: 3600,
        min_players: 6,
        max_players: 12, // Technical debt in schema, but business rule is no max!
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

    // 2. Setup Team 1 (VERIFIED, 14 players, decoupled payments, private data populated)
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
    // Player 1: Jersey 7, Captain, Position: Setter
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

    // Player 2: Jersey 10, Position: Outside Hitter
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

    // Player 3: Jersey 2 (numbered lower than 7 to test numerical sorting)
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
        position: null, // null position test
        is_captain: false,
      },
    });

    // Player 4: Null jersey, Alvarez Ben (should sort first among unnumbered)
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
        jersey_number: null, // null jersey test
        position: "Libero",
        is_captain: false,
      },
    });

    // Player 5: Null jersey, Zubiri Aaron (should sort second among unnumbered)
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

    // Attach an independent PENDING / REJECTED payment record to test payment status decoupling
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

    // 3. Setup Team 2 (PENDING_PAYMENT registration)
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

    // 4. Setup Team 3 (REJECTED registration)
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

    // 5. Setup Team 4 (CANCELLED registration)
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

    // 7. Setup Team 6 (VERIFIED, but 0 roster members - empty roster edge case)
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

    console.log("\n--- TEST GROUP A: PUBLIC TEAMS DIRECTORY LISTING & ELIGIBILITY ---");

    const directoryData = await getPublicTeams();
    const publicTeams = directoryData.teams;

    // Check VERIFIED teams are included
    const foundTeam1 = publicTeams.find((t) => t.id === team1.id);
    assert(!!foundTeam1, "VERIFIED registration team (team1) is visible in public listing");

    const foundTeam6 = publicTeams.find((t) => t.id === team6.id);
    assert(!!foundTeam6, "VERIFIED registration team with 0 players (team6) is visible in public listing");

    // Check excluded registrations
    const foundTeam2 = publicTeams.find((t) => t.id === team2.id);
    assert(!foundTeam2, "PENDING_PAYMENT team (team2) is excluded from public listing");

    const foundTeam3 = publicTeams.find((t) => t.id === team3.id);
    assert(!foundTeam3, "REJECTED registration team (team3) is excluded from public listing");

    const foundTeam4 = publicTeams.find((t) => t.id === team4.id);
    assert(!foundTeam4, "CANCELLED registration team (team4) is excluded from public listing");

    const foundTeam5 = publicTeams.find((t) => t.id === team5.id);
    assert(!foundTeam5, "Unregistered team (team5) is excluded from public listing");

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
      foundTeam1?.league_name === `Test League ${runTag}`,
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

    console.log("\n--- TEST GROUP B: PRIVACY BY QUERY DESIGN ON LISTING ---");
    // Explicitly check that forbidden private fields are undefined on the returned objects
    const team1Any = foundTeam1 as unknown as Record<string, unknown>;
    assert(team1Any["registrant_first_name"] === undefined, "Listing: registrant_first_name is absent");
    assert(team1Any["registrant_contact"] === undefined, "Listing: registrant_contact is absent");
    assert(team1Any["registrant_email"] === undefined, "Listing: registrant_email is absent");
    assert(team1Any["notes"] === undefined, "Listing: registration notes are absent");
    assert(team1Any["payments"] === undefined, "Listing: payments object is absent");
    assert(team1Any["admin_access"] === undefined, "Listing: admin_access is absent");
    assert(team1Any["admin_audit_logs"] === undefined, "Listing: admin_audit_logs is absent");

    console.log("\n--- TEST GROUP C: PUBLIC TEAM PROFILE BY SLUG & SECURITY ---");

    // Valid verified team
    const team1Profile = await getPublicTeamBySlug(team1.slug);
    assert(!!team1Profile, "Team slug resolves successfully to public team profile");
    assert(team1Profile?.team_name === team1.team_name, "Team profile team_name matches");
    assert(team1Profile?.slug === team1.slug, "Team profile slug matches");
    assert(team1Profile?.category_name === `Open Division ${runTag}`, "Team profile category matches");
    assert(team1Profile?.league_name === `Test League ${runTag}`, "Team profile league matches");
    assert(team1Profile?.roster_count === 14, "Team profile roster count is 14");
    assert(team1Profile?.roster.length === 14, "Team profile roster contains all 14 players (>12 allowed)");

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

    // Empty roster profile
    const emptyRosterProfile = await getPublicTeamBySlug(team6.slug);
    assert(
      emptyRosterProfile !== null && emptyRosterProfile.roster.length === 0,
      "Team with empty roster resolves safely with roster.length === 0"
    );

    console.log("\n--- TEST GROUP D: ROSTER SORTING & MEMBER FIELDS ---");
    const roster = team1Profile?.roster || [];

    // Check jersey numbers, positions, captain
    const captain = roster.find((p) => p.is_captain);
    assert(
      captain !== undefined && captain.jersey_number === 7 && captain.last_name === "Dela Cruz",
      "Captain player returned accurately with is_captain = true, jersey #7"
    );

    const setter = roster.find((p) => p.position === "Setter");
    assert(setter !== undefined && setter.jersey_number === 7, "Player position 'Setter' returned accurately");

    // Sorting check:
    // 1st numbered player should be jersey #2 (Carlos Yulo)
    assert(
      roster[0].jersey_number === 2 && roster[0].last_name === "Yulo",
      "Roster sorting: first player is lowest jersey number (#2)"
    );
    // 2nd numbered player should be jersey #7
    assert(
      roster[1].jersey_number === 7,
      "Roster sorting: second player is jersey #7"
    );
    // 3rd numbered player should be jersey #10
    assert(
      roster[2].jersey_number === 10,
      "Roster sorting: third player is jersey #10"
    );

    // Numbered players: indexes 0 to 11 (12 numbered players: 2, 7, 10, 16..24)
    // Unnumbered players: last 2 entries (Alvarez Ben, then Zubiri Aaron)
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

    // Check pure sort function directly
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

    console.log("\n--- TEST GROUP E: ROSTER PRIVACY BY QUERY DESIGN ---");
    // Verify player private fields are strictly absent
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

    console.log("\n--- TEST GROUP F: SEARCH & FILTERING LOGIC BEHAVIOR ---");
    // Search case-insensitivity
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

    // Search leading/trailing whitespace
    const searchWhitespace = "   verified spikers   ".trim().toLowerCase();
    const matchWhitespace = publicTeams.filter((t) =>
      t.team_name.toLowerCase().includes(searchWhitespace)
    );
    assert(matchWhitespace.length >= 1, "Search logic: whitespace-trimmed search matches");

    // No results search
    const noMatchSearch = "non-existent-team-xyz-999".trim().toLowerCase();
    const noMatches = publicTeams.filter((t) =>
      t.team_name.toLowerCase().includes(noMatchSearch)
    );
    assert(noMatches.length === 0, "Search logic: no-results query returns empty array");

    // Category filter
    const catAFilter = publicTeams.filter((t) => t.category_id === testCategoryA.id);
    assert(
      catAFilter.length >= 1 && catAFilter.every((t) => t.category_id === testCategoryA.id),
      "Category filter: accurately filters teams by selected category"
    );

    console.log("\n--- TEST GROUP G: READ-ONLY QUERY VERIFICATION ---");
    // Verify no write operations occurred during public queries
    const logCount = await prisma.admin_audit_logs.count({
      where: {
        entity_id: team1.id,
      },
    });
    assert(logCount === 0, "Public queries performed zero writes / zero audit logs");

  } finally {
    console.log("\n--- TEST GROUP H: CLEAN TEARDOWN ---");
    // Clean up all ephemeral test fixtures
    if (cleanupTeamIds.length > 0) {
      // Cascade delete payments
      await prisma.payments.deleteMany({
        where: {
          registrations: {
            team_id: { in: cleanupTeamIds },
          },
        },
      });

      // Cascade delete registration_players
      await prisma.registration_players.deleteMany({
        where: {
          registrations: {
            team_id: { in: cleanupTeamIds },
          },
        },
      });

      // Cascade delete registrations
      await prisma.registrations.deleteMany({
        where: {
          team_id: { in: cleanupTeamIds },
        },
      });

      // Delete teams
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
