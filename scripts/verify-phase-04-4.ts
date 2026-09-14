import {
  getOpenLeagues,
  getLeagueCategories,
  getRegistrationByReference,
} from "../lib/registration";
import {
  fetchRegistrationByReferenceAction,
  submitTeamRegistrationAction,
} from "../app/actions/registration";
import { prisma } from "../lib/prisma";

async function verifyPhase044() {
  console.log("=== Phase 04.4 Registration Success & Reference Verification ===");

  // 1. Check existing test registrations in DB
  const existingRegistrations = await prisma.registrations.findMany({
    where: { registration_code: { not: null } },
    take: 3,
  });

  if (existingRegistrations.length === 0) {
    throw new Error("Expected existing registrations with registration_code in database.");
  }

  const sampleReg = existingRegistrations[0];
  const sampleCode = sampleReg.registration_code!;
  console.log(`[PASS] Found existing registration with code: "${sampleCode}"`);

  // 2. Test getRegistrationByReference with existing code
  console.log("\n--- 1. Testing getRegistrationByReference with existing code ---");
  const summary = await getRegistrationByReference(sampleCode);
  if (!summary) {
    throw new Error(`getRegistrationByReference failed for valid code: ${sampleCode}`);
  }

  console.log("[PASS] Retrieved registration reference summary:");
  console.log(`  - Code: ${summary.registration_code}`);
  console.log(`  - Team: ${summary.team_name}`);
  console.log(`  - Division: ${summary.category_name}`);
  console.log(`  - League: ${summary.league_name}`);
  console.log(`  - Status: ${summary.status}`);
  console.log(`  - Submitted At: ${summary.submitted_at}`);

  if (summary.registration_code !== sampleCode) {
    throw new Error(`Code mismatch: expected ${sampleCode}, got ${summary.registration_code}`);
  }
  if (!summary.team_name || !summary.category_name || !summary.league_name) {
    throw new Error("Summary is missing team, category, or league name.");
  }

  // 3. Verify NO sensitive personal details in the summary
  const summaryKeys = Object.keys(summary);
  const forbiddenKeys = [
    "registrant_contact",
    "contact",
    "phone",
    "email",
    "registrant_email",
    "address",
    "players",
    "password",
  ];
  for (const fKey of forbiddenKeys) {
    if (summaryKeys.includes(fKey)) {
      throw new Error(`Sensitive key "${fKey}" exposed in public reference summary!`);
    }
  }
  console.log("[PASS] Privacy confirmed: No sensitive personal contact fields are exposed in reference summary.");

  // 4. Test non-existent and invalid reference codes
  console.log("\n--- 2. Testing non-existent and invalid codes ---");
  const nonExistent = await getRegistrationByReference("MVA-2026-999999");
  if (nonExistent !== null) {
    throw new Error("Expected null for non-existent code.");
  }
  console.log("[PASS] Non-existent reference code returns null.");

  const emptyCode = await getRegistrationByReference("");
  if (emptyCode !== null) {
    throw new Error("Expected null for empty code.");
  }
  console.log("[PASS] Empty reference code returns null.");

  const nullCode = await getRegistrationByReference(null);
  if (nullCode !== null) {
    throw new Error("Expected null for null code.");
  }
  console.log("[PASS] Null reference code returns null.");

  // 5. Test fetchRegistrationByReferenceAction Server Action
  console.log("\n--- 3. Testing fetchRegistrationByReferenceAction ---");
  const actionRes = await fetchRegistrationByReferenceAction(sampleCode);
  if (!actionRes.success || !actionRes.data) {
    throw new Error(`fetchRegistrationByReferenceAction failed: ${actionRes.error}`);
  }
  if (actionRes.data.registration_code !== sampleCode) {
    throw new Error("Action data code mismatch.");
  }
  console.log(`[PASS] fetchRegistrationByReferenceAction succeeded for "${sampleCode}".`);

  const actionFailRes = await fetchRegistrationByReferenceAction("MVA-INVALID-CODE");
  if (actionFailRes.success) {
    throw new Error("Action should fail for invalid code.");
  }
  if (actionFailRes.error !== "Registration reference not found.") {
    throw new Error(`Unexpected error message: "${actionFailRes.error}"`);
  }
  console.log(`[PASS] fetchRegistrationByReferenceAction returned friendly error for invalid code: "${actionFailRes.error}"`);

  // 6. Test full submission flow and subsequent reference lookup
  console.log("\n--- 4. Testing End-to-End Submission -> Reference Lookup ---");
  const leagues = await getOpenLeagues();
  if (leagues.length === 0) throw new Error("No open leagues found.");
  const league = leagues[0];

  const categories = await getLeagueCategories(league.id);
  if (categories.length === 0) throw new Error("No categories found.");
  const category = categories[0];

  const testTeamName = `Success Ref Spikers ${Date.now()}`;
  const submitRes = await submitTeamRegistrationAction({
    league_id: league.id,
    league_category_id: category.id,
    team_mode: "new",
    new_team_name: testTeamName,
    registrant: {
      first_name: "Teresa",
      last_name: "Abad",
      contact: "09181234567",
      email: "teresa.abad@example.com",
    },
    players: [
      {
        first_name: "Roberto",
        last_name: "Castillo",
        is_captain: true,
      },
      {
        first_name: "Carlos",
        last_name: "Mendoza",
        is_captain: false,
      },
    ],
  });

  if (!submitRes.success || !submitRes.data) {
    throw new Error(`Submission failed: ${submitRes.error}`);
  }

  const newReg = submitRes.data;
  console.log(`[PASS] Submitted test registration: ID=${newReg.registration_id}, Code=${newReg.registration_code}`);
  if (!newReg.registration_code) {
    throw new Error("Expected registration_code from database trigger.");
  }

  // Now verify that getRegistrationByReference finds this exact newly created registration
  const lookupSummary = await getRegistrationByReference(newReg.registration_code);
  if (!lookupSummary) {
    throw new Error(`Failed to lookup newly created registration with code: ${newReg.registration_code}`);
  }

  console.log(`[PASS] Newly created registration verified via reference lookup:`);
  console.log(`  - Team: ${lookupSummary.team_name}`);
  console.log(`  - Division: ${lookupSummary.category_name}`);
  console.log(`  - League: ${lookupSummary.league_name}`);
  console.log(`  - Status: ${lookupSummary.status}`);

  if (lookupSummary.team_name !== testTeamName) {
    throw new Error(`Team name mismatch: expected "${testTeamName}", got "${lookupSummary.team_name}"`);
  }
  if (lookupSummary.status !== "PENDING_PAYMENT") {
    throw new Error(`Status mismatch: expected PENDING_PAYMENT, got ${lookupSummary.status}`);
  }

  // 7. Clean up test record to keep DB pristine
  console.log("\n--- 5. Cleaning up test records ---");
  await prisma.payments.deleteMany({ where: { registration_id: newReg.registration_id } });
  await prisma.registration_players.deleteMany({ where: { registration_id: newReg.registration_id } });
  await prisma.registrations.delete({ where: { id: newReg.registration_id } });
  await prisma.teams.delete({ where: { id: newReg.team_id } });
  const p1 = await prisma.players.findFirst({ where: { first_name: "Roberto", last_name: "Castillo" } });
  if (p1) await prisma.players.delete({ where: { id: p1.id } });
  const p2 = await prisma.players.findFirst({ where: { first_name: "Carlos", last_name: "Mendoza" } });
  if (p2) await prisma.players.delete({ where: { id: p2.id } });
  console.log("[PASS] Test records cleaned up successfully.");

  console.log("\n=== ALL PHASE 04.4 VERIFICATIONS PASSED ===");
}

verifyPhase044()
  .catch((err) => {
    console.error("Phase 04.4 verification failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
