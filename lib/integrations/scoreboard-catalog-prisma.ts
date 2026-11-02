import { prisma } from "../prisma";
import type {
  CatalogDivisionRecord,
  CatalogLeagueRecord,
  CatalogRegistrationRecord,
  ScoreboardCatalogStore,
  ScoreboardEligibleLeagueStatus,
} from "./scoreboard-catalog";

/**
 * Restricted read-only Prisma store for the MVA Scoreboard Catalog API.
 *
 * Security & Privacy Guarantees:
 * - Read-only queries (`findMany`, `findUnique`, `findFirst`).
 * - Strictly selects only tournament ID/name/year/status, division ID/league_id/name,
 *   registration ID/league_id/league_category_id/team_id/status, and team ID/team_name/logo_url.
 * - Never selects registrant names, contact numbers, emails, registration notes,
 *   registration codes, player rosters, payment records, or admin profiles.
 */
export const prismaScoreboardCatalogStore: ScoreboardCatalogStore = {
  async listLeaguesByStatuses(
    statuses: readonly ScoreboardEligibleLeagueStatus[]
  ): Promise<CatalogLeagueRecord[]> {
    const rows = await prisma.leagues.findMany({
      where: {
        status: {
          in: [...statuses],
        },
      },
      select: {
        id: true,
        name: true,
        year: true,
        status: true,
        created_at: true,
      },
      orderBy: [{ year: "desc" }, { created_at: "desc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      year: row.year,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  async findLeagueById(leagueId: string): Promise<CatalogLeagueRecord | null> {
    const row = await prisma.leagues.findUnique({
      where: { id: leagueId },
      select: {
        id: true,
        name: true,
        year: true,
        status: true,
        created_at: true,
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      year: row.year,
      status: row.status,
      createdAt: row.created_at,
    };
  },

  async listDivisionsByLeague(
    leagueId: string
  ): Promise<CatalogDivisionRecord[]> {
    const rows = await prisma.league_categories.findMany({
      where: { league_id: leagueId },
      select: {
        id: true,
        league_id: true,
        name: true,
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });

    return rows.map((row) => ({
      id: row.id,
      leagueId: row.league_id,
      name: row.name,
    }));
  },

  async findDivision(
    leagueId: string,
    divisionId: string
  ): Promise<CatalogDivisionRecord | null> {
    const row = await prisma.league_categories.findFirst({
      where: {
        id: divisionId,
        league_id: leagueId,
      },
      select: {
        id: true,
        league_id: true,
        name: true,
      },
    });
    if (!row) return null;

    return {
      id: row.id,
      leagueId: row.league_id,
      name: row.name,
    };
  },

  async listVerifiedRegistrations(
    leagueId: string,
    divisionId: string
  ): Promise<CatalogRegistrationRecord[]> {
    const rows = await prisma.registrations.findMany({
      where: {
        league_id: leagueId,
        league_category_id: divisionId,
        status: "VERIFIED",
      },
      select: {
        id: true,
        league_id: true,
        league_category_id: true,
        team_id: true,
        status: true,
        teams: {
          select: {
            id: true,
            team_name: true,
            logo_url: true,
          },
        },
      },
      orderBy: [{ teams: { team_name: "asc" } }, { id: "asc" }],
    });

    return rows.map((row) => ({
      registrationId: row.id,
      leagueId: row.league_id,
      divisionId: row.league_category_id,
      teamId: row.team_id,
      teamName: row.teams.team_name,
      logoUrl: row.teams.logo_url,
      status: row.status,
    }));
  },

  async findRegistrationsByIds(
    registrationIds: readonly string[]
  ): Promise<CatalogRegistrationRecord[]> {
    const rows = await prisma.registrations.findMany({
      where: {
        id: {
          in: [...registrationIds],
        },
      },
      select: {
        id: true,
        league_id: true,
        league_category_id: true,
        team_id: true,
        status: true,
        teams: {
          select: {
            id: true,
            team_name: true,
            logo_url: true,
          },
        },
      },
    });

    return rows.map((row) => ({
      registrationId: row.id,
      leagueId: row.league_id,
      divisionId: row.league_category_id,
      teamId: row.team_id,
      teamName: row.teams.team_name,
      logoUrl: row.teams.logo_url,
      status: row.status,
    }));
  },
};
