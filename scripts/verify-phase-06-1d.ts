import assert from "node:assert/strict";
import type { player_sex } from "@prisma/client";
// @ts-expect-error Next provides this runtime dependency without a root type entry in this project.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { resolveRegistrationPlayerSex, validateAdminRegistrationTarget,
    validateLeagueAndCategory, createRegistration } = await import("../lib/registration");
  try {
    assert.deepEqual(resolveRegistrationPlayerSex(null, "MALE", true), { complete: "MALE", effective: "MALE" });
    assert.deepEqual(resolveRegistrationPlayerSex(null, "FEMALE", true), { complete: "FEMALE", effective: "FEMALE" });
    assert.deepEqual(resolveRegistrationPlayerSex(null, null, true), { complete: null, effective: null });
    assert.deepEqual(resolveRegistrationPlayerSex("MALE", "MALE", true), { complete: null, effective: "MALE" });
    assert.deepEqual(resolveRegistrationPlayerSex("FEMALE", null, true), { complete: null, effective: "FEMALE" });
    assert.deepEqual(resolveRegistrationPlayerSex("MALE", "FEMALE", false), { complete: null, effective: "MALE" });
    assert.throws(() => resolveRegistrationPlayerSex("MALE", "FEMALE", true), /different recorded sex/);

    const before = await Promise.all([prisma.registrations.count(), prisma.players.count(), prisma.payments.count(),
      prisma.leagues.count(), prisma.league_categories.count()]);
    const rollback = "ROLLBACK_ADMIN_CLOSED_TARGET_TEST";
    await assert.rejects(prisma.$transaction(async tx => {
      const closed = await tx.leagues.create({ data: { name: "Phase 06.1D rollback check", status: "REGISTRATION_CLOSED" } });
      const category = await tx.league_categories.create({ data: { league_id: closed.id, name: "Rollback Division" } });
      const adminTarget = await validateAdminRegistrationTarget(closed.id, category.id, tx);
      const publicTarget = await validateLeagueAndCategory(closed.id, category.id, tx);
      assert.equal(adminTarget.valid, true);
      assert.equal(publicTarget.valid, false);
      throw new Error(rollback);
    }), { message: rollback });
    const open = await prisma.leagues.findFirst({ where: { status: "OPEN_FOR_REGISTRATION",
      league_categories: { some: {} } }, select: { id: true, league_categories: { select: { id: true }, take: 1 } } });
    if (open?.league_categories[0]) {
      const invalidInput = { league_id: open.id, league_category_id: open.league_categories[0].id,
        team_name: "Phase 06.1D validation only", registrant: { first_name: "Test", last_name: "Registrant", contact: "0000000000" },
        players: [{ first_name: "Test", last_name: "Player", is_captain: true, sex: "OTHER" as player_sex }] };
      await assert.rejects(createRegistration(invalidInput, {
        authUserId: open.id, profileId: open.id, displayName: "Verification", email: "verification@example.invalid", role: "ADMIN",
      }), /Player sex must be Male, Female, or not recorded/);
    }
    const after = await Promise.all([prisma.registrations.count(), prisma.players.count(), prisma.payments.count(),
      prisma.leagues.count(), prisma.league_categories.count()]);
    assert.deepEqual(after, before, "Read-only verification did not change records");
    console.log("Closed-target rollback and player-sex checks passed; registration, player, payment, tournament, and division counts unchanged.");
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
