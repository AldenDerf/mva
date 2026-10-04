import { prisma } from "@/lib/prisma";
import { getBatchRegistrationAccounting } from "@/lib/admin/payments";

// Process bounded batches so the canonical per-registration calculation remains
// authoritative without loading a whole tournament's roster and payments at once.
export async function getTournamentPaymentSummary(tournamentId: string) {
  const divisions = await prisma.league_categories.findMany({
    where: { league_id: tournamentId }, select: { id: true, name: true }, orderBy: { name: "asc" },
  });
  const totals = { teams: 0, expected: 0, paid: 0, balance: 0, complete: 0, incomplete: 0, needingReview: 0 };
  const byDivision = new Map(divisions.map(item => [item.id, { ...totals, id: item.id, name: item.name }]));
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.registrations.findMany({ where: { league_id: tournamentId },
      select: { id: true }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    if (batch.length === 0) break;
    const accounts = await getBatchRegistrationAccounting(batch.map(item => item.id));
    for (const account of accounts.values()) {
      const targets = [totals, byDivision.get(account.categoryId)].filter((item): item is typeof totals => Boolean(item));
      for (const target of targets) {
        target.teams++;
        target.expected += account.expectedAmount;
        target.paid += account.verifiedPaidAmount;
        target.balance += account.balance;
        if (account.paymentComplete) target.complete++; else target.incomplete++;
        if (account.hasUnallocatedVerifiedLegacyPayments) target.needingReview++;
      }
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  const paymentRecords = await prisma.payments.count({ where: { registrations: { league_id: tournamentId } } });
  return { totals, divisions: [...byDivision.values()], paymentRecords };
}
