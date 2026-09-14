import {
  getOpenLeagues,
  getLeagueCategories,
  getRegistrationByReference,
} from "../lib/registration";
import { submitTeamRegistrationAction } from "../app/actions/registration";
import { prisma } from "../lib/prisma";

async function verifySimplifiedTeamRegistration() {
  console.log("=== Simplified Public Team Registration Verification ===");

  const leagues = await getOpenLeagues();
  if (leagues.length === 0) throw new Error("No open leagues found.");
  const league = leagues[0];

  const categories = await getLeagueCategories(league.id);
  if (categories.length === 0) throw new Error("No categories found.");
  const category = categories[0];

  console.log(`[SETUP] League: "${league.name}", Category: "${category.name}"`);

  const createdRegistrationIds: string[] = [];
  const createdTeamIds: string[] = [];

  const testRegistrant = {
    first_name: "Elena",
    last_name: "Valdez",
    contact: "09179876543",
    email: "elena.valdez@example.com",
  };

  try {
    // 1. Verify Team Name is required
    console.log("\n--- 1. Testing Team Name Requirement ---");
    const emptyTeamRes = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: "   ",
      registrant: testRegistrant,
      players: [{ first_name: "Juan", last_name: "Luna", is_captain: true }],
    });
    if (emptyTeamRes.success) {
      throw new Error("Expected submission with empty team name to fail, but succeeded.");
    }
    console.log(`[PASS] Empty team name correctly rejected: "${emptyTeamRes.error}"`);

    // 2. Verify at least 1 player is required (empty roster rejected)
    console.log("\n--- 2. Testing Empty Roster Rejection ---");
    const emptyRosterRes = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: "Valid Team Name",
      registrant: testRegistrant,
      players: [],
    });
    if (emptyRosterRes.success) {
      throw new Error("Expected submission with empty roster to fail, but succeeded.");
    }
    console.log(`[PASS] Empty roster correctly rejected: "${emptyRosterRes.error}"`);

    // 3. Verify Captain must be explicitly selected (no captain rejected)
    console.log("\n--- 3. Testing Captain Explicit Selection ---");
    const noCaptainRes = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: "Captain Test Team",
      registrant: testRegistrant,
      players: [
        { first_name: "Player", last_name: "One", is_captain: false },
        { first_name: "Player", last_name: "Two", is_captain: false },
      ],
    });
    if (noCaptainRes.success) {
      throw new Error("Expected submission with no captain to fail, but succeeded.");
    }
    console.log(`[PASS] No captain correctly rejected: "${noCaptainRes.error}"`);

    // 4. Test Single Player Registration (1 player allowed, fee = ₱300)
    console.log("\n--- 4. Testing 1 Player Registration ---");
    const team1Name = `Solo Spikers ${Date.now()}`;
    const res1 = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: team1Name,
      registrant: testRegistrant,
      players: [{ first_name: "Solo", last_name: "Spiker", is_captain: true }],
    });
    if (!res1.success || !res1.data) {
      throw new Error(`Failed to register 1 player: ${res1.error}`);
    }
    createdRegistrationIds.push(res1.data.registration_id);
    createdTeamIds.push(res1.data.team_id);
    console.log(`[PASS] 1 player registered: ID=${res1.data.registration_id}, Code=${res1.data.registration_code}, Fee=₱${res1.data.total_fee}`);
    if (res1.data.total_fee !== 300) {
      throw new Error(`Expected fee 300, got ${res1.data.total_fee}`);
    }

    // 5. Test Duplicate Registration Protection
    console.log("\n--- 5. Testing Server-side Duplicate Registration Protection ---");
    const dupRes = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: team1Name,
      registrant: testRegistrant,
      players: [{ first_name: "Another", last_name: "Player", is_captain: true }],
    });
    if (dupRes.success) {
      throw new Error("Expected duplicate team registration in same category to fail, but succeeded.");
    }
    console.log(`[PASS] Duplicate team registration correctly rejected: "${dupRes.error}"`);

    // 6. Test Fewer than 12 Players Registration (e.g. 5 players, fee = ₱1,500)
    console.log("\n--- 6. Testing Fewer Than 12 Players Registration ---");
    const team5Name = `Five Spikers ${Date.now()}`;
    const players5 = Array.from({ length: 5 }, (_, i) => ({
      first_name: `Player${i + 1}`,
      last_name: `TeamFive`,
      is_captain: i === 0,
    }));
    const res5 = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: team5Name,
      registrant: testRegistrant,
      players: players5,
    });
    if (!res5.success || !res5.data) {
      throw new Error(`Failed to register 5 players: ${res5.error}`);
    }
    createdRegistrationIds.push(res5.data.registration_id);
    createdTeamIds.push(res5.data.team_id);
    console.log(`[PASS] 5 players registered: Code=${res5.data.registration_code}, Fee=₱${res5.data.total_fee}`);
    if (res5.data.total_fee !== 1500) {
      throw new Error(`Expected fee 1500, got ${res5.data.total_fee}`);
    }

    // 7. Test Exactly 12 Players Registration (target roster requirement satisfied, fee = ₱3,600)
    console.log("\n--- 7. Testing 12 Players Registration ---");
    const team12Name = `Twelve Spikers ${Date.now()}`;
    const players12 = Array.from({ length: 12 }, (_, i) => ({
      first_name: `Player${i + 1}`,
      last_name: `TeamTwelve`,
      is_captain: i === 0,
    }));
    const res12 = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: team12Name,
      registrant: testRegistrant,
      players: players12,
    });
    if (!res12.success || !res12.data) {
      throw new Error(`Failed to register 12 players: ${res12.error}`);
    }
    createdRegistrationIds.push(res12.data.registration_id);
    createdTeamIds.push(res12.data.team_id);
    console.log(`[PASS] 12 players registered: Code=${res12.data.registration_code}, Fee=₱${res12.data.total_fee}, Complete=${res12.data.is_complete}`);
    if (res12.data.total_fee !== 3600) {
      throw new Error(`Expected fee 3600, got ${res12.data.total_fee}`);
    }

    // 8. Test More Than 12 Players Registration (e.g. 16 players, fee = ₱4,800, no max limit rejection)
    console.log("\n--- 8. Testing More Than 12 Players Registration ---");
    const team16Name = `Sixteen Spikers ${Date.now()}`;
    const players16 = Array.from({ length: 16 }, (_, i) => ({
      first_name: `Player${i + 1}`,
      last_name: `TeamSixteen`,
      is_captain: i === 0,
    }));
    const res16 = await submitTeamRegistrationAction({
      league_id: league.id,
      league_category_id: category.id,
      team_name: team16Name,
      registrant: testRegistrant,
      players: players16,
    });
    if (!res16.success || !res16.data) {
      throw new Error(`Failed to register 16 players: ${res16.error}`);
    }
    createdRegistrationIds.push(res16.data.registration_id);
    createdTeamIds.push(res16.data.team_id);
    console.log(`[PASS] 16 players registered: Code=${res16.data.registration_code}, Fee=₱${res16.data.total_fee}`);
    if (res16.data.total_fee !== 4800) {
      throw new Error(`Expected fee 4800, got ${res16.data.total_fee}`);
    }

    // 9. Verify reference code lookup for registered team
    console.log("\n--- 9. Testing Registration Reference Lookup ---");
    const refCode = res16.data.registration_code!;
    const refSummary = await getRegistrationByReference(refCode);
    if (!refSummary) {
      throw new Error(`Failed to lookup registration by reference code: ${refCode}`);
    }
    console.log(`[PASS] Registration reference found: Team="${refSummary.team_name}", Code="${refSummary.registration_code}", Status="${refSummary.status}"`);
  } finally {
    // 10. Clean up test records
    console.log("\n--- 10. Cleaning up test records ---");
    for (const regId of createdRegistrationIds) {
      await prisma.payments.deleteMany({ where: { registration_id: regId } });
      await prisma.registration_players.deleteMany({ where: { registration_id: regId } });
      await prisma.registrations.delete({ where: { id: regId } });
    }
    for (const teamId of createdTeamIds) {
      await prisma.teams.delete({ where: { id: teamId } });
    }
    await prisma.players.deleteMany({
      where: {
        last_name: { in: ["Spiker", "TeamFive", "TeamTwelve", "TeamSixteen"] },
        registration_players: { none: {} },
      },
    });
    console.log("[PASS] Database restored to clean state.");
  }

  console.log("\n=== ALL SIMPLIFIED REGISTRATION VERIFICATIONS PASSED ===");
}

verifySimplifiedTeamRegistration()
  .catch((err) => {
    console.error("Verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
