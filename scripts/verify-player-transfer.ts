import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
// @ts-expect-error Next ships this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { executePlayerTransferInTransaction } = await import("../lib/admin/player-transfer");
  const { calculateRegistrationAccounting } = await import("../lib/admin/accounting");
  const counts = async () => Promise.all([
    prisma.leagues.count(), prisma.registrations.count(), prisma.registration_players.count(),
    prisma.payments.count(), prisma.payment_allocations.count(), prisma.admin_audit_logs.count(),
  ]);
  const before = await counts();
  const rollback = "ROLLBACK_PLAYER_TRANSFER_REGRESSION";
  try {
    await assert.rejects(prisma.$transaction(async (tx) => {
      const tag = randomUUID().slice(0, 8);
      const actor = await tx.profiles.create({ data: { auth_user_id: randomUUID(), display_name: "Transfer Tester", email: `transfer-${tag}@example.invalid` } });
      await tx.admin_access.create({ data: { profile_id: actor.id, role: "ADMIN" } });
      const admin = { authUserId: actor.auth_user_id, profileId: actor.id, displayName: "Transfer Tester", email: actor.email!, role: "ADMIN" };
      const league = await tx.leagues.create({ data: { name: `Transfer ${tag}` } });
      const otherLeague = await tx.leagues.create({ data: { name: `Other ${tag}` } });
      const division = await tx.league_categories.create({ data: { league_id: league.id, name: "Open", registration_fee: 300 } });
      const otherDivision = await tx.league_categories.create({ data: { league_id: league.id, name: "Other", registration_fee: 300 } });
      const sameNamedDivision = await tx.league_categories.create({ data: { league_id: otherLeague.id, name: "Open", registration_fee: 300 } });
      const makeRegistration = async (leagueId: string, divisionId: string, status: "VERIFIED" | "PENDING_PAYMENT" | "REJECTED" | "CANCELLED") => {
        const team = await tx.teams.create({ data: { team_name: `Transfer ${tag} ${randomUUID()}`, slug: `transfer-${tag}-${randomUUID()}` } });
        return tx.registrations.create({ data: {
          league_id: leagueId, league_category_id: divisionId, team_id: team.id, status,
          registrant_first_name: "Test", registrant_last_name: "Admin", registrant_contact: "0000000000",
        } });
      };
      const source = await makeRegistration(league.id, division.id, "VERIFIED");
      const destination = await makeRegistration(league.id, division.id, "VERIFIED");
      const wrongDivision = await makeRegistration(league.id, otherDivision.id, "VERIFIED");
      const wrongLeague = await makeRegistration(otherLeague.id, sameNamedDivision.id, "VERIFIED");
      const pending = await makeRegistration(league.id, division.id, "PENDING_PAYMENT");
      const rejected = await makeRegistration(league.id, division.id, "REJECTED");
      const cancelled = await makeRegistration(league.id, division.id, "CANCELLED");
      const player = await tx.players.create({ data: { first_name: "Transfer", last_name: "Player" } });
      const rp = await tx.registration_players.create({ data: { registration_id: source.id, player_id: player.id, jersey_number: 7, position: "Setter" } });
      const payment = await tx.payments.create({ data: { registration_id: source.id, registration_player_id: rp.id, amount: 300, payment_method: "CASH", status: "VERIFIED", verified_by_profile_id: actor.id, verified_at: new Date(), reference_number: "TRANSFER-TEST" } });
      const accounting = async (id: string) => calculateRegistrationAccounting(await tx.registrations.findUniqueOrThrow({
        where: { id }, include: {
          teams: true, leagues: true,
          league_categories_registrations_league_category_idToleague_categories: true,
          registration_players: { include: { players: true, payments: true } },
          payments: { include: { payment_allocations: true } },
        },
      }));
      const input = { registrationPlayerId: rp.id, sourceRegistrationId: source.id, destinationRegistrationId: destination.id, reason: "  Approved roster correction  " };
      const move = (changes: Partial<typeof input> = {}) => executePlayerTransferInTransaction(tx, admin, { ...input, ...changes });
      for (const target of [wrongDivision, wrongLeague, pending, rejected, cancelled, source]) {
        assert.equal((await move({ destinationRegistrationId: target.id })).success, false, `Blocked destination ${target.id}`);
      }
      await tx.registrations.update({ where: { id: source.id }, data: { status: "PENDING_PAYMENT" } });
      assert.equal((await move()).success, false, "Unverified source blocked");
      await tx.registrations.update({ where: { id: source.id }, data: { status: "VERIFIED" } });
      await tx.registration_players.update({ where: { id: rp.id }, data: { status: "REMOVED" } });
      assert.equal((await move()).success, false, "Removed player blocked");
      await tx.registration_players.update({ where: { id: rp.id }, data: { status: "ACTIVE", is_captain: true } });
      assert.equal((await move()).success, false, "Captain blocked");
      await tx.registration_players.update({ where: { id: rp.id }, data: { is_captain: false } });
      const duplicate = await tx.registration_players.create({ data: { registration_id: destination.id, player_id: player.id, status: "REMOVED" } });
      assert.equal((await move()).success, false, "Removed destination duplicate blocked");
      await tx.registration_players.delete({ where: { id: duplicate.id } });
      await tx.payments.update({ where: { id: payment.id }, data: { status: "PENDING", verified_at: null, verified_by_profile_id: null } });
      assert.equal((await move()).success, true, "Pending assessment moves without duplication");
      assert.equal((await tx.payments.findUniqueOrThrow({ where: { id: payment.id } })).registration_id, destination.id);
      assert.equal((await tx.payments.findUniqueOrThrow({ where: { id: payment.id } })).status, "PENDING");
      assert.equal((await executePlayerTransferInTransaction(tx, admin, { ...input, sourceRegistrationId: destination.id, destinationRegistrationId: source.id })).success, true);
      await tx.payments.update({ where: { id: payment.id }, data: { status: "VERIFIED", verified_at: new Date(), verified_by_profile_id: actor.id } });
      const legacy = await tx.payments.create({ data: { registration_id: source.id, amount: 300, payment_method: "CASH", status: "VERIFIED" } });
      const allocation = await tx.payment_allocations.create({ data: { payment_id: legacy.id, registration_player_id: rp.id, amount: 300, allocated_by_profile_id: actor.id, reconciliation_note: "Test" } });
      assert.equal((await move()).success, false, "Active legacy allocation blocked");
      assert.equal((await tx.registration_players.findUniqueOrThrow({ where: { id: rp.id } })).registration_id, source.id);
      await tx.payment_allocations.update({ where: { id: allocation.id }, data: { reversed_at: new Date(), reversed_by_profile_id: actor.id, reversal_reason: "Test reversal" } });
      const sourceBefore = await accounting(source.id);
      const destinationBefore = await accounting(destination.id);
      const result = await move();
      assert.equal(result.success, true);
      if (!result.success) throw new Error("Transfer unexpectedly failed");
      assert.equal(result.registrationPlayerId, rp.id);
      assert.deepEqual(result.paymentIdsMoved, [payment.id]);
      const moved = await tx.registration_players.findUniqueOrThrow({ where: { id: rp.id } });
      const movedPayment = await tx.payments.findUniqueOrThrow({ where: { id: payment.id } });
      assert.equal(moved.player_id, player.id);
      assert.equal(moved.registration_id, destination.id);
      assert.equal(moved.jersey_number, 7);
      assert.equal(moved.position, "Setter");
      assert.equal(movedPayment.registration_id, destination.id);
      assert.equal(movedPayment.status, "VERIFIED");
      assert.equal(movedPayment.reference_number, "TRANSFER-TEST");
      assert.equal(Number(movedPayment.amount), 300);
      const audit = await tx.admin_audit_logs.findUniqueOrThrow({ where: { id: result.auditLogId } });
      assert.equal(audit.action, "PLAYER_MOVED_BETWEEN_TEAMS");
      assert.equal(audit.entity_id, rp.id);
      assert.equal((audit.metadata as Record<string, unknown>).reason, "Approved roster correction");
      assert.equal(await tx.payments.count({ where: { registration_player_id: rp.id } }), 1);
      const sourceAfter = await accounting(source.id);
      const destinationAfter = await accounting(destination.id);
      console.log(JSON.stringify({ accounting: { sourceBefore: { expected: sourceBefore.expectedAmount, verified: sourceBefore.verifiedPaidAmount, collected: sourceBefore.totalVerifiedCollected }, sourceAfter: { expected: sourceAfter.expectedAmount, verified: sourceAfter.verifiedPaidAmount, collected: sourceAfter.totalVerifiedCollected }, destinationBefore: { expected: destinationBefore.expectedAmount, verified: destinationBefore.verifiedPaidAmount, collected: destinationBefore.totalVerifiedCollected }, destinationAfter: { expected: destinationAfter.expectedAmount, verified: destinationAfter.verifiedPaidAmount, collected: destinationAfter.totalVerifiedCollected } } }));
      assert.equal(sourceBefore.rosterCount - sourceAfter.rosterCount, 1);
      assert.equal(destinationAfter.rosterCount - destinationBefore.rosterCount, 1);
      assert.equal(sourceBefore.expectedAmount - sourceAfter.expectedAmount, 300);
      assert.equal(destinationAfter.expectedAmount - destinationBefore.expectedAmount, 300);
      assert.equal(sourceBefore.verifiedPaidAmount - sourceAfter.verifiedPaidAmount, 300);
      assert.equal(destinationAfter.verifiedPaidAmount - destinationBefore.verifiedPaidAmount, 300);
      assert.equal(sourceBefore.expectedAmount + destinationBefore.expectedAmount, sourceAfter.expectedAmount + destinationAfter.expectedAmount);
      assert.equal(sourceBefore.totalVerifiedCollected + destinationBefore.totalVerifiedCollected, sourceAfter.totalVerifiedCollected + destinationAfter.totalVerifiedCollected);
      console.log(JSON.stringify({ accounting: { sourceBefore: { expected: sourceBefore.expectedAmount, verified: sourceBefore.verifiedPaidAmount }, sourceAfter: { expected: sourceAfter.expectedAmount, verified: sourceAfter.verifiedPaidAmount }, destinationBefore: { expected: destinationBefore.expectedAmount, verified: destinationBefore.verifiedPaidAmount }, destinationAfter: { expected: destinationAfter.expectedAmount, verified: destinationAfter.verifiedPaidAmount } } }));
      console.log("Player transfer guards, identity, payments, audit, and rollback: passed");
      throw new Error(rollback);
    }, { timeout: 30000 }), { message: rollback });
    assert.deepEqual(await counts(), before, "Database test-data drift");
    console.log("Database test-data drift: none");
  } finally { await prisma.$disconnect(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
