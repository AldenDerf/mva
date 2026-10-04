import { prisma } from "@/lib/prisma";

export async function getAdminRegistrationChoices() {
  const leagues = await prisma.leagues.findMany({
    select: { id: true, name: true, year: true, status: true,
      league_categories: { select: { id: true, name: true, registration_fee: true,
        min_players: true, max_players: true }, orderBy: { name: "asc" } } },
    orderBy: [{ year: "desc" }, { created_at: "desc" }], take: 100,
  });
  return leagues.map(league => ({ id: league.id, name: league.name, year: league.year,
    status: league.status, divisions: league.league_categories.map(category => ({
      id: category.id, name: category.name, fee: Number(category.registration_fee),
      minPlayers: category.min_players, maxPlayers: category.max_players,
    })) }));
}
