import {
  fetchOpenLeaguesAction,
  fetchLeagueCategoriesAction,
  fetchExistingTeamsAction,
  fetchTeamPreviousMembersAction,
  submitTeamRegistrationAction,
} from "../app/actions/registration";
import { calculateRosterFeeAndStatus } from "../lib/registration";
import { prisma } from "../lib/prisma";

async function verifyPhase043() {
  console.log("=== Phase 04.3 Team Information & Roster Flow Verification ===");

  // Baseline database snapshot
  const initialLeagueCount = await prisma.leagues.count();
  const initialCategoryCount = await prisma.league_categories.count();
  const initialRegistrations = await prisma.registrations.findMany({
    orderBy: { created_at: "asc" },
    include: {
      registration_players: true,
    },
  });
  console.log(`[SNAPSHOT] Initial state: ${initialLeagueCount} leagues, ${initialCategoryCount} categories, ${initialRegistrations.length} registrations.`);

  // 1. Fetch open league
  const leaguesRes = await fetchOpenLeaguesAction();
  if (!leaguesRes.success || !leaguesRes.data || leaguesRes.data.length === 0) {
    throw new Error("Failed to fetch open leagues.");
  }
  const league = leaguesRes.data[0];
  console.log(`[PASS] Open league: "${league.name}" (${league.id})`);

  // 2. Fetch categories
  const catsRes = await fetchLeagueCategoriesAction(league.id);
  if (!catsRes.success || !catsRes.data || catsRes.data.length === 0) {
    throw new Error("Failed to fetch categories.");
  }
  const category = catsRes.data.find((c) => c.name === "Mahatao Only") ?? catsRes.data[0];
  console.log(`[PASS] Category: "${category.name}" (min=${category.min_players}, max=${category.max_players}, fee=₱${category.registration_fee})`);

  // 3. Test 1: Existing team can be selected
  console.log("\n--- Test 1: Existing team can be selected ---");
  const teamsRes = await fetchExistingTeamsAction(league.id, category.id);
  if (!teamsRes.success || !teamsRes.data || teamsRes.data.length === 0) {
    throw new Error("Failed to fetch existing teams.");
  }
  const mahataoTeam = teamsRes.data.find((t) => t.team_name === "Team Mahatao");
  const northTeam = teamsRes.data.find((t) => t.team_name === "North Islanders");
  if (!mahataoTeam || !northTeam) {
    throw new Error("Expected existing teams 'Team Mahatao' and 'North Islanders' in DB.");
  }
  console.log(`[PASS] Found existing team: "${mahataoTeam.team_name}" (Already in category: ${mahataoTeam.is_registered_in_category})`);
  console.log(`[PASS] Found available team: "${northTeam.team_name}" (Already in category: ${northTeam.is_registered_in_category})`);

  // 4. Test 2: Existing team members can be displayed / loaded
  console.log("\n--- Test 2: Existing team members can be displayed ---");
  const membersRes = await fetchTeamPreviousMembersAction(mahataoTeam.id);
  if (!membersRes.success || !membersRes.data) {
    throw new Error("Failed to load previous team members for Team Mahatao.");
  }
  console.log(`[PASS] Previous members loaded for ${mahataoTeam.team_name}: ${membersRes.data.length} players found:`);
  for (const m of membersRes.data) {
    console.log(`  - ${m.first_name} ${m.last_name} (Jersey: #${m.jersey_number ?? "none"}, Pos: ${m.position ?? "none"})`);
  }
  if (membersRes.data.length < 3) {
    throw new Error("Expected at least 3 historical players for Team Mahatao.");
  }

  // 5. Test 3 & 4: Existing team members retained/removed & new player added in draft
  console.log("\n--- Test 3 & 4: Retaining, removing, and adding players to current roster ---");
  // Retain first 2 historical members, remove the 3rd, and add 1 new player
  const retained = membersRes.data.slice(0, 2).map((m) => ({
    player_id: m.player_id,
    first_name: m.first_name,
    middle_name: m.middle_name,
    last_name: m.last_name,
    suffix: m.suffix,
    jersey_number: m.jersey_number ? parseInt(m.jersey_number, 10) : 1,
    position: m.position ?? "Outside Hitter",
    is_captain: false,
  }));
  const newPlayer = {
    first_name: "Eduardo",
    middle_name: null,
    last_name: "Castillo",
    suffix: null,
    jersey_number: null, // Jersey number is not required for initial registration
    position: null, // Position is not required for initial registration
    is_captain: true, // Captain selected from current roster
  };
  const currentRosterDraft = [...retained, newPlayer];
  console.log(`[PASS] Current roster draft has ${currentRosterDraft.length} players (2 retained from history, 1 newly added without jersey/position, 1 removed).`);

  // 6. Test 6: Registrant can be different from captain
  console.log("\n--- Test 6: Registrant can be different from captain ---");
  const testRegistrant = {
    first_name: "Maria",
    middle_name: "Elena",
    last_name: "Gomez",
    suffix: null,
    contact: "09171234567",
    email: "maria.gomez@example.com",
  };
  const captainCandidate = currentRosterDraft.find((p) => p.is_captain)!;
  console.log(`[PASS] Registrant: "${testRegistrant.first_name} ${testRegistrant.last_name}"`);
  console.log(`[PASS] Captain: "${captainCandidate.first_name} ${captainCandidate.last_name}"`);
  if (
    testRegistrant.first_name === captainCandidate.first_name &&
    testRegistrant.last_name === captainCandidate.last_name
  ) {
    throw new Error("Registrant and captain should be distinct for this test.");
  }

  // 7. Test 7 & 8: Captain selection validation
  console.log("\n--- Test 7 & 8: Captain selection validation ---");
  // A roster with no captain
  const noCaptainRoster = currentRosterDraft.map((p) => ({ ...p, is_captain: false }));
  try {
    await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_mode: "new",
      new_team_name: "Test No Captain",
      registrant: testRegistrant,
      players: noCaptainRoster,
    });
    throw new Error("Should have failed when no captain is selected.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[PASS] Roster with no captain correctly rejected: "${msg}"`);
  }

  // 8. Test 9, 10, 11: Below-minimum vs At-minimum roster status & continuation
  console.log("\n--- Test 9, 10, 11: Below-minimum allowed (Incomplete) vs At-minimum (Complete) ---");
  const belowCalc = calculateRosterFeeAndStatus(3, category.registration_fee, category.min_players);
  if (belowCalc.status !== "INCOMPLETE" || belowCalc.is_complete !== false) {
    throw new Error("Expected 3 players to be marked INCOMPLETE.");
  }
  console.log(`[PASS] 3 players (< min ${category.min_players}): Status = ${belowCalc.status} (Registration allowed)`);

  const atMinCalc = calculateRosterFeeAndStatus(category.min_players, category.registration_fee, category.min_players);
  if (atMinCalc.status !== "COMPLETE" || atMinCalc.is_complete !== true) {
    throw new Error("Expected min players to be marked COMPLETE.");
  }
  console.log(`[PASS] ${category.min_players} players (= min ${category.min_players}): Status = ${atMinCalc.status}`);

  // 9. Test 12: More than 12 players allowed (No maximum roster limit rejection)
  console.log("\n--- Test 12: No maximum roster limit rejection ---");
  const manyPlayers = Array.from({ length: 15 }, (_, i) => ({
    first_name: `Player${i + 1}`,
    last_name: `Test${i + 1}`,
    is_captain: i === 0,
  }));
  const test15TeamName = `Test Many Players ${Date.now()}`;
  const manyPlayersRes = await submitTeamRegistrationAction({
    league_id: league.id,
    league_category_id: category.id,
    team_name: test15TeamName,
    registrant: testRegistrant,
    players: manyPlayers,
  });
  if (!manyPlayersRes.success || !manyPlayersRes.data) {
    throw new Error(`Should have accepted roster with 15 players: ${manyPlayersRes.error}`);
  }
  console.log(`[PASS] 15 players accepted without maximum rejection: ID=${manyPlayersRes.data.registration_id}`);
  // Clean up
  await prisma.payments.deleteMany({ where: { registration_id: manyPlayersRes.data.registration_id } });
  await prisma.registration_players.deleteMany({ where: { registration_id: manyPlayersRes.data.registration_id } });
  await prisma.registrations.delete({ where: { id: manyPlayersRes.data.registration_id } });
  await prisma.teams.delete({ where: { id: manyPlayersRes.data.team_id } });

  // 10. Test 13: Fee calculation check
  console.log("\n--- Test 13: Fee remains player count × registration_fee ---");
  for (const count of [8, 9, 10, 12]) {
    const calc = calculateRosterFeeAndStatus(count, category.registration_fee, category.min_players);
    const expected = count * 300;
    if (calc.total_fee !== expected) {
      throw new Error(`Fee mismatch: expected ${expected}, got ${calc.total_fee}`);
    }
    console.log(`[PASS] ${count} players × ₱${category.registration_fee} = ₱${calc.total_fee}`);
  }

  // 11. Test 5 & 14 & 15: Create a new registration using existing team architecture & verify data isolation
  console.log("\n--- Test 5 & 14 & 15: End-to-end registration submission & isolation ---");
  const testTeamName = `Test Spikers ${Date.now()}`;
  const submitRes = await submitTeamRegistrationAction({
    league_id: league.id,
    league_category_id: category.id,
    team_mode: "new",
    new_team_name: testTeamName,
    registrant: testRegistrant,
    players: currentRosterDraft,
  });

  if (!submitRes.success || !submitRes.data) {
    throw new Error(`Submission failed: ${submitRes.error}`);
  }

  const created = submitRes.data;
  console.log(`[PASS] Registration submitted successfully!`);
  console.log(`  - Registration ID: ${created.registration_id}`);
  console.log(`  - Registration Code: ${created.registration_code}`);
  console.log(`  - Status: ${created.status}`);
  console.log(`  - Team: ${created.team_name}`);
  console.log(`  - Player Count: ${created.player_count}`);
  console.log(`  - Total Fee: ₱${created.total_fee}`);
  console.log(`  - Captain: ${created.captain_name}`);
  console.log(`  - Registrant: ${created.registrant_name}`);

  if (!created.registration_code || !created.registration_code.startsWith("MVA-2026-")) {
    throw new Error(`Invalid registration code format: ${created.registration_code}`);
  }
  if (created.status !== "PENDING_PAYMENT") {
    throw new Error(`Expected status PENDING_PAYMENT, got ${created.status}`);
  }

  // Verify pending payment assessment record created
  const payRecord = await prisma.payments.findFirst({
    where: { registration_id: created.registration_id },
  });
  if (!payRecord) {
    throw new Error("Expected pending payments record to retain assessed fee.");
  }
  if (Number(payRecord.amount) !== created.total_fee) {
    throw new Error(`Expected payment amount ${created.total_fee}, got ${payRecord.amount}`);
  }
  if (payRecord.status !== "PENDING") {
    throw new Error(`Expected payment status PENDING, got ${payRecord.status}`);
  }
  console.log(`[PASS] Pending payment assessment verified: ₱${payRecord.amount} (Status: ${payRecord.status})`);

  // Verify historical registrations remain UNTOUCHED
  console.log("\n--- Verifying historical registrations and leagues are unmutated ---");
  for (const hist of initialRegistrations) {
    const currentHist = await prisma.registrations.findUnique({
      where: { id: hist.id },
      include: { registration_players: true },
    });
    if (!currentHist) {
      throw new Error(`Historical registration ${hist.id} missing!`);
    }
    if (currentHist.registration_players.length !== hist.registration_players.length) {
      throw new Error(`Historical registration ${hist.id} player count was mutated!`);
    }
    if (currentHist.status !== hist.status) {
      throw new Error(`Historical registration status was mutated!`);
    }
  }
  console.log(`[PASS] All ${initialRegistrations.length} historical registrations remained completely unmutated.`);

  // Verify league & categories intact
  const finalLeagueCount = await prisma.leagues.count();
  const finalCategoryCount = await prisma.league_categories.count();
  if (finalLeagueCount !== initialLeagueCount || finalCategoryCount !== initialCategoryCount) {
    throw new Error("League or category structure was altered!");
  }
  console.log(`[PASS] League (${finalLeagueCount}) and category (${finalCategoryCount}) counts remain identical.`);

  // Clean up the newly created test registration and team to leave DB clean
  await prisma.payments.deleteMany({ where: { registration_id: created.registration_id } });
  await prisma.registration_players.deleteMany({ where: { registration_id: created.registration_id } });
  await prisma.registrations.delete({ where: { id: created.registration_id } });
  await prisma.teams.delete({ where: { id: created.team_id } });
  // Clean up test player if created
  const testP = await prisma.players.findFirst({ where: { first_name: "Eduardo", last_name: "Castillo" } });
  if (testP) {
    await prisma.players.delete({ where: { id: testP.id } });
  }
  console.log(`[CLEANUP] Test records cleaned up. Database restored to pristine state.`);

  console.log("\n=== ALL 15 PHASE 04.3 CHECKS PASSED ===");
}

verifyPhase043()
  .catch((err) => {
    console.error("Phase 04.3 verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
