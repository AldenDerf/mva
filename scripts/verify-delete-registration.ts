import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
// @ts-expect-error Next ships this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

async function main() {
  const connection = process.env.DATABASE_URL;
  if (!connection) throw new Error("DATABASE_URL is missing");
  const url = new URL(connection);
  if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1" && url.hostname !== "::1") throw new Error("Local database required");
  if (url.pathname !== "/mva_dev") throw new Error("mva_dev database required");
  const client = new pg.Client({ connectionString: connection });
  await client.connect();
  try {
    const probe = await client.query("select current_database() as database, inet_server_addr()::text as host");
    assert.equal(probe.rows[0].database, "mva_dev");
    assert.ok([null, "127.0.0.1/32", "::1/128", "::ffff:127.0.0.1/128"].includes(probe.rows[0].host));
    await client.query("BEGIN ISOLATION LEVEL SERIALIZABLE");
    const tag = randomUUID().slice(0, 8);
    const league = (await client.query("insert into leagues(name) values($1) returning id", [`Delete ${tag}`])).rows[0].id;
    const category = (await client.query("insert into league_categories(league_id,name,registration_fee) values($1,'Open',300) returning id", [league])).rows[0].id;
    const team = (await client.query("insert into teams(team_name,slug) values($1,$2) returning id", [`Delete ${tag}`, `delete-${tag}`])).rows[0].id;
    const player = (await client.query("insert into players(first_name,last_name) values('Test','Player') returning id")).rows[0].id;
    async function registration() {
      return (await client.query("insert into registrations(league_id,league_category_id,team_id,registrant_first_name,registrant_last_name,registrant_contact) values($1,$2,$3,'Test','Admin','0000000000') returning id", [league, category, team])).rows[0].id;
    }
    const target = await registration();
    const otherLeague = (await client.query("insert into leagues(name) values($1) returning id", [`Delete other ${tag}`])).rows[0].id;
    const otherCategory = (await client.query("insert into league_categories(league_id,name,registration_fee) values($1,'Open',300) returning id", [otherLeague])).rows[0].id;
    const other = (await client.query("insert into registrations(league_id,league_category_id,team_id,registrant_first_name,registrant_last_name,registrant_contact) values($1,$2,$3,'Test','Admin','0000000000') returning id", [otherLeague, otherCategory, team])).rows[0].id;
    const roster = (await client.query("insert into registration_players(registration_id,player_id) values($1,$2) returning id", [target, player])).rows[0].id;
    await client.query("insert into registration_players(registration_id,player_id) values($1,$2)", [other, player]);
    await client.query("insert into payments(registration_id,registration_player_id,payment_method,amount,status) values($1,$2,'CASH',300,'PENDING'),($1,$2,'CASH',300,'REJECTED')", [target, roster]);
    await client.query("delete from payments where registration_id=$1", [target]);
    await client.query("delete from registration_players where registration_id=$1", [target]);
    await client.query("delete from registrations where id=$1", [target]);
    for (const [table, id, count] of [
      ["registrations", target, 0], ["payments", target, 0], ["registration_players", target, 0],
      ["teams", team, 1], ["players", player, 1], ["registrations", other, 1],
    ] as const) {
      const column = table === "teams" || table === "players" || table === "registrations" ? "id" : "registration_id";
      const found = await client.query(`select count(*)::int as count from ${table} where ${column}=$1`, [id]);
      assert.equal(found.rows[0].count, count, `${table} count`);
    }
    console.log("PASS: explicit FK deletion order preserves reusable team/player identities and another registration");
  } finally {
    await client.query("ROLLBACK").catch(() => undefined);
    await client.end();
  }

  // Service integration fixtures are isolated in the verified local database and removed in finally.
  // The local PostgreSQL server accepts a placeholder password; Prisma's pool needs a string.
  url.password ||= "local-test";
  process.env.DATABASE_URL = url.toString();
  const { prisma } = await import("../lib/prisma");
  const { deleteUnverifiedRegistration } = await import("../lib/admin/delete-unverified-registration");
  const tag = randomUUID().slice(0, 8);
  const registrationIds: string[] = [];
  const teamIds: string[] = [];
  const playerIds: string[] = [];
  let leagueId = "";
  let profileId = "";
  try {
    const profile = await prisma.profiles.create({ data: { auth_user_id: randomUUID(), display_name: "Delete Tester", email: `delete-${tag}@example.invalid` } });
    profileId = profile.id;
    await prisma.admin_access.create({ data: { profile_id: profile.id } });
    const admin = { authUserId: profile.auth_user_id, profileId: profile.id, displayName: "Delete Tester", email: profile.email!, role: "ADMIN" };
    const league = await prisma.leagues.create({ data: { name: `Delete integration ${tag}` } });
    leagueId = league.id;
    const category = await prisma.league_categories.create({ data: { league_id: league.id, name: "Open", registration_fee: 300 } });
    const category2 = await prisma.league_categories.create({ data: { league_id: league.id, name: "Other", registration_fee: 300 } });
    const team = await prisma.teams.create({ data: { team_name: `Delete integration ${tag}`, slug: `delete-integration-${tag}` } });
    teamIds.push(team.id);
    const player = await prisma.players.create({ data: { first_name: "Delete", last_name: "Tester" } });
    playerIds.push(player.id);
    async function make(status: "PENDING_PAYMENT" | "REJECTED" | "CANCELLED" | "VERIFIED", categoryId = category.id) {
      const registration = await prisma.registrations.create({ data: {
        league_id: league.id, league_category_id: categoryId, team_id: team.id, status,
        registrant_first_name: "Delete", registrant_last_name: "Tester", registrant_contact: "0000000000",
      } });
      registrationIds.push(registration.id);
      const roster = await prisma.registration_players.create({ data: { registration_id: registration.id, player_id: player.id } });
      return { registration, roster };
    }
    const target = await make("PENDING_PAYMENT");
    const other = await make("PENDING_PAYMENT", category2.id);
    await prisma.payments.create({ data: { registration_id: target.registration.id, registration_player_id: target.roster.id, payment_method: "CASH", amount: 300, status: "PENDING" } });
    await prisma.payments.create({ data: { registration_id: target.registration.id, registration_player_id: target.roster.id, payment_method: "CASH", amount: 300, status: "REJECTED" } });
    const result = await deleteUnverifiedRegistration(admin, { registrationId: target.registration.id, expectedStatus: "PENDING_PAYMENT", confirmationCode: target.registration.registration_code!, reason: "Duplicate unpaid registration" });
    assert.equal(result.success, true, JSON.stringify(result));
    assert.equal(await prisma.registrations.count({ where: { id: target.registration.id } }), 0);
    assert.equal(await prisma.registration_players.count({ where: { registration_id: target.registration.id } }), 0);
    assert.equal(await prisma.payments.count({ where: { registration_id: target.registration.id } }), 0);
    assert.equal(await prisma.teams.count({ where: { id: team.id } }), 1);
    assert.equal(await prisma.players.count({ where: { id: player.id } }), 1);
    assert.equal(await prisma.registrations.count({ where: { id: other.registration.id } }), 1);
    const audit = await prisma.admin_audit_logs.findFirstOrThrow({ where: { action: "REGISTRATION_DELETED", entity_id: target.registration.id } });
    const metadata = audit.metadata as Record<string, unknown>;
    assert.equal(metadata.deleted_payment_count, 2);
    assert.equal(metadata.team_id, team.id);
    assert.equal(metadata.actor_profile_id, profile.id);
    const unauthorized = await deleteUnverifiedRegistration({ ...admin, role: "USER" }, { registrationId: other.registration.id, expectedStatus: "PENDING_PAYMENT", confirmationCode: other.registration.registration_code!, reason: "Unauthorized attempt" });
    assert.equal(unauthorized.success, false);
    const stale = await deleteUnverifiedRegistration(admin, { registrationId: other.registration.id, expectedStatus: "REJECTED", confirmationCode: other.registration.registration_code!, reason: "Stale browser state" });
    assert.equal(stale.success, false);
    const verifiedPayment = await prisma.payments.create({ data: { registration_id: other.registration.id, registration_player_id: other.roster.id, payment_method: "CASH", amount: 300, status: "VERIFIED", verified_at: new Date() } });
    const blocked = await deleteUnverifiedRegistration(admin, { registrationId: other.registration.id, expectedStatus: "PENDING_PAYMENT", confirmationCode: other.registration.registration_code!, reason: "Should be blocked" });
    assert.equal(blocked.success, false);
    await prisma.payments.update({ where: { id: verifiedPayment.id }, data: { status: "REFUNDED" } });
    const refunded = await deleteUnverifiedRegistration(admin, { registrationId: other.registration.id, expectedStatus: "PENDING_PAYMENT", confirmationCode: other.registration.registration_code!, reason: "Should be blocked" });
    assert.equal(refunded.success, false);
    async function extra(status: "REJECTED" | "CANCELLED" | "PENDING_PAYMENT" | "VERIFIED") {
      const division = await prisma.league_categories.create({ data: { league_id: league.id, name: randomUUID(), registration_fee: 300 } });
      return make(status, division.id);
    }
    const rejected = await extra("REJECTED");
    assert.equal((await deleteUnverifiedRegistration(admin, { registrationId: rejected.registration.id, expectedStatus: "REJECTED", confirmationCode: rejected.registration.registration_code!, reason: "Rejected unpaid entry" })).success, true);
    const cancelled = await extra("CANCELLED");
    assert.equal((await deleteUnverifiedRegistration(admin, { registrationId: cancelled.registration.id, expectedStatus: "CANCELLED", confirmationCode: cancelled.registration.registration_code!, reason: "Cancelled unpaid entry" })).success, true);
    const historicallyVerified = await extra("CANCELLED");
    await prisma.registrations.update({ where: { id: historicallyVerified.registration.id }, data: { verified_at: new Date() } });
    assert.equal((await deleteUnverifiedRegistration(admin, { registrationId: historicallyVerified.registration.id, expectedStatus: "CANCELLED", confirmationCode: historicallyVerified.registration.registration_code!, reason: "Historical verification" })).success, false);
    const verified = await extra("VERIFIED");
    assert.equal((await deleteUnverifiedRegistration(admin, { registrationId: verified.registration.id, expectedStatus: "VERIFIED", confirmationCode: verified.registration.registration_code!, reason: "Verified registration" })).success, false);
    const legacy = await extra("PENDING_PAYMENT");
    await prisma.payments.create({ data: { registration_id: legacy.registration.id, payment_method: "CASH", amount: 300, status: "VERIFIED", verified_at: new Date() } });
    assert.equal((await deleteUnverifiedRegistration(admin, { registrationId: legacy.registration.id, expectedStatus: "PENDING_PAYMENT", confirmationCode: legacy.registration.registration_code!, reason: "Verified legacy payment" })).success, false);
    const allocated = await extra("PENDING_PAYMENT");
    const source = await prisma.payments.create({ data: { registration_id: allocated.registration.id, payment_method: "CASH", amount: 300, status: "VERIFIED", verified_at: new Date() } });
    await prisma.payment_allocations.create({ data: { payment_id: source.id, registration_player_id: allocated.roster.id, amount: 300, allocated_by_profile_id: profile.id, reconciliation_note: "Delete regression" } });
    assert.equal((await deleteUnverifiedRegistration(admin, { registrationId: allocated.registration.id, expectedStatus: "PENDING_PAYMENT", confirmationCode: allocated.registration.registration_code!, reason: "Allocated real money" })).success, false);
    console.log("PASS: service deletion, audit, identity preservation, authorization, stale state, verified and refunded payment guards");
  } finally {
    await prisma.admin_audit_logs.deleteMany({ where: { entity_id: { in: registrationIds }, action: "REGISTRATION_DELETED" } });
    await prisma.payment_allocations.deleteMany({ where: { payments: { registration_id: { in: registrationIds } } } });
    await prisma.payments.deleteMany({ where: { registration_id: { in: registrationIds } } });
    await prisma.registration_players.deleteMany({ where: { registration_id: { in: registrationIds } } });
    await prisma.registrations.deleteMany({ where: { id: { in: registrationIds } } });
    await prisma.players.deleteMany({ where: { id: { in: playerIds } } });
    await prisma.teams.deleteMany({ where: { id: { in: teamIds } } });
    if (leagueId) {
      await prisma.league_categories.deleteMany({ where: { league_id: leagueId } });
      await prisma.leagues.delete({ where: { id: leagueId } });
    }
    if (profileId) {
      await prisma.admin_access.deleteMany({ where: { profile_id: profileId } });
      await prisma.profiles.delete({ where: { id: profileId } });
    }
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
