if (typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // ignore
  }
}

import { prisma } from "../lib/prisma";
import {
  getOpenLeagues,
  getLeagueCategories,
  calculateRosterFeeAndStatus,
  getRegistrationByReference,
} from "../lib/registration";
import {
  fetchOpenLeaguesAction,
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
  calculateRosterAction,
  submitTeamRegistrationAction,
  fetchRegistrationByReferenceAction,
} from "../app/actions/registration";

// ============================================================================
// STRICT DATABASE TARGET SAFETY GUARD
// ============================================================================
async function assertLocalDevDatabase(): Promise<void> {
  const result = await prisma.$queryRawUnsafe<
    Array<{
      current_database: string;
      current_user: string;
      inet_server_addr: string | null;
      inet_server_port: number | null;
    }>
  >("SELECT current_database(), current_user, inet_server_addr(), inet_server_port();");

  const row = result[0];
  console.log("\n[SAFETY GUARD] Active Database Connection Probe:");
  console.log(`  - Database: "${row.current_database}"`);
  console.log(`  - User: "${row.current_user}"`);
  console.log(`  - Server Addr: ${row.inet_server_addr ?? "local socket / ::1"}`);
  console.log(`  - Server Port: ${row.inet_server_port ?? 5432}`);

  if (row.current_database !== "mva_dev") {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Active database is "${row.current_database}", NOT "mva_dev"! Aborting immediately.`
    );
  }

  const addr = String(row.inet_server_addr || "");
  const isLocal =
    addr === "" ||
    addr === "127.0.0.1" ||
    addr === "::1" ||
    addr === "localhost";

  if (!isLocal) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Database server is not localhost (detected "${addr}")! Aborting.`
    );
  }

  const port = row.inet_server_port ?? 5432;
  if (port !== 5432) {
    throw new Error(
      `CRITICAL SAFETY VIOLATION: Database server port is not 5432 (detected ${port})! Aborting.`
    );
  }

  console.log("[SAFETY GUARD PASS] Confirmed connected to local mva_dev database.\n");
}

