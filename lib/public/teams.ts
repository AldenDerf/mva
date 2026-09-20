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

export const ACTIVE_PUBLIC_LEAGUE_STATUSES = [
  "ONGOING",
  "OPEN_FOR_REGISTRATION",
  "REGISTRATION_CLOSED",
] as const;

/**
 * Resolves the primary active public tournament context.
 *
 * Current Schema Limitation & Architectural Note (Pre-Phase 06):
 * The current schema does not have an explicit `is_primary` or `is_current` boolean
 * on `leagues`, nor an admin league selector configuration table.
 * Therefore, the active tournament context is identified deterministically using
 * the existing `league_status` enum:
 * - Active statuses: ONGOING > OPEN_FOR_REGISTRATION > REGISTRATION_CLOSED.
 * - Excluded lifecycle statuses: DRAFT (internal), COMPLETED (historical), ARCHIVED (historical).
 * - Deterministic tie-breaker: status priority, then start_date DESC, then created_at DESC.
 *
 * Phase 06 Recommendation for Multi-Season Support:
 * Once multiple concurrent leagues or historical archive browsing are introduced,
 * the association should establish:
 * 1. An explicit featured tournament setting or administrative active flag.
 * 2. Scoped public URLs for past seasons (e.g. `/leagues/[leagueSlug]/teams` or season selector).
 */
export async function getActivePublicLeague() {
  const candidateLeagues = await prisma.leagues.findMany({
    where: {
      status: {
        in: [...ACTIVE_PUBLIC_LEAGUE_STATUSES],
      },
    },
    select: {
      id: true,
      name: true,
      year: true,
      status: true,
      start_date: true,
      created_at: true,
    },
  });

  if (candidateLeagues.length === 0) {
    return null;
  }

  // Priority: ONGOING (1) > OPEN_FOR_REGISTRATION (2) > REGISTRATION_CLOSED (3)
  const statusPriority: Record<string, number> = {
    ONGOING: 1,
    OPEN_FOR_REGISTRATION: 2,
    REGISTRATION_CLOSED: 3,
  };

  candidateLeagues.sort((a, b) => {
    const pA = statusPriority[a.status] ?? 99;
    const pB = statusPriority[b.status] ?? 99;
    if (pA !== pB) return pA - pB;

    const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
    const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
    if (dateA !== dateB) return dateB - dateA;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  return candidateLeagues[0];
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
 * Retrieves public teams that have a VERIFIED registration in the active tournament context.
 *
 * Hardening Guarantees:
 * 1. Scoped strictly to the active public tournament (getActivePublicLeague()).
 * 2. Excludes historical registrations belonging to COMPLETED, ARCHIVED, or DRAFT leagues.
 * 3. Deduplicates by team ID: a team with multiple registrations NEVER appears more than once.
 * 4. Privacy by query design: strictly omits contact_number, date_of_birth, registrant details,
 *    registration notes, payment details, and admin/profile data.
 */
export async function getPublicTeams(): Promise<{
  teams: PublicTeamListItem[];
  categories: PublicCategoryFilter[];
  activeLeague: { id: string; name: string; year: number | null } | null;
}> {
  const activeLeague = await getActivePublicLeague();
  if (!activeLeague) {
    return { teams: [], categories: [], activeLeague: null };
  }

  const verifiedRegistrations = await prisma.registrations.findMany({
    where: {
      status: "VERIFIED",
      league_id: activeLeague.id,
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
  const teamMap = new Map<string, PublicTeamListItem>();

  for (const reg of verifiedRegistrations) {
    const cat = reg.league_categories_registrations_league_category_idToleague_categories;
    if (!categoryMap.has(cat.id)) {
      categoryMap.set(cat.id, cat.name);
    }

    // Defensive deduplication: ensure each team appears at most once in the public directory
    if (!teamMap.has(reg.teams.id)) {
      teamMap.set(reg.teams.id, {
        id: reg.teams.id,
        registration_id: reg.id,
        team_name: reg.teams.team_name,
        slug: reg.teams.slug,
        logo_url: reg.teams.logo_url,
        description: reg.teams.description,
        category_id: cat.id,
        category_name: cat.name,
        league_name: reg.leagues.name,
        league_year: reg.leagues.year,
        roster_count: reg._count.registration_players,
      });
    }
  }

  const teams = Array.from(teamMap.values()).sort((a, b) =>
    a.team_name.localeCompare(b.team_name, undefined, { sensitivity: "base" })
  );

  const categories: PublicCategoryFilter[] = Array.from(categoryMap.entries())
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    teams,
    categories,
    activeLeague: {
      id: activeLeague.id,
      name: activeLeague.name,
      year: activeLeague.year,
    },
  };
}

/**
 * Retrieves a public team profile and its official roster by team slug,
 * strictly resolved from the active tournament context.
 *
 * Security & Hardening:
 * 1. Resolves the active tournament via getActivePublicLeague().
 * 2. Scopes registration query strictly to league_id: activeLeague.id.
 * 3. If the team only has historical VERIFIED registrations (from COMPLETED/ARCHIVED leagues)
 *    and no VERIFIED registration in the active tournament, returns null (triggers 404).
 * 4. Historical rosters cannot leak or override the active tournament roster.
 * 5. Privacy by query design: excludes sensitive player and registration fields.
 */
export async function getPublicTeamBySlug(slug: string): Promise<PublicTeamProfile | null> {
  if (!slug || typeof slug !== "string") {
    return null;
  }

  const normalizedSlug = slug.trim().toLowerCase();
  if (!normalizedSlug) {
    return null;
  }

  const activeLeague = await getActivePublicLeague();
  if (!activeLeague) {
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
          league_id: activeLeague.id,
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
