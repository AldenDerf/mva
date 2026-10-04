import { prisma } from "@/lib/prisma";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getMonitoringTournaments() {
  return prisma.leagues.findMany({
    select: { id: true, name: true, status: true, league_categories: {
      select: { id: true, name: true }, orderBy: { name: "asc" },
    } },
    orderBy: [{ year: "desc" }, { created_at: "desc" }],
  });
}

export function resolveTournamentId(raw: string | undefined, tournaments: Array<{ id: string }>) {
  return raw && uuid.test(raw) && tournaments.some(item => item.id === raw) ? raw : undefined;
}

export function resolveDivisionId(raw: string | undefined, tournamentId: string | undefined,
  tournaments: Array<{ id: string; league_categories: Array<{ id: string }> }>) {
  if (!raw || !uuid.test(raw)) return undefined;
  if (tournamentId) return tournaments.find(item => item.id === tournamentId)?.league_categories.some(item => item.id === raw) ? raw : undefined;
  return tournaments.some(item => item.league_categories.some(division => division.id === raw)) ? raw : undefined;
}
