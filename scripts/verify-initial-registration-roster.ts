import {
  getOpenLeagues,
  getLeagueCategories,
  calculateRosterFeeAndStatus,
  getRegistrationByReference,
} from "../lib/registration";
import {
  calculateRosterAction,
  submitTeamRegistrationAction,
} from "../app/actions/registration";
import { prisma } from "../lib/prisma";

async function verifyInitialRegistrationRoster() {
  console.log("=== Initial Registration Roster Verification ===");

  // Fetch open league and category
  const leagues = await getOpenLeagues();
  if (leagues.length === 0) throw new Error("No open leagues found.");
  const league = leagues[0];

  const categories = await getLeagueCategories(league.id);
  if (categories.length === 0) throw new Error("No categories found.");
  const category = categories[0];

  console.log(`[PASS] Using League: "${league.name}" (${league.id})`);
  console.log(`[PASS] Using Category: "${category.name}" (fee=₱${category.registration_fee}/player, min_players=${category.min_players})`);

  // Target requirement (e.g. 12 or database category setting)
  const finalTarget = 12;

  // 1. Pure calculation tests
  console.log("\n--- 1. Testing calculateRosterFeeAndStatus for 1, 5, 11, 12, 15 players ---");
  const testCases = [
    { count: 1, expectedFee: 300, expectedComplete: false, expectedStatus: "INCOMPLETE" },
    { count: 5, expectedFee: 1500, expectedComplete: false, expectedStatus: "INCOMPLETE" },
    { count: 11, expectedFee: 3300, expectedComplete: false, expectedStatus: "INCOMPLETE" },
    { count: 12, expectedFee: 3600, expectedComplete: true, expectedStatus: "COMPLETE" },
    { count: 15, expectedFee: 4500, expectedComplete: true, expectedStatus: "COMPLETE" },
  ];

  for (const tc of testCases) {
    const calc = calculateRosterFeeAndStatus(tc.count, 300, finalTarget);
    if (calc.total_fee !== tc.expectedFee) {
      throw new Error(`Expected fee ${tc.expectedFee} for ${tc.count} players, got ${calc.total_fee}`);
    }
    if (calc.is_complete !== tc.expectedComplete) {
      throw new Error(`Expected is_complete=${tc.expectedComplete} for ${tc.count} players, got ${calc.is_complete}`);
    }
    if (calc.status !== tc.expectedStatus) {
      throw new Error(`Expected status=${tc.expectedStatus} for ${tc.count} players, got ${calc.status}`);
    }
    console.log(`[PASS] ${tc.count} player(s): Fee = ₱${calc.total_fee}, Status = ${calc.status}`);
  }

  // 2. Server action calculation tests (especially 15 players > previous max)
  console.log("\n--- 2. Testing calculateRosterAction with no maximum-player rejection ---");
  for (const count of [1, 5, 11, 12, 15, 20]) {
    const actionRes = await calculateRosterAction(league.id, category.id, count);
    if (!actionRes.success || !actionRes.data) {
      throw new Error(`calculateRosterAction failed for ${count} players: ${actionRes.error}`);
    }
    console.log(`[PASS] calculateRosterAction accepted ${count} players: Fee = ₱${actionRes.data.total_fee}, Status = ${actionRes.data.status}`);
  }

  // 3. Database submission tests for: 1, 5, 11, 12, 15 players
  console.log("\n--- 3. Testing live initial registrations: 1, 5, 11, 12, 15 players ---");
  const countsToTest = [1, 5, 11, 12, 15];
  const createdRegistrationIds: string[] = [];
  const createdTeamIds: string[] = [];

  for (const count of countsToTest) {
    const testTeamName = `Test Team ${count}P ${Date.now()}`;
    const players = Array.from({ length: count }, (_, idx) => ({
      first_name: `Player${idx + 1}`,
      last_name: `Test${idx + 1}`,
      is_captain: idx === 0, // Exactly one designated captain
    }));

    const submitRes = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_mode: "new",
      new_team_name: testTeamName,
      registrant: {
        first_name: "Registrant",
        last_name: `User${count}`,
        contact: "09170000000",
        email: `reg${count}@example.com`,
      },
      players,
    });

    if (!submitRes.success || !submitRes.data) {
      throw new Error(`Failed to submit registration for ${count} players: ${submitRes.error}`);
    }

    const created = submitRes.data;
    createdRegistrationIds.push(created.registration_id);
    createdTeamIds.push(created.team_id);

    const expectedFee = count * 300;
    if (created.total_fee !== expectedFee) {
      throw new Error(`Fee mismatch for ${count} players: expected ${expectedFee}, got ${created.total_fee}`);
    }
    if (created.status !== "PENDING_PAYMENT") {
      throw new Error(`Status mismatch for ${count} players: expected PENDING_PAYMENT, got ${created.status}`);
    }
    if (!created.registration_code) {
      throw new Error(`Missing registration_code for ${count} players registration.`);
    }

    // Verify registration reference lookup
    const refSummary = await getRegistrationByReference(created.registration_code);
    if (!refSummary) {
      throw new Error(`getRegistrationByReference failed for ${created.registration_code}`);
    }
    if (refSummary.team_name !== testTeamName) {
      throw new Error(`Team name mismatch in reference lookup.`);
    }

    console.log(
      `[PASS] Accepted ${count} player(s) -> Code: ${created.registration_code}, Fee: ₱${created.total_fee}, Status: ${created.status}, Complete: ${created.is_complete}`
    );
  }

  // 4. Cleanup all created test records
  console.log("\n--- 4. Cleaning up test registrations ---");
  for (const regId of createdRegistrationIds) {
    await prisma.payments.deleteMany({ where: { registration_id: regId } });
    await prisma.registration_players.deleteMany({ where: { registration_id: regId } });
    await prisma.registrations.delete({ where: { id: regId } });
  }
  for (const teamId of createdTeamIds) {
    await prisma.teams.delete({ where: { id: teamId } });
  }

  // Clean up created test player rows
  await prisma.players.deleteMany({
    where: {
      first_name: { startsWith: "Player" },
      last_name: { startsWith: "Test" },
      registration_players: { none: {} },
    },
  });

  console.log("[PASS] All test records cleanly removed. Database is pristine.");
  console.log("\n=== ALL INITIAL REGISTRATION ROSTER VERIFICATIONS PASSED ===");
}

verifyInitialRegistrationRoster()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
