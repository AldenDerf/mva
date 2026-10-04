import { prisma } from "@/lib/prisma";
import type { AdminContext } from "@/lib/auth/admin";
import { NEW_ADMIN_TEAM_STATUSES } from "@/lib/registration-lifecycle";

/** Legacy required name columns have no structured source in profiles. */
export function adminRegistrantFromContext(admin: AdminContext, contact: string) {
  return { first_name: admin.displayName.slice(0, 100), middle_name: null,
    last_name: "Administrator", contact, email: admin.email || null };
}

export async function getAdminRegistrationChoices() {
  const leagues = await prisma.leagues.findMany({
    where: { status: { in: [...NEW_ADMIN_TEAM_STATUSES] } },
    select: { id: true, name: true, year: true, status: true,
      league_categories: { select: { id: true, name: true, registration_fee: true,
        min_players: true, max_players: true }, orderBy: { name: "asc" } } },
    orderBy: [{ year: "desc" }, { created_at: "desc" }],
  });
  return leagues.map(league => ({ id: league.id, name: league.name, year: league.year,
    status: league.status, divisions: league.league_categories.map(category => ({
      id: category.id, name: category.name, fee: Number(category.registration_fee),
      minPlayers: category.min_players, maxPlayers: category.max_players,
    })) }));
}
