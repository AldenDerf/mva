import assert from "node:assert/strict";
import type { league_status } from "@prisma/client";
// @ts-expect-error Next provides this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { canAdminRegisterTeam, canPublicRegisterTeam } = await import("../lib/registration-lifecycle");
  const { validateAdminRegistrationTarget, validateLeagueAndCategory } = await import("../lib/registration");
  try {
    const matrix: Array<[league_status, boolean, boolean]> = [
      ["DRAFT", false, false], ["OPEN_FOR_REGISTRATION", true, true],
      ["ADMIN_REGISTRATION_ONLY", false, true], ["REGISTRATION_CLOSED", false, false],
      ["ONGOING", false, false], ["COMPLETED", false, false], ["ARCHIVED", false, false],
    ];
    const leagueId = "42930879-f5e1-42eb-bf8f-84e2c07bb45a";
    const categoryId = "c7ab324a-c33a-482e-9dd4-7157ae6930c1";
    for (const [status, publicAllowed, adminAllowed] of matrix) {
      assert.equal(canPublicRegisterTeam(status), publicAllowed, status);
      assert.equal(canAdminRegisterTeam(status), adminAllowed, status);
      const stub = { league_categories: { findFirst: async () => ({ id: categoryId, league_id: leagueId,
        name: "Division", description: null, registration_fee: 300, min_players: 1, max_players: 15,
        leagues: { id: leagueId, name: "Tournament", status } }) } } as unknown as typeof prisma;
      const result = await validateAdminRegistrationTarget(leagueId, categoryId, stub);
      assert.equal(result.valid, adminAllowed, `Server-side admin target: ${status}`);
    }
    const before = await Promise.all([prisma.leagues.count(), prisma.league_categories.count(), prisma.registrations.count()]);
    const rollback = "ROLLBACK_LIFECYCLE_MATRIX";
    await assert.rejects(prisma.$transaction(async (tx) => {
      for (const [status, publicAllowed, adminAllowed] of matrix) {
        const league = await tx.leagues.create({ data: { name: `Phase 06.1G ${status}`, status } });
        const division = await tx.league_categories.create({ data: { league_id: league.id, name: "Verification Division" } });
        assert.equal((await validateLeagueAndCategory(league.id, division.id, tx)).valid, publicAllowed, `Database public target: ${status}`);
        assert.equal((await validateAdminRegistrationTarget(league.id, division.id, tx)).valid, adminAllowed, `Database admin target: ${status}`);
      }
      throw new Error(rollback);
    }, { timeout: 30000 }), { message: rollback });
    assert.deepEqual(await Promise.all([prisma.leagues.count(), prisma.league_categories.count(), prisma.registrations.count()]), before);
    const labels = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'league_status'
      ORDER BY e.enumsortorder`;
    const [database] = await prisma.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
    const statuses = await prisma.leagues.groupBy({ by: ["status"], _count: { id: true } });
    console.log(JSON.stringify({ database: database.name, labels: labels.map(row => row.enumlabel), statuses, lifecycleMatrix: "passed" }));
    assert.equal(database.name, "mva_dev");
    assert.deepEqual(labels.map(row => row.enumlabel), matrix.map(row => row[0]));
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
