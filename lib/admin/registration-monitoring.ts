import { prisma } from "@/lib/prisma";
import { getBatchRegistrationAccounting } from "@/lib/admin/payments";

export type MonitoringCounts = {
  teams: number;
  players: number;
  verifiedPlayers: number;
  pendingPlayers: number;
  needsPaymentReview: number;
};

export type MonitoringTeam = MonitoringCounts & {
  id: string;
  name: string;
  status: string;
  code: string;
  divisionId: string;
};

export type MonitoringDivision = MonitoringCounts & {
  id: string;
  name: string;
  teamsList: MonitoringTeam[];
};

export type MonitoringTournament = MonitoringCounts & {
  id: string;
  name: string;
  status: string;
  startDate: Date | null;
  endDate: Date | null;
  divisions: MonitoringDivision[];
};

const emptyCounts = (): MonitoringCounts => ({
  teams: 0, players: 0, verifiedPlayers: 0, pendingPlayers: 0, needsPaymentReview: 0,
});

export function addMonitoringCounts(target: MonitoringCounts, source: MonitoringCounts) {
  target.teams += source.teams;
  target.players += source.players;
  target.verifiedPlayers += source.verifiedPlayers;
  target.pendingPlayers += source.pendingPlayers;
  target.needsPaymentReview += source.needsPaymentReview;
}

/** Bounded canonical accounting reads; no per-team queries or duplicate payment rules. */
export async function getRegistrationMonitoring(tournamentId?: string): Promise<MonitoringTournament[]> {
  const leagues = await prisma.leagues.findMany({
    where: tournamentId ? { id: tournamentId } : undefined,
    select: {
      id: true, name: true, status: true, start_date: true, end_date: true,
      league_categories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: [{ year: "desc" }, { created_at: "desc" }],
  });
  const tournaments: MonitoringTournament[] = leagues.map(league => ({
    ...emptyCounts(), id: league.id, name: league.name, status: league.status,
    startDate: league.start_date, endDate: league.end_date,
    divisions: league.league_categories.map(category => ({
      ...emptyCounts(), id: category.id, name: category.name, teamsList: [],
    })),
  }));
  if (!tournaments.length) return tournaments;
  const tournamentById = new Map(tournaments.map(item => [item.id, item]));
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.registrations.findMany({
      where: { league_id: { in: tournaments.map(item => item.id) } },
      select: { id: true }, orderBy: { id: "asc" }, take: 100,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (!batch.length) break;
    const accounts = await getBatchRegistrationAccounting(batch.map(item => item.id));
    for (const account of accounts.values()) {
      const tournament = tournamentById.get(account.leagueId);
      const division = tournament?.divisions.find(item => item.id === account.categoryId);
      if (!tournament || !division) continue;
      const team: MonitoringTeam = {
        id: account.registrationId, name: account.teamName,
        status: account.registrationStatus, code: account.registrationCode,
        divisionId: account.categoryId, teams: 1,
        players: account.rosterCount, verifiedPlayers: account.paidPlayerCount,
        pendingPlayers: account.unpaidPlayerCount,
        needsPaymentReview: Number(account.hasUnallocatedVerifiedLegacyPayments),
      };
      division.teamsList.push(team);
      addMonitoringCounts(division, team);
      addMonitoringCounts(tournament, team);
    }
    cursor = batch[batch.length - 1].id;
    if (batch.length < 100) break;
  }
  for (const tournament of tournaments) {
    for (const division of tournament.divisions) {
      division.teamsList.sort((a, b) => a.name.localeCompare(b.name));
    }
  }
  return tournaments;
}
