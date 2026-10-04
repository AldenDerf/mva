import assert from "node:assert/strict";
// @ts-expect-error Next provides this runtime dependency without a root type entry.
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { adminRegistrantFromContext } = await import("../lib/admin/registration-create");
  const { getMonitoringTournaments, resolveDivisionId, resolveTournamentId } = await import("../lib/admin/monitoring");
  const { getAdminRegistrations } = await import("../lib/admin/registrations");
  const { getAdminPaymentsList } = await import("../lib/admin/payments");
  const { getTournamentPaymentSummary } = await import("../lib/admin/tournament-monitoring");
  const { getTournamentAccountingSummary } = await import("../lib/admin/accounting");
  try {
    const admin = { authUserId: "actor", profileId: "profile", displayName: "Sample Admin", email: "admin@example.test", role: "ADMIN" };
    assert.deepEqual(adminRegistrantFromContext(admin, "09123456789"), {
      first_name: "Sample Admin", middle_name: null, last_name: "Administrator",
      contact: "09123456789", email: "admin@example.test",
    });
    const tournaments = await getMonitoringTournaments();
    assert.equal(resolveTournamentId("invalid", tournaments), undefined);
    const tournament = tournaments.find(item => item.league_categories.length > 0);
    if (!tournament) { console.log("No populated tournament; identity and invalid-ID checks passed."); return; }
    assert.equal(resolveTournamentId(tournament.id, tournaments), tournament.id);
    assert.equal(resolveDivisionId(tournament.league_categories[0].id, tournament.id, tournaments), tournament.league_categories[0].id);
    const otherDivision = tournaments.find(item => item.id !== tournament.id && item.league_categories.length)?.league_categories[0];
    if (otherDivision) assert.equal(resolveDivisionId(otherDivision.id, tournament.id, tournaments), undefined);
    const registrations = await getAdminRegistrations({ tournamentId: tournament.id, pageSize: 2 });
    const actualRegistrationCount = await prisma.registrations.count({ where: { league_id: tournament.id } });
    assert.equal(registrations.totalCount, actualRegistrationCount);
    assert(registrations.items.every(item => item.leagueId === tournament.id));
    assert(registrations.items.length <= 2);
    const orderedRegistrations = await getAdminRegistrations({ tournamentId: tournament.id, pageSize: 100 });
    assert(orderedRegistrations.items.every((item, index, items) => index === 0 || items[index - 1].categoryName.localeCompare(item.categoryName) <= 0));
    if (orderedRegistrations.items[0]) {
      const searched = await getAdminRegistrations({ q: orderedRegistrations.items[0].registrationCode });
      assert(searched.items.some(item => item.id === orderedRegistrations.items[0].id));
    }
    const payments = await getAdminPaymentsList({ tournamentId: tournament.id, pageSize: 2 });
    const actualPaymentCount = await prisma.payments.count({ where: { registrations: { league_id: tournament.id } } });
    assert.equal(payments.totalCount, actualPaymentCount);
    assert(payments.items.every(item => item.leagueId === tournament.id));
    assert(payments.items.length <= 2);
    const orderedPayments = await getAdminPaymentsList({ tournamentId: tournament.id, pageSize: 100 });
    assert(orderedPayments.items.every((item, index, items) => index === 0 || items[index - 1].categoryName.localeCompare(item.categoryName) <= 0));
    if (orderedPayments.items[0]?.referenceNumber) {
      const searched = await getAdminPaymentsList({ search: orderedPayments.items[0].referenceNumber, pageSize: 20 });
      assert(searched.items.some(item => item.id === orderedPayments.items[0].id));
    }
    const [summary, canonical] = await Promise.all([
      getTournamentPaymentSummary(tournament.id), getTournamentAccountingSummary(tournament.id),
    ]);
    assert.equal(summary.totals.teams, canonical.totalRegistrations);
    assert.equal(summary.totals.expected, canonical.totalExpectedAmount);
    assert.equal(summary.totals.paid, canonical.totalVerifiedPaidAmount);
    assert.equal(summary.totals.balance, canonical.totalOutstandingBalance);
    console.log("Tournament filtering, bounded pagination, identity compatibility, and canonical accounting parity passed.");
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
