import assert from "node:assert/strict";
// @ts-expect-error Next provides this runtime dependency without a root type entry in this project.
import { loadEnvConfig } from "@next/env";
import type { player_sex } from "@prisma/client";
import { isPlayerSex, playerSexLabel } from "../lib/player-sex";

loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { correctPlayerAndRosterDetails } = await import("../lib/admin/player-corrections");
  const { addPlayerToRoster } = await import("../lib/admin/roster-mutations");
  const { createRegistration, getOpenLeagues, getLeagueCategories } = await import("../lib/registration");
  const { getAdminRegistrationById } = await import("../lib/admin/registrations");
  try {
    const before = await prisma.players.count();
    const registrationCount = await prisma.registrations.count();
    const paymentCount = await prisma.payments.count();
    const legacy = await prisma.players.count({ where: { sex: null } });
    assert.ok(legacy > 0, "Existing players with null sex remain readable");

    const rollback = "ROLLBACK_PLAYER_SEX_VERIFICATION";
    await assert.rejects(prisma.$transaction(async tx => {
      for (const sex of ["MALE", "FEMALE", null] as const) {
        const created = await tx.players.create({ data: {
          first_name: "Phase 06.1C", last_name: "Rollback Check", sex,
        } });
        const read = await tx.players.findUniqueOrThrow({ where: { id: created.id } });
        assert.equal(read.sex, sex);
      }
      throw new Error(rollback);
    }), { message: rollback });

    assert.equal(isPlayerSex("MALE"), true);
    assert.equal(isPlayerSex("FEMALE"), true);
    assert.equal(isPlayerSex("OTHER"), false);
    assert.equal(playerSexLabel("MALE"), "Male");
    assert.equal(playerSexLabel("FEMALE"), "Female");
    const testId = "11111111-1111-4111-8111-111111111111";
    const admin = { profileId: testId, authUserId: testId,
      displayName: "Verification", email: "verification@example.invalid", role: "ADMIN" };
    const invalidCorrection = await correctPlayerAndRosterDetails(admin, {
      registrationId: testId, registrationPlayerId: testId, playerId: testId,
      sex: "OTHER" as player_sex,
    });
    assert.equal(invalidCorrection.success, false);
    assert.equal(invalidCorrection.error, "VALIDATION_ERROR");
    const invalidAdminAdd = await addPlayerToRoster(admin, {
      registrationId: testId, firstName: "Test", lastName: "Player", sex: "OTHER" as player_sex,
    });
    assert.equal(invalidAdminAdd.success, false);
    assert.equal(invalidAdminAdd.error, "VALIDATION_ERROR");

    const openLeague = await prisma.leagues.findFirst({ where: { status: "OPEN_FOR_REGISTRATION" },
      select: { id: true, league_categories: { select: { id: true }, take: 1 } } });
    const publicLeagues = await getOpenLeagues();
    assert.equal(publicLeagues.some(league => league.id === openLeague?.id), Boolean(openLeague));
    if (openLeague?.league_categories[0]) {
      const publicDivisions = await getLeagueCategories(openLeague.id);
      assert.ok(publicDivisions.some(category => category.id === openLeague.league_categories[0].id));
      await assert.rejects(createRegistration({ league_id: openLeague.id,
        league_category_id: openLeague.league_categories[0].id,
        team_name: "Phase 06.1C Validation Only", registrant: {
          first_name: "Test", last_name: "Registrant", contact: "0000000000",
        }, players: [{ first_name: "Test", last_name: "Player", is_captain: true,
          sex: "OTHER" as player_sex }] }), /Player sex must be Male, Female, or not recorded/);
    }
    const sampleRegistration = await prisma.registrations.findFirst({ select: { id: true } });
    if (sampleRegistration) {
      const detail = await getAdminRegistrationById(sampleRegistration.id);
      assert.ok(detail);
      assert.ok(detail.roster.every(player => player.sex === null || isPlayerSex(player.sex)));
      assert.ok(Number.isFinite(detail.accounting.expectedAmount));
    }
    await assert.rejects(prisma.players.create({ data: {
      first_name: "Phase 06.1C", last_name: "Invalid Check", sex: "OTHER" as player_sex,
    } }));
    assert.equal(await prisma.players.count(), before, "Verification left no player rows behind");
    assert.equal(await prisma.players.count({ where: { sex: null } }), legacy,
      "Verification preserved legacy null values");
    assert.equal(await prisma.registrations.count(), registrationCount);
    assert.equal(await prisma.payments.count(), paymentCount);
    console.log(`Player sex verification passed: ${before} players unchanged, ${legacy} legacy null values preserved.`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
