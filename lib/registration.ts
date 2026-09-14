import { prisma } from "./prisma";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

export interface OpenLeague {
  id: string;
  name: string;
  year: number | null;
  description: string | null;
  registration_open_at: Date | null;
  registration_close_at: Date | null;
  start_date: Date | null;
  end_date: Date | null;
  status: "OPEN_FOR_REGISTRATION";
}

export interface LeagueCategory {
  id: string;
  league_id: string;
  name: string;
  description: string | null;
  registration_fee: number;
  min_players: number;
  max_players: number;
}

export interface LeagueCategoryValidationResult {
  valid: boolean;
  league?: OpenLeague;
  category?: LeagueCategory;
  error?: string;
}

export interface RosterCalculationResult {
  player_count: number;
  fee_per_player: number;
  total_fee: number;
  is_complete: boolean;
  required_minimum: number;
  status: "INCOMPLETE" | "COMPLETE";
  message: string;
}

/**
 * Calculates total registration fee based on player count and per-player fee,
 * and determines whether the roster meets the final minimum player requirement
 * configured for the selected category in the database.
 * Note: Teams are permitted to register with fewer players (marked INCOMPLETE).
 */
export function calculateRosterFeeAndStatus(
  playerCount: number,
  feePerPlayer: number,
  requiredPlayers: number
): RosterCalculationResult {
  const count = Math.max(0, Math.floor(playerCount));
  const minRequired = Math.max(1, Math.floor(requiredPlayers));
  const isComplete = count >= minRequired;
  const total = count * feePerPlayer;

  return {
    player_count: count,
    fee_per_player: feePerPlayer,
    total_fee: total,
    is_complete: isComplete,
    required_minimum: minRequired,
    status: isComplete ? "COMPLETE" : "INCOMPLETE",
    message: isComplete
      ? `Roster meets the final requirement of at least ${minRequired} players.`
      : `Roster is currently incomplete (${count}/${minRequired} players). Registration is permitted, but the roster must reach at least ${minRequired} players before final roster lock.`,
  };
}

/**
 * Retrieves all leagues that are currently open for public registration.
 * Only leagues with status OPEN_FOR_REGISTRATION are returned.
 */
export async function getOpenLeagues(): Promise<OpenLeague[]> {
  const leagues = await prisma.leagues.findMany({
    where: {
      status: "OPEN_FOR_REGISTRATION",
    },
    select: {
      id: true,
      name: true,
      year: true,
      description: true,
      registration_open_at: true,
      registration_close_at: true,
      start_date: true,
      end_date: true,
      status: true,
    },
    orderBy: [
      { registration_close_at: "asc" },
      { start_date: "asc" },
      { name: "asc" },
    ],
  });

  return leagues.map((league) => ({
    id: league.id,
    name: league.name,
    year: league.year,
    description: league.description,
    registration_open_at: league.registration_open_at,
    registration_close_at: league.registration_close_at,
    start_date: league.start_date,
    end_date: league.end_date,
    status: "OPEN_FOR_REGISTRATION" as const,
  }));
}

/**
 * Retrieves a single league by ID only if it is open for registration.
 */
export async function getOpenLeagueById(
  leagueId: string
): Promise<OpenLeague | null> {
  if (!isValidUuid(leagueId)) {
    return null;
  }

  const league = await prisma.leagues.findFirst({
    where: {
      id: leagueId,
      status: "OPEN_FOR_REGISTRATION",
    },
    select: {
      id: true,
      name: true,
      year: true,
      description: true,
      registration_open_at: true,
      registration_close_at: true,
      start_date: true,
      end_date: true,
      status: true,
    },
  });

  if (!league) {
    return null;
  }

  return {
    id: league.id,
    name: league.name,
    year: league.year,
    description: league.description,
    registration_open_at: league.registration_open_at,
    registration_close_at: league.registration_close_at,
    start_date: league.start_date,
    end_date: league.end_date,
    status: "OPEN_FOR_REGISTRATION" as const,
  };
}

/**
 * Retrieves categories for a selected league.
 * Enforces that:
 * 1. League ID is a valid UUID format
 * 2. The league exists
 * 3. The league is currently open for registration
 * 4. Returns only categories belonging to that league
 */
export async function getLeagueCategories(
  leagueId: string
): Promise<LeagueCategory[]> {
  if (!isValidUuid(leagueId)) {
    throw new Error("Invalid league ID format.");
  }

  const league = await prisma.leagues.findUnique({
    where: { id: leagueId },
    select: { id: true, status: true },
  });

  if (!league) {
    throw new Error("League not found.");
  }

  if (league.status !== "OPEN_FOR_REGISTRATION") {
    throw new Error("League is not currently open for registration.");
  }

  const categories = await prisma.league_categories.findMany({
    where: {
      league_id: leagueId,
    },
    select: {
      id: true,
      league_id: true,
      name: true,
      description: true,
      registration_fee: true,
      min_players: true,
      max_players: true,
    },
    orderBy: {
      name: "asc",
    },
  });

  return categories.map((cat) => ({
    id: cat.id,
    league_id: cat.league_id,
    name: cat.name,
    description: cat.description,
    registration_fee: Number(cat.registration_fee),
    min_players: cat.min_players,
    max_players: cat.max_players,
  }));
}

/**
 * Validates the league and category boundary for public registration.
 * Confirms that:
 * 1. League and Category IDs are valid UUIDs
 * 2. League exists and is OPEN_FOR_REGISTRATION
 * 3. Category exists and belongs to the specified league
 */
export async function validateLeagueAndCategory(
  leagueId: string,
  categoryId: string
): Promise<LeagueCategoryValidationResult> {
  if (!isValidUuid(leagueId)) {
    return { valid: false, error: "Invalid league ID format." };
  }

  if (!isValidUuid(categoryId)) {
    return { valid: false, error: "Invalid category ID format." };
  }

  const league = await getOpenLeagueById(leagueId);
  if (!league) {
    return {
      valid: false,
      error: "Selected league is not open for registration or does not exist.",
    };
  }

  const category = await prisma.league_categories.findFirst({
    where: {
      id: categoryId,
      league_id: leagueId,
    },
    select: {
      id: true,
      league_id: true,
      name: true,
      description: true,
      registration_fee: true,
      min_players: true,
      max_players: true,
    },
  });

  if (!category) {
    return {
      valid: false,
      error: "Selected category does not belong to the specified league.",
    };
  }

  return {
    valid: true,
    league,
    category: {
      id: category.id,
      league_id: category.league_id,
      name: category.name,
      description: category.description,
      registration_fee: Number(category.registration_fee),
      min_players: category.min_players,
      max_players: category.max_players,
    },
  };
}
