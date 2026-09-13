import {
  getOpenLeagues,
  getLeagueCategories,
  getOpenLeagueById,
  validateLeagueAndCategory,
} from "../lib/registration";
import {
  fetchOpenLeaguesAction,
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
} from "../app/actions/registration";
import { prisma } from "../lib/prisma";

async function runVerification() {
  console.log("=== Phase 04.1 Verification Starting ===");

  // 1. Verify getOpenLeagues
  const openLeagues = await getOpenLeagues();
  console.log(`[PASS] getOpenLeagues returned ${openLeagues.length} leagues.`);
  if (openLeagues.length === 0) {
    throw new Error("Expected at least 1 open league in test data.");
  }

  const sampleLeague = openLeagues[0];
  console.log(`[PASS] Sample open league: "${sampleLeague.name}" (ID: ${sampleLeague.id})`);
  if (sampleLeague.status !== "OPEN_FOR_REGISTRATION") {
    throw new Error("Returned league has non-open status!");
  }

  // 2. Verify getOpenLeagueById
  const fetchedLeague = await getOpenLeagueById(sampleLeague.id);
  if (!fetchedLeague || fetchedLeague.id !== sampleLeague.id) {
    throw new Error("getOpenLeagueById failed to find existing open league.");
  }
  console.log("[PASS] getOpenLeagueById verified.");

  const nonExistentLeague = await getOpenLeagueById("00000000-0000-4000-8000-000000000000");
  if (nonExistentLeague !== null) {
    throw new Error("getOpenLeagueById should return null for non-existent league.");
  }
  console.log("[PASS] getOpenLeagueById null handling verified.");

  // 3. Verify getLeagueCategories
  const categories = await getLeagueCategories(sampleLeague.id);
  console.log(`[PASS] getLeagueCategories returned ${categories.length} categories.`);
  if (categories.length === 0) {
    throw new Error("Expected categories for sample league.");
  }

  const sampleCategory = categories[0];
  console.log(
    `[PASS] Sample category: "${sampleCategory.name}", Fee: ${sampleCategory.registration_fee} (type: ${typeof sampleCategory.registration_fee}), Min: ${sampleCategory.min_players}, Max: ${sampleCategory.max_players}`
  );
  if (typeof sampleCategory.registration_fee !== "number") {
    throw new Error("registration_fee must be serialized as number.");
  }

  // 4. Verify category error handling on invalid/non-existent league
  let errorCaught = false;
  try {
    await getLeagueCategories("invalid-id-format");
  } catch (err: unknown) {
    errorCaught = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[PASS] Invalid ID correctly rejected: "${msg}"`);
  }
  if (!errorCaught) {
    throw new Error("Expected error for invalid league ID format.");
  }

  errorCaught = false;
  try {
    await getLeagueCategories("00000000-0000-4000-8000-000000000000");
  } catch (err: unknown) {
    errorCaught = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[PASS] Non-existent league correctly rejected: "${msg}"`);
  }
  if (!errorCaught) {
    throw new Error("Expected error for non-existent league.");
  }

  // 5. Verify validateLeagueAndCategory
  const validResult = await validateLeagueAndCategory(sampleLeague.id, sampleCategory.id);
  if (!validResult.valid || !validResult.league || !validResult.category) {
    throw new Error("validateLeagueAndCategory failed for valid pair.");
  }
  console.log("[PASS] validateLeagueAndCategory valid pair verified.");

  const invalidCatResult = await validateLeagueAndCategory(
    sampleLeague.id,
    "00000000-0000-4000-8000-000000000000"
  );
  if (invalidCatResult.valid) {
    throw new Error("validateLeagueAndCategory should fail for non-existent category.");
  }
  console.log(`[PASS] validateLeagueAndCategory invalid category correctly rejected: "${invalidCatResult.error}"`);

  // 6. Verify Server Actions
  const actionLeagues = await fetchOpenLeaguesAction();
  if (!actionLeagues.success || !actionLeagues.data || actionLeagues.data.length === 0) {
    throw new Error("fetchOpenLeaguesAction failed.");
  }
  console.log(`[PASS] fetchOpenLeaguesAction returned ${actionLeagues.data.length} serialized leagues.`);

  const actionCategories = await fetchLeagueCategoriesAction(sampleLeague.id);
  if (!actionCategories.success || !actionCategories.data || actionCategories.data.length === 0) {
    throw new Error("fetchLeagueCategoriesAction failed.");
  }
  console.log(`[PASS] fetchLeagueCategoriesAction returned ${actionCategories.data.length} categories.`);

  const actionValidation = await validateLeagueAndCategoryAction(
    sampleLeague.id,
    sampleCategory.id
  );
  if (!actionValidation.success || !actionValidation.data) {
    throw new Error("validateLeagueAndCategoryAction failed.");
  }
  console.log("[PASS] validateLeagueAndCategoryAction succeeded.");

  console.log("=== ALL PHASE 04.1 VERIFICATIONS PASSED ===");
}

runVerification()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
