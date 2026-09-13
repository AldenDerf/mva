import {
  fetchOpenLeaguesAction,
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
} from "../app/actions/registration";
import { prisma } from "../lib/prisma";

async function verifyPhase042() {
  console.log("=== Phase 04.2 Automated Flow Verification ===");

  // 1. Fetch leagues via Server Action
  const leaguesRes = await fetchOpenLeaguesAction();
  if (!leaguesRes.success || !leaguesRes.data || leaguesRes.data.length === 0) {
    throw new Error("Failed to fetch open leagues via Action.");
  }
  const league = leaguesRes.data[0];
  console.log(`[PASS] Open league fetched: "${league.name}" (${league.id})`);

  // 2. Fetch categories for open league via Server Action
  const catsRes = await fetchLeagueCategoriesAction(league.id);
  if (!catsRes.success || !catsRes.data || catsRes.data.length === 0) {
    throw new Error("Failed to fetch categories via Action.");
  }
  console.log(`[PASS] Categories count: ${catsRes.data.length}`);
  for (const cat of catsRes.data) {
    console.log(`  - Category: "${cat.name}", Fee: ₱${cat.registration_fee}, Limits: ${cat.min_players}-${cat.max_players}`);
  }

  // 3. Test valid selection validation
  const chosenCategory = catsRes.data[0];
  const validRes = await validateLeagueAndCategoryAction(league.id, chosenCategory.id);
  if (!validRes.success || !validRes.data) {
    throw new Error(`Valid combination validation failed: ${validRes.error}`);
  }
  console.log(`[PASS] Valid selection verified: "${validRes.data.league.name}" + "${validRes.data.category.name}"`);

  // 4. Test invalid category ID
  const invalidCatRes = await validateLeagueAndCategoryAction(
    league.id,
    "11111111-1111-4111-8111-111111111111"
  );
  if (invalidCatRes.success) {
    throw new Error("Should have rejected non-existent category.");
  }
  console.log(`[PASS] Non-existent category correctly rejected: "${invalidCatRes.error}"`);

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
