import assert from "node:assert/strict";
// @ts-expect-error Next ships this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getRegistrationMonitoring } = await import("../lib/admin/registration-monitoring");
  const { getBatchRegistrationAccounting } = await import("../lib/admin/payments");
  try {
    const tournaments = await getRegistrationMonitoring();
    assert.equal(new Set(tournaments.map(item => item.id)).size, tournaments.length);
    for (const tournament of tournaments) {
      const [individual] = await getRegistrationMonitoring(tournament.id);
      assert.deepEqual(individual, tournament, "Tournament counts must be independent of other tournaments");
      for (const key of ["teams", "players", "verifiedPlayers", "pendingPlayers", "needsPaymentReview"] as const) {
        assert.equal(tournament[key], tournament.divisions.reduce((sum, division) => sum + division[key], 0));
      }
      for (const division of tournament.divisions) {
        assert.equal(division.teams, division.teamsList.length);
        for (const team of division.teamsList) {
          assert.equal(team.players, team.verifiedPlayers + team.pendingPlayers);
          const account = (await getBatchRegistrationAccounting([team.id])).get(team.id);
          assert(account);
          assert.equal(team.players, account.rosterCount);
          assert.equal(team.verifiedPlayers, account.paidPlayerCount);
          assert.equal(team.pendingPlayers, account.unpaidPlayerCount);
          assert.equal(team.needsPaymentReview, Number(account.hasUnallocatedVerifiedLegacyPayments));
          const active = await prisma.registration_players.count({ where: { registration_id: team.id, status: "ACTIVE" } });
          assert.equal(team.players, active, "Removed players must not inflate monitoring totals");
        }
      }
    }
    console.log(`Registration monitoring passed for ${tournaments.length} tournaments.`);
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
