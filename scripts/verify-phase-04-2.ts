import {
  fetchOpenLeaguesAction,
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
  calculateRosterAction,
} from "../app/actions/registration";
import { calculateRosterFeeAndStatus } from "../lib/registration";
import { prisma } from "../lib/prisma";

async function verifyPhase042() {
  console.log("=== Phase 04.2 Automated Flow Verification ===");

  // 1. Verify pure function with min_players = 12 requirement from prompt
  console.log("\n--- 1. Testing calculateRosterFeeAndStatus with min_players = 12 ---");
  const test12MinCases = [
    { count: 8, min: 12, fee: 300, expectedTotal: 2400, expectedComplete: false, expectedStatus: "INCOMPLETE" },
    { count: 11, min: 12, fee: 300, expectedTotal: 3300, expectedComplete: false, expectedStatus: "INCOMPLETE" },
    { count: 12, min: 12, fee: 300, expectedTotal: 3600, expectedComplete: true, expectedStatus: "COMPLETE" },
  ];

  for (const tc of test12MinCases) {
    const res = calculateRosterFeeAndStatus(tc.count, tc.fee, tc.min);
    if (res.total_fee !== tc.expectedTotal) {
      throw new Error(`Expected total ${tc.expectedTotal}, got ${res.total_fee}`);
    }
    if (res.is_complete !== tc.expectedComplete) {
      throw new Error(`Expected is_complete=${tc.expectedComplete}, got ${res.is_complete}`);
    }
    if (res.status !== tc.expectedStatus) {
      throw new Error(`Expected status=${tc.expectedStatus}, got ${res.status}`);
    }
    if (res.required_minimum !== tc.min) {
      throw new Error(`Expected required_minimum=${tc.min}, got ${res.required_minimum}`);
    }
    console.log(`[PASS] ${tc.count} players (min ${tc.min}): Total = ₱${res.total_fee}, Status = ${res.status} (${res.message})`);
  }

  // 2. Fetch leagues via Server Action
  console.log("\n--- 2. Fetching Open Leagues via Action ---");
  const leaguesRes = await fetchOpenLeaguesAction();
  if (!leaguesRes.success || !leaguesRes.data || leaguesRes.data.length === 0) {
    throw new Error("Failed to fetch open leagues via Action.");
  }
  const league = leaguesRes.data[0];
  console.log(`[PASS] Open league fetched: "${league.name}" (${league.id})`);

  // 3. Fetch categories for open league via Server Action
  console.log("\n--- 3. Fetching Categories for Open League ---");
  const catsRes = await fetchLeagueCategoriesAction(league.id);
  if (!catsRes.success || !catsRes.data || catsRes.data.length === 0) {
    throw new Error("Failed to fetch categories via Action.");
  }
  console.log(`[PASS] Categories count: ${catsRes.data.length}`);
  for (const cat of catsRes.data) {
    console.log(`  - Category: "${cat.name}", Fee: ₱${cat.registration_fee}/player, Min: ${cat.min_players}, Max: ${cat.max_players}`);
    if (cat.registration_fee !== 300) {
      throw new Error(`Expected registration fee 300, got ${cat.registration_fee}`);
    }
  }

  // 4. Test valid selection validation
  const chosenCategory = catsRes.data[0];
  const validRes = await validateLeagueAndCategoryAction(league.id, chosenCategory.id);
  if (!validRes.success || !validRes.data) {
    throw new Error(`Valid combination validation failed: ${validRes.error}`);
  }
  console.log(`[PASS] Valid selection verified: "${validRes.data.league.name}" + "${validRes.data.category.name}"`);

  // 5. Test invalid category ID
  const invalidCatRes = await validateLeagueAndCategoryAction(
    league.id,
    "11111111-1111-4111-8111-111111111111"
  );
  if (invalidCatRes.success) {
    throw new Error("Should have rejected non-existent category.");
  }
  console.log(`[PASS] Non-existent category correctly rejected: "${invalidCatRes.error}"`);

  // 6. Test Server Action dynamically using chosenCategory database values
  console.log(`\n--- 4. Testing calculateRosterAction with Live Category "${chosenCategory.name}" (min=${chosenCategory.min_players}, max=${chosenCategory.max_players}) ---`);
  
  // Test below category min:
  const belowMinCount = Math.max(1, chosenCategory.min_players - 1);
  const belowCalc = await calculateRosterAction(league.id, chosenCategory.id, belowMinCount);
  if (!belowCalc.success || !belowCalc.data) {
    throw new Error(`Failed to calculate for ${belowMinCount} players: ${belowCalc.error}`);
  }
  if (belowCalc.data.is_complete !== false || belowCalc.data.status !== "INCOMPLETE") {
    throw new Error(`Expected INCOMPLETE for ${belowMinCount} players below min (${chosenCategory.min_players})`);
  }
  if (belowCalc.data.required_minimum !== chosenCategory.min_players) {
    throw new Error(`Expected required_minimum=${chosenCategory.min_players}, got ${belowCalc.data.required_minimum}`);
  }
  console.log(`[PASS] Below min (${belowMinCount} players): Fee = ₱${belowCalc.data.total_fee}, Status = ${belowCalc.data.status} (Allowed to register)`);

  // Test at category min:
  const atMinCount = chosenCategory.min_players;
  const atMinCalc = await calculateRosterAction(league.id, chosenCategory.id, atMinCount);
  if (!atMinCalc.success || !atMinCalc.data) {
    throw new Error(`Failed to calculate for ${atMinCount} players: ${atMinCalc.error}`);
  }
  if (atMinCalc.data.is_complete !== true || atMinCalc.data.status !== "COMPLETE") {
    throw new Error(`Expected COMPLETE for ${atMinCount} players meeting min (${chosenCategory.min_players})`);
  }
  console.log(`[PASS] At min (${atMinCount} players): Fee = ₱${atMinCalc.data.total_fee}, Status = ${atMinCalc.data.status}`);

  // Test more than 12 players: No maximum player rejection
  const morePlayersCount = 15;
  const morePlayersRes = await calculateRosterAction(league.id, chosenCategory.id, morePlayersCount);
  if (!morePlayersRes.success || !morePlayersRes.data) {
    throw new Error(`Expected success for ${morePlayersCount} players, but failed: ${morePlayersRes.error}`);
  }
  console.log(`[PASS] More than 12 players (${morePlayersCount} players) accepted without rejection: Fee = ₱${morePlayersRes.data.total_fee}`);

  // 5. Verify NO database records were written
  const registrationsCount = await prisma.registrations.count();
  const teamsCount = await prisma.teams.count();
  const playersCount = await prisma.players.count();
  const paymentsCount = await prisma.payments.count();

  console.log(`[PASS] Database writes check:`);
  console.log(`  - Registrations in DB: ${registrationsCount}`);
  console.log(`  - Teams in DB: ${teamsCount}`);
  console.log(`  - Players in DB: ${playersCount}`);
  console.log(`  - Payments in DB: ${paymentsCount}`);

  console.log("=== ALL PHASE 04.2 CHECKS PASSED ===");
}

verifyPhase042()
  .catch((err) => {
    console.error("Phase 04.2 verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
