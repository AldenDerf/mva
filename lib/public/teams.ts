import { prisma } from "../prisma";

export interface PublicTeamListItem {
  id: string;
  registration_id: string;
  team_name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  category_id: string;
  category_name: string;
  league_name: string;
  league_year: number | null;
  roster_count: number;
}

export interface PublicCategoryFilter {
  id: string;
  name: string;
}

export interface PublicRosterPlayer {
  id: string;
  jersey_number: number | null;
  position: string | null;
  is_captain: boolean;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  photo_url: string | null;
}

export interface PublicTeamProfile {
  id: string;
  registration_id: string;
  team_name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  category_name: string;
  league_name: string;
  league_year: number | null;
  roster_count: number;
  roster: PublicRosterPlayer[];
}

/**
 * Sorts roster players according to official MVA business rules:
 * 1. Players with jersey numbers first, sorted numerically ascending.
 * 2. Players without jersey numbers (null), sorted alphabetically by last name, then first name.
 */
export function sortRosterPlayers(players: PublicRosterPlayer[]): PublicRosterPlayer[] {
  return [...players].sort((a, b) => {
    if (a.jersey_number !== null && b.jersey_number !== null) {
      return a.jersey_number - b.jersey_number;
    }
    if (a.jersey_number !== null && b.jersey_number === null) {
      return -1;
    }
    if (a.jersey_number === null && b.jersey_number !== null) {
      return 1;
    }
    const lastNameComparison = a.last_name.localeCompare(b.last_name, undefined, { sensitivity: "base" });
    if (lastNameComparison !== 0) {
      return lastNameComparison;
    }
    return a.first_name.localeCompare(b.first_name, undefined, { sensitivity: "base" });
  });
}

/**
 * Retrieves public teams that have a VERIFIED registration.
 *
 * Privacy by query design:
 * Strictly selects only non-sensitive public fields.
 * Omits: contact_number, date_of_birth, registrant details, registration notes,
 * payment details, and admin/profile data.
 */
export async function getPublicTeams(): Promise<{
  teams: PublicTeamListItem[];
  categories: PublicCategoryFilter[];
}> {
  const verifiedRegistrations = await prisma.registrations.findMany({
    where: {
      status: "VERIFIED",
    },
    select: {
      id: true,
      team_id: true,
      teams: {
        select: {
          id: true,
          team_name: true,
          slug: true,
          logo_url: true,
          description: true,
        },
      },
      league_categories_registrations_league_category_idToleague_categories: {
        select: {
          id: true,
          name: true,
        },
      },
      leagues: {
        select: {
          id: true,
          name: true,
          year: true,
        },
      },
      _count: {
        select: {
          registration_players: true,
        },
      },
    },
    orderBy: {
      teams: {
        team_name: "asc",
      },
    },
  });

  const categoryMap = new Map<string, string>();

  const teams: PublicTeamListItem[] = verifiedRegistrations.map((reg) => {
    const cat = reg.league_categories_registrations_league_category_idToleague_categories;
    const catId = cat.id;
    const catName = cat.name;

    if (!categoryMap.has(catId)) {
      categoryMap.set(catId, catName);
    }

    return {
      id: reg.teams.id,
      registration_id: reg.id,
      team_name: reg.teams.team_name,
      slug: reg.teams.slug,
      logo_url: reg.teams.logo_url,
      description: reg.teams.description,
      category_id: catId,
      category_name: catName,
      league_name: reg.leagues.name,
      league_year: reg.leagues.year,
      roster_count: reg._count.registration_players,
    };
  });

  const categories: PublicCategoryFilter[] = Array.from(categoryMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return { teams, categories };
}

/**
 * Retrieves a public team profile and its official roster by team slug.
 *
 * Security & Eligibility:
 * The team must have at least one VERIFIED registration.
 * If the slug doesn't exist or has no VERIFIED registration, returns null.
 *
 * Privacy by query design:
 * Excludes sensitive fields (contact_number, date_of_birth, registrant details, payments, admin models).
 */
export async function getPublicTeamBySlug(slug: string): Promise<PublicTeamProfile | null> {
  if (!slug || typeof slug !== "string") {
    return null;
  }

  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  const team = await prisma.teams.findUnique({
    where: {
      slug: normalizedSlug,
    },
    select: {
      id: true,
      team_name: true,
      slug: true,
      logo_url: true,
      description: true,
      registrations: {
        where: {
          status: "VERIFIED",
        },
        select: {
          id: true,
          league_categories_registrations_league_category_idToleague_categories: {
            select: {
              id: true,
              name: true,
            },
          },
          leagues: {
            select: {
              id: true,
              name: true,
              year: true,
            },
          },
          registration_players: {
            select: {
              id: true,
              jersey_number: true,
              position: true,
              is_captain: true,
              players: {
                select: {
                  id: true,
                  first_name: true,
                  middle_name: true,
                  last_name: true,
                  suffix: true,
                  photo_url: true,
                },
              },
            },
          },
        },
        orderBy: {
          submitted_at: "desc",
        },
        take: 1,
      },
    },
  });

  if (!team || team.registrations.length === 0) {
    return null;
  }

  const verifiedRegistration = team.registrations[0];
  const cat = verifiedRegistration.league_categories_registrations_league_category_idToleague_categories;
  const league = verifiedRegistration.leagues;

  const rawRoster: PublicRosterPlayer[] = verifiedRegistration.registration_players.map((rp) => ({
    id: rp.id,
    jersey_number: rp.jersey_number,
    position: rp.position,
    is_captain: rp.is_captain,
    first_name: rp.players.first_name,
    middle_name: rp.players.middle_name,
    last_name: rp.players.last_name,
    suffix: rp.players.suffix,
    photo_url: rp.players.photo_url,
  }));

  const sortedRoster = sortRosterPlayers(rawRoster);

  return {
    id: team.id,
    registration_id: verifiedRegistration.id,
    team_name: team.team_name,
    slug: team.slug,
    logo_url: team.logo_url,
    description: team.description,
    category_name: cat.name,
    league_name: league.name,
    league_year: league.year,
    roster_count: sortedRoster.length,
    roster: sortedRoster,
  };
}