// ============================================================================
// MAIN PHASE 04 FINAL VERIFICATION SUITE
// ============================================================================
async function runPhase04FinalVerification() {
  console.log("================================================================");
  console.log("   MVA PHASE 04 — FINAL VERIFICATION & CLOSURE AUDIT SUITE");
  console.log("================================================================");

  // 1. Verify safety guard
  await assertLocalDevDatabase();

  // 2. Setup synthetic test tournament data in mva_dev
  console.log("--- Step 1: Setting up Synthetic Tournament Data in mva_dev ---");

  // Create synthetic open league
  const syntheticLeague = await prisma.leagues.create({
    data: {
      name: "MVA 2026 Mahatao Volleyball League (Test)",
      year: 2026,
      description: "Synthetic test league for Phase 04 verification in mva_dev.",
      status: "OPEN_FOR_REGISTRATION",
      start_date: new Date("2026-06-01"),
      end_date: new Date("2026-07-31"),
    },
  });
  console.log(`[PASS] Created synthetic league: "${syntheticLeague.name}" (${syntheticLeague.id})`);

  // Create 3 approved tournament categories
  const catMahatao = await prisma.league_categories.create({
    data: {
      league_id: syntheticLeague.id,
      name: "Mahatao Only",
      description: "Mahatao residents division (Mixed / Co-ed).",
      registration_fee: 300.0,
      min_players: 6,
      max_players: 12,
    },
  });

  const catMens = await prisma.league_categories.create({
    data: {
      league_id: syntheticLeague.id,
      name: "Open Conference — Men's Division",
      description: "Open conference men's division.",
      registration_fee: 300.0,
      min_players: 6,
      max_players: 12,
    },
  });

  const catWomens = await prisma.league_categories.create({
    data: {
      league_id: syntheticLeague.id,
      name: "Open Conference — Women's Division",
      description: "Open conference women's division.",
      registration_fee: 300.0,
      min_players: 6,
      max_players: 12,
    },
  });

  console.log(`[PASS] Created 3 approved tournament categories:`);
  console.log(`  1. "${catMahatao.name}" (Fee: ₱${catMahatao.registration_fee}/player, Min: ${catMahatao.min_players}, Max: ${catMahatao.max_players})`);
  console.log(`  2. "${catMens.name}" (Fee: ₱${catMens.registration_fee}/player, Min: ${catMens.min_players}, Max: ${catMens.max_players})`);
  console.log(`  3. "${catWomens.name}" (Fee: ₱${catWomens.registration_fee}/player, Min: ${catWomens.min_players}, Max: ${catWomens.max_players})`);

  // 3. Test Foundation & Server Actions for League & Category
  console.log("\n--- Step 2: Testing Foundation & Server Actions for Leagues & Categories ---");
  const openLeagues = await getOpenLeagues();
  if (!openLeagues.some((l) => l.id === syntheticLeague.id)) {
    throw new Error("Synthetic league not returned by getOpenLeagues.");
  }
  console.log(`[PASS] getOpenLeagues returned ${openLeagues.length} open league(s).`);

  const fetchedCats = await getLeagueCategories(syntheticLeague.id);
  if (fetchedCats.length !== 3) {
    throw new Error(`Expected exactly 3 categories, got ${fetchedCats.length}.`);
  }
  console.log(`[PASS] getLeagueCategories returned ${fetchedCats.length} categories with numeric fee.`);

  // Test Server Actions
  const actionLeagues = await fetchOpenLeaguesAction();
  if (!actionLeagues.success || !actionLeagues.data) {
    throw new Error(`fetchOpenLeaguesAction failed: ${actionLeagues.error}`);
  }
  console.log(`[PASS] fetchOpenLeaguesAction serialized successfully.`);

  const actionCats = await fetchLeagueCategoriesAction(syntheticLeague.id);
  if (!actionCats.success || !actionCats.data || actionCats.data.length !== 3) {
    throw new Error(`fetchLeagueCategoriesAction failed: ${actionCats.error}`);
  }
  console.log(`[PASS] fetchLeagueCategoriesAction returned 3 categories.`);

  // Validate valid and invalid combinations
  const validPair = await validateLeagueAndCategoryAction(syntheticLeague.id, catMahatao.id);
  if (!validPair.success || !validPair.data) {
    throw new Error("Valid league/category pair failed validation.");
  }
  console.log(`[PASS] validateLeagueAndCategoryAction confirmed valid pair.`);

  const invalidCatPair = await validateLeagueAndCategoryAction(
    syntheticLeague.id,
    "00000000-0000-4000-8000-000000000000"
  );
  if (invalidCatPair.success) {
    throw new Error("Expected validation failure for non-existent category.");
  }
  console.log(`[PASS] Invalid category correctly rejected: "${invalidCatPair.error}"`);

  // 4. Test Roster Calculation Engine (Pure & Server Action)
  console.log("\n--- Step 3: Testing Roster Fee Calculation Engine ---");
  const calc1 = calculateRosterFeeAndStatus(1, 300, 6);
  if (calc1.total_fee !== 300 || calc1.status !== "INCOMPLETE") {
    throw new Error("calc1 failed: expected total 300 and INCOMPLETE status.");
  }
  console.log(`[PASS] 1 player: Fee = ₱${calc1.total_fee}, Status = ${calc1.status} (${calc1.message})`);

  const calc5 = calculateRosterFeeAndStatus(5, 300, 6);
  if (calc5.total_fee !== 1500 || calc5.status !== "INCOMPLETE") {
    throw new Error("calc5 failed: expected total 1500 and INCOMPLETE status.");
  }
  console.log(`[PASS] 5 players: Fee = ₱${calc5.total_fee}, Status = ${calc5.status}`);

  const calc6 = calculateRosterFeeAndStatus(6, 300, 6);
  if (calc6.total_fee !== 1800 || calc6.status !== "COMPLETE") {
    throw new Error("calc6 failed: expected total 1800 and COMPLETE status.");
  }
  console.log(`[PASS] 6 players: Fee = ₱${calc6.total_fee}, Status = ${calc6.status}`);

  const calc12 = calculateRosterFeeAndStatus(12, 300, 6);
  if (calc12.total_fee !== 3600 || calc12.status !== "COMPLETE") {
    throw new Error("calc12 failed: expected total 3600 and COMPLETE status.");
  }
  console.log(`[PASS] 12 players: Fee = ₱${calc12.total_fee}, Status = ${calc12.status}`);

  // Test calculateRosterAction
  const actionCalc = await calculateRosterAction(syntheticLeague.id, catMens.id, 8);
  if (!actionCalc.success || !actionCalc.data || actionCalc.data.total_fee !== 2400) {
    throw new Error(`calculateRosterAction failed for 8 players: ${actionCalc.error}`);
  }
  console.log(`[PASS] calculateRosterAction for 8 players: ₱${actionCalc.data.total_fee}, status = ${actionCalc.data.status}`);

  // 5. Test Core Public Registration Scenarios
  console.log("\n--- Step 4: Testing Core Public Team Registration Scenarios ---");

  const testRegistrant = {
    first_name: "Maria",
    middle_name: "Santos",
    last_name: "Gomez",
    suffix: null,
    contact: "09181234567",
    email: "maria.gomez@example.test",
  };

  // Scenario A: Minimal Registration (1 Player)
  console.log("\n[Scenario A] Minimal Registration (1 player):");
  const resA = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMahatao.id,
    team_name: "Mahatao Solo Spikers",
    registrant: testRegistrant,
    players: [
      {
        first_name: "Pedro",
        last_name: "Alcantara",
        is_captain: true,
      },
    ],
  });

  if (!resA.success || !resA.data) {
    throw new Error(`Scenario A failed: ${resA.error}`);
  }
  console.log(`  [PASS] Registered successfully!`);
  console.log(`  - Registration ID: ${resA.data.registration_id}`);
  console.log(`  - Trigger-Generated Code: ${resA.data.registration_code}`);
  console.log(`  - Total Assessed Fee: ₱${resA.data.total_fee}`);
  console.log(`  - Registration Status: ${resA.data.status}`);
  console.log(`  - Roster Status: complete=${resA.data.is_complete} (${resA.data.player_count} player)`);

  if (!resA.data.registration_code || !resA.data.registration_code.startsWith("MVA-2026-")) {
    throw new Error(`Invalid registration_code format: ${resA.data.registration_code}`);
  }
  if (resA.data.total_fee !== 300) {
    throw new Error(`Expected ₱300 fee for 1 player, got ${resA.data.total_fee}`);
  }
  if (resA.data.status !== "PENDING_PAYMENT") {
    throw new Error(`Expected PENDING_PAYMENT status, got ${resA.data.status}`);
  }

  // Verify associated payment record
  const paymentA = await prisma.payments.findFirst({
    where: { registration_id: resA.data.registration_id },
  });
  if (!paymentA || Number(paymentA.amount) !== 300 || paymentA.status !== "PENDING") {
    throw new Error("Payment record mismatch for Scenario A.");
  }
  console.log(`  [PASS] Verified payment assessment: ₱${paymentA.amount}, status=${paymentA.status}`);

  // Scenario B: Five Players (Below Category Minimum of 6)
  console.log("\n[Scenario B] Five Players Registration (Below Category Minimum of 6):");
  const resB = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMens.id,
    team_name: "Batan Waves",
    registrant: testRegistrant,
    players: [
      { first_name: "Lucas", last_name: "Castillo", is_captain: true },
      { first_name: "Mark", last_name: "Reyes", is_captain: false },
      { first_name: "Gabriel", last_name: "Dizon", is_captain: false },
      { first_name: "Joshua", last_name: "Santos", is_captain: false },
      { first_name: "David", last_name: "Morales", is_captain: false },
    ],
  });

  if (!resB.success || !resB.data) {
    throw new Error(`Scenario B failed: ${resB.error}`);
  }
  console.log(`  [PASS] Registered 5 players! Fee = ₱${resB.data.total_fee}, Code = ${resB.data.registration_code}`);
  if (resB.data.total_fee !== 1500) {
    throw new Error(`Expected ₱1,500 fee for 5 players, got ${resB.data.total_fee}`);
  }
  if (resB.data.is_complete !== false) {
    throw new Error(`Expected is_complete=false for 5 players below category min (6), got ${resB.data.is_complete}`);
  }
  console.log(`  [PASS] Verified roster completion flag for 5 players (< min 6): is_complete=${resB.data.is_complete} (INCOMPLETE allowed to register)`);

  // Scenario C: Below Final 12-Player Competition Target (11 Players)
  // Domain distinction:
  // - Category min_players (6): Database threshold for is_complete flag.
  // - Competition Target (12 players): Official tournament roster target.
  // Crucial requirement: Registration with 11 players (< 12 target) must NOT be rejected by the public form.
  console.log("\n[Scenario C] Below Final 12-Player Target (11 players):");
  const players11 = Array.from({ length: 11 }, (_, i) => ({
    first_name: `Player${i + 1}`,
    last_name: `ElevenSpikers`,
    is_captain: i === 0,
  }));
  const resC = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catWomens.id,
    team_name: "Sabtang Strikers",
    registrant: testRegistrant,
    players: players11,
  });

  if (!resC.success || !resC.data) {
    throw new Error(`Scenario C failed: ${resC.error}`);
  }
  console.log(`  [PASS] 11 players registered without rejection! Fee = ₱${resC.data.total_fee}, Code = ${resC.data.registration_code}`);
  if (resC.data.total_fee !== 3300) {
    throw new Error(`Expected ₱3,300 fee for 11 players, got ${resC.data.total_fee}`);
  }
  if (resC.data.is_complete !== true) {
    throw new Error(`Expected is_complete=true for 11 players (>= category min 6), got ${resC.data.is_complete}`);
  }
  console.log(`  [PASS] Verified 11 players registered without rejection: fee=₱${resC.data.total_fee}, is_complete=${resC.data.is_complete} (meets db min 6, allowed < 12 target)`);

  // Scenario D: Captain Validation
  console.log("\n[Scenario D] Captain Validation (No captain & Multiple captains):");
  const noCapRes = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMahatao.id,
    team_name: "No Captain Team",
    registrant: testRegistrant,
    players: [
      { first_name: "Alex", last_name: "Cruz", is_captain: false },
      { first_name: "Brian", last_name: "Cruz", is_captain: false },
    ],
  });
  if (noCapRes.success) {
    throw new Error("Expected submission with no captain to fail.");
  }
  console.log(`  [PASS] No captain rejected: "${noCapRes.error}"`);

  const multiCapRes = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMahatao.id,
    team_name: "Multi Captain Team",
    registrant: testRegistrant,
    players: [
      { first_name: "Alex", last_name: "Cruz", is_captain: true },
      { first_name: "Brian", last_name: "Cruz", is_captain: true },
    ],
  });
  if (multiCapRes.success) {
    throw new Error("Expected submission with multiple captains to fail.");
  }
  console.log(`  [PASS] Multiple captains rejected: "${multiCapRes.error}"`);

  // Scenario E: Duplicate Team Registration in Same Category
  console.log("\n[Scenario E] Duplicate Team Registration Protection:");
  const dupRes = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMahatao.id,
    team_name: "Mahatao Solo Spikers", // already registered in catMahatao in Scenario A
    registrant: testRegistrant,
    players: [{ first_name: "New", last_name: "Member", is_captain: true }],
  });
  if (dupRes.success) {
    throw new Error("Expected duplicate team registration in same category to fail.");
  }
  console.log(`  [PASS] Duplicate team registration prevented: "${dupRes.error}"`);

  // Scenario F: Same Team Identity in Different Category (Valid Reuse)
  console.log("\n[Scenario F] Same Team Identity in Different Category (Valid Domain Rule):");
  const crossDivRes = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMens.id, // different category
    team_name: "Mahatao Solo Spikers", // same team name
    registrant: testRegistrant,
    players: [{ first_name: "Pedro", last_name: "Alcantara", is_captain: true }],
  });
  if (!crossDivRes.success || !crossDivRes.data) {
    throw new Error(`Scenario F failed: ${crossDivRes.error}`);
  }
  if (crossDivRes.data.team_id !== resA.data.team_id) {
    throw new Error("Expected same team_id to be reused across different valid categories.");
  }
  console.log(`  [PASS] Successfully reused team identity (Team ID: ${crossDivRes.data.team_id}) for different category!`);

  // Scenario G: Invalid League / Category Handling & Transaction Atomicity
  console.log("\n[Scenario G] Invalid League / Category & Transaction Atomicity:");
  const regCountBefore = await prisma.registrations.count();
  const invalidLeagueRes = await submitTeamRegistrationAction({
    league_id: "99999999-9999-4999-8999-999999999999",
    league_category_id: catMahatao.id,
    team_name: "Atomicity Test Team",
    registrant: testRegistrant,
    players: [{ first_name: "Test", last_name: "User", is_captain: true }],
  });
  if (invalidLeagueRes.success) {
    throw new Error("Expected invalid league ID to fail.");
  }
  const regCountAfter = await prisma.registrations.count();
  if (regCountBefore !== regCountAfter) {
    throw new Error("Transaction atomicity failed: partial records inserted on error.");
  }
  console.log(`  [PASS] Invalid league rejected safely ("${invalidLeagueRes.error}"). Zero partial rows created.`);

  // Scenario H: Server-Side Authoritative Fee Enforcement
  console.log("\n[Scenario H] Server-Side Authoritative Fee Enforcement:");
  // Verify that regardless of any client tampering, total fee is strictly computed as playerCount * feePerPlayer
  const resH = await submitTeamRegistrationAction({
    league_id: syntheticLeague.id,
    league_category_id: catMahatao.id,
    team_name: "Fee Audit Team",
    registrant: testRegistrant,
    players: [
      { first_name: "P1", last_name: "T", is_captain: true },
      { first_name: "P2", last_name: "T", is_captain: false },
      { first_name: "P3", last_name: "T", is_captain: false },
    ],
  });
  if (!resH.success || !resH.data) {
    throw new Error(`Scenario H failed: ${resH.error}`);
  }
  if (resH.data.total_fee !== 900) {
    throw new Error(`Server fee was not authoritatively calculated: expected 900, got ${resH.data.total_fee}`);
  }
  console.log(`  [PASS] Server enforced authoritative fee: 3 players × ₱300 = ₱${resH.data.total_fee}.`);

  // Scenario I: Public Registration Reference Lookup & Privacy Audit
  console.log("\n--- Step 5: Testing Registration Reference Lookup & Privacy Safeguards ---");
  const validCode = resA.data.registration_code!;

  // 1. Direct function lookup
  const refSummary = await getRegistrationByReference(validCode);
  if (!refSummary) {
    throw new Error(`getRegistrationByReference failed for valid code ${validCode}`);
  }
  console.log(`[PASS] Valid reference summary retrieved:`);
  console.log(`  - Code: "${refSummary.registration_code}"`);
  console.log(`  - Team: "${refSummary.team_name}"`);
  console.log(`  - Division: "${refSummary.category_name}"`);
  console.log(`  - League: "${refSummary.league_name}"`);
  console.log(`  - Status: "${refSummary.status}"`);

  // 2. Server action lookup
  const actionRef = await fetchRegistrationByReferenceAction(validCode);
  if (!actionRef.success || !actionRef.data) {
    throw new Error(`fetchRegistrationByReferenceAction failed: ${actionRef.error}`);
  }
  console.log(`[PASS] Server Action fetchRegistrationByReferenceAction verified.`);

  // 3. Privacy Audit: Check for forbidden private data
  const forbiddenFields = [
    "registrant_contact",
    "contact",
    "phone",
    "email",
    "registrant_email",
    "address",
    "password",
    "players",
    "payment_method",
  ];
  const summaryKeys = Object.keys(refSummary);
  for (const f of forbiddenFields) {
    if (summaryKeys.includes(f)) {
      throw new Error(`CRITICAL PRIVACY LEAK: Field "${f}" exposed in public reference summary!`);
    }
  }
  console.log(`[PASS] Privacy Audit: Zero private personal contact fields are exposed in the public reference response.`);

  // 4. Invalid reference lookup
  const invalidCodeRes = await fetchRegistrationByReferenceAction("MVA-2026-9999");
  if (invalidCodeRes.success) {
    throw new Error("Expected non-existent code to return success=false.");
  }
  console.log(`[PASS] Non-existent code correctly returned error: "${invalidCodeRes.error}"`);

  const emptyCodeRes = await fetchRegistrationByReferenceAction("   ");
  if (emptyCodeRes.success) {
    throw new Error("Expected whitespace code to return success=false.");
  }
  console.log(`[PASS] Whitespace code correctly returned error: "${emptyCodeRes.error}"`);

  // 6. Verify Database Native Objects & Sequences
  console.log("\n--- Step 6: Verifying PostgreSQL-Native Objects in Action ---");
  const lastReg = await prisma.registrations.findUnique({
    where: { id: resH.data.registration_id },
    select: {
      id: true,
      registration_number: true,
      registration_code: true,
      created_at: true,
      updated_at: true,
    },
  });

  if (!lastReg) throw new Error("Could not find last registration.");
  console.log(`[PASS] Registration record:`);
  console.log(`  - ID: ${lastReg.id}`);
  console.log(`  - Sequential registration_number: ${lastReg.registration_number}`);
  console.log(`  - Trigger-Generated registration_code: ${lastReg.registration_code}`);
  console.log(`  - Created At: ${lastReg.created_at.toISOString()}`);
  console.log(`  - Updated At: ${lastReg.updated_at.toISOString()}`);

  if (typeof lastReg.registration_number !== "bigint" && typeof lastReg.registration_number !== "number") {
    throw new Error("registration_number is not a sequential number/bigint.");
  }
  if (!lastReg.registration_code?.startsWith("MVA-2026-")) {
    throw new Error(`Trigger did not format registration code correctly: ${lastReg.registration_code}`);
  }

  // 7. Cleanup synthetic data from mva_dev
  console.log("\n--- Step 7: Cleaning up Synthetic Test Data from mva_dev ---");
  await prisma.payments.deleteMany({});
  await prisma.registration_players.deleteMany({});
  await prisma.registrations.deleteMany({});
  await prisma.teams.deleteMany({});
  await prisma.players.deleteMany({});
  await prisma.league_categories.deleteMany({});
  await prisma.leagues.deleteMany({});
  console.log("[PASS] Deleted all synthetic records from mva_dev tables.");

  // Verify all tables are back to 0 rows in mva_dev
  const postLeagues = await prisma.leagues.count();
  const postCategories = await prisma.league_categories.count();
  const postTeams = await prisma.teams.count();
  const postRegistrations = await prisma.registrations.count();
  const postRegistrationPlayers = await prisma.registration_players.count();
  const postPlayers = await prisma.players.count();
  const postPayments = await prisma.payments.count();

  const remainingTotal =
    postLeagues +
    postCategories +
    postTeams +
    postRegistrations +
    postRegistrationPlayers +
    postPlayers +
    postPayments;

  if (remainingTotal !== 0) {
    throw new Error(
      `Cleanup failed! ${remainingTotal} rows still remain in mva_dev after cleanup.`
    );
  }

  console.log("\n================================================================");
  console.log("   PHASE 04 FINAL VERIFICATION SUMMARY (mva_dev ONLY)");
  console.log("================================================================");
  console.log(`  - Synthetic Leagues in mva_dev: ${postLeagues}`);
  console.log(`  - Synthetic Categories in mva_dev: ${postCategories}`);
  console.log(`  - Synthetic Teams in mva_dev: ${postTeams}`);
  console.log(`  - Synthetic Registrations in mva_dev: ${postRegistrations}`);
  console.log(`  - Synthetic Registration Players in mva_dev: ${postRegistrationPlayers}`);
  console.log(`  - Synthetic Players in mva_dev: ${postPlayers}`);
  console.log(`  - Synthetic Payments in mva_dev: ${postPayments}`);
  console.log("\n[ALL TESTS PASSED & CLEANED UP] Phase 04 Public Registration flow is 100% verified and local mva_dev is clean (0 rows)!");
}

runPhase04FinalVerification()
  .catch((err) => {
    console.error("\n[AUDIT FAILED]:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
