import assert from "node:assert/strict";
// @ts-expect-error Next provides this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getTournament, mergeDivisionRegistrationCounts } = await import("../lib/admin/tournaments");
  try {
    assert.deepEqual(mergeDivisionRegistrationCounts([], []), []);
    assert.deepEqual(mergeDivisionRegistrationCounts([{ id: "one" }], []), [{ id: "one", registrationCount: 0 }]);
    assert.deepEqual(mergeDivisionRegistrationCounts([{ id: "one" }, { id: "two" }],
      [{ league_category_id: "two", _count: { id: 3 } }]),
      [{ id: "one", registrationCount: 0 }, { id: "two", registrationCount: 3 }]);

    const tournaments = await prisma.leagues.findMany({ select: { id: true, name: true,
      league_categories: { select: { id: true, name: true } } }, orderBy: { created_at: "desc" } });
    const original = tournaments.find(item => item.name === "2026 Mahatao NCD Volleyball Cup");
    assert(original?.league_categories.some(item => item.name === "Mix Division"), "The existing Mix Division must remain present");

    let zeroDivisionTournaments = 0;
    let multiDivisionTournaments = 0;
    let divisionsWithRegistrations = 0;
    for (const item of tournaments) {
      const detail = await getTournament(item.id);
      assert(detail);
      assert.equal(detail.league_categories.length, item.league_categories.length);
      if (detail.league_categories.length === 0) zeroDivisionTournaments++;
      if (detail.league_categories.length > 1) multiDivisionTournaments++;
      const [total, grouped] = await Promise.all([
        prisma.registrations.count({ where: { league_id: item.id } }),
        prisma.registrations.groupBy({ by: ["league_category_id"], where: { league_id: item.id }, _count: { id: true } }),
      ]);
      assert.equal(detail._count.registrations, total);
      const expected = new Map(grouped.map(row => [row.league_category_id, row._count.id]));
      for (const division of detail.league_categories) {
        assert.equal(division.registrationCount, expected.get(division.id) ?? 0);
        if (division.registrationCount > 0) divisionsWithRegistrations++;
      }
    }
    console.log(`Tournament detail counts passed for ${tournaments.length} existing tournaments (${zeroDivisionTournaments} with no divisions, ${multiDivisionTournaments} with multiple divisions, ${divisionsWithRegistrations} divisions with registrations); Mix Division is present.`);
  } finally { await prisma.$disconnect(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
