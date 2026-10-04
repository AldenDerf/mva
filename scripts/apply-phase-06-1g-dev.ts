import assert from "node:assert/strict";
// @ts-expect-error Next provides this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  try {
    const result = await prisma.$transaction(async (tx) => {
      const [target] = await tx.$queryRaw<Array<{ name: string }>>`SELECT current_database() AS name`;
      assert.equal(target.name, "mva_dev", "Refusing enum change outside mva_dev");
      const before = await tx.leagues.groupBy({ by: ["status"], _count: { id: true } });
      const labelsBefore = await tx.$queryRaw<Array<{ enumlabel: string }>>`
        SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'public' AND t.typname = 'league_status'
        ORDER BY e.enumsortorder`;
      await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
      await tx.$executeRawUnsafe("ALTER TYPE public.league_status ADD VALUE IF NOT EXISTS 'ADMIN_REGISTRATION_ONLY' AFTER 'OPEN_FOR_REGISTRATION'");
      const after = await tx.leagues.groupBy({ by: ["status"], _count: { id: true } });
      assert.deepEqual(after, before, "Existing tournament statuses changed");
      return { database: target.name, labelsBefore: labelsBefore.map((row) => row.enumlabel), statusesBefore: before, statusesAfter: after };
    });
    const labelsAfter = await prisma.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'league_status'
      ORDER BY e.enumsortorder`;
    assert.deepEqual(labelsAfter.map((row) => row.enumlabel), [
      "DRAFT", "OPEN_FOR_REGISTRATION", "ADMIN_REGISTRATION_ONLY", "REGISTRATION_CLOSED", "ONGOING", "COMPLETED", "ARCHIVED",
    ]);
    console.log(JSON.stringify({ ...result, labelsAfter: labelsAfter.map((row) => row.enumlabel) }));
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
