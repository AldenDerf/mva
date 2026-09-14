"use server";

import {
  getOpenLeagues,
  getLeagueCategories,
  validateLeagueAndCategory,
  calculateRosterFeeAndStatus,
  getExistingTeams,
  getTeamPreviousMembers,
  createRegistration,
  type OpenLeague,
  type LeagueCategory,
  type RosterCalculationResult,
  type ExistingTeamItem,
  type PreviousTeamMember,
  type CreateRegistrationInput,
  type CreateRegistrationResult,
} from "@/lib/registration";

export interface SerializedOpenLeague
  extends Omit<
    OpenLeague,
    "registration_open_at" | "registration_close_at" | "start_date" | "end_date"
  > {
  registration_open_at: string | null;
  registration_close_at: string | null;
  start_date: string | null;
  end_date: string | null;
}

export type SerializedLeagueCategory = LeagueCategory;
export type {
  ExistingTeamItem,
  PreviousTeamMember,
  CreateRegistrationInput,
  CreateRegistrationResult,
};

export interface ActionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function serializeLeague(league: OpenLeague): SerializedOpenLeague {
  return {
    ...league,
    registration_open_at: league.registration_open_at?.toISOString() ?? null,
    registration_close_at: league.registration_close_at?.toISOString() ?? null,
    start_date: league.start_date?.toISOString() ?? null,
    end_date: league.end_date?.toISOString() ?? null,
  };
}

/**
 * Server Action: Retrieve all open leagues for public registration.
 */
export async function fetchOpenLeaguesAction(): Promise<
  ActionResult<SerializedOpenLeague[]>
> {
  try {
    const leagues = await getOpenLeagues();
    return {
      success: true,
      data: leagues.map(serializeLeague),
    };
  } catch (error) {
    console.error("Failed to fetch open leagues:", error);
    return {
      success: false,
      error: "Unable to retrieve open leagues at this time.",
    };
  }
}

/**
 * Server Action: Retrieve categories for a selected league.
 */
export async function fetchLeagueCategoriesAction(
  leagueId: string
): Promise<ActionResult<SerializedLeagueCategory[]>> {
  try {
    const categories = await getLeagueCategories(leagueId);
    return {
      success: true,
      data: categories,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to retrieve categories.";
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Server Action: Validate that a category belongs to an open league.
 */
export async function validateLeagueAndCategoryAction(
  leagueId: string,
  categoryId: string
): Promise<
  ActionResult<{
    league: SerializedOpenLeague;
    category: SerializedLeagueCategory;
  }>
> {
  try {
    const result = await validateLeagueAndCategory(leagueId, categoryId);
    if (!result.valid || !result.league || !result.category) {
      return {
        success: false,
        error: result.error ?? "Validation failed.",
      };
    }

    return {
      success: true,
      data: {
        league: serializeLeague(result.league),
        category: result.category,
      },
    };
  } catch (error) {
    console.error("Failed to validate league and category:", error);
    return {
      success: false,
      error: "Validation check encountered an unexpected error.",
    };
  }
}

/**
 * Server Action: Calculate total registration fee and roster completion status
 * using the selected category's per-player fee and min_players from the database.
 */
export async function calculateRosterAction(
  leagueId: string,
  categoryId: string,
  playerCount: number
): Promise<ActionResult<RosterCalculationResult>> {
  try {
    const validation = await validateLeagueAndCategory(leagueId, categoryId);
    if (!validation.valid || !validation.category) {
      return {
        success: false,
        error: validation.error ?? "Invalid league or category.",
      };
    }

    if (playerCount > validation.category.max_players) {
      return {
        success: false,
        error: `Player count (${playerCount}) exceeds maximum roster limit of ${validation.category.max_players} players for this category.`,
      };
    }

    const feePerPlayer = validation.category.registration_fee;
    const requiredPlayers = validation.category.min_players;
    const calculation = calculateRosterFeeAndStatus(
      playerCount,
      feePerPlayer,
      requiredPlayers
    );

    return {
      success: true,
      data: calculation,
    };
  } catch (error) {
    console.error("Failed to calculate roster fee:", error);
    return {
      success: false,
      error: "An unexpected error occurred during roster calculation.",
    };
  }
}

/**
 * Server Action: Fetch existing teams, annotating whether they are already
 * registered in the specified league & category.
 */
export async function fetchExistingTeamsAction(
  leagueId?: string,
  categoryId?: string
): Promise<ActionResult<ExistingTeamItem[]>> {
  try {
    const teams = await getExistingTeams(leagueId, categoryId);
    return {
      success: true,
      data: teams,
    };
  } catch (error) {
    console.error("Failed to fetch existing teams:", error);
    return {
      success: false,
      error: "Unable to retrieve teams at this time.",
    };
  }
}

/**
 * Server Action: Fetch past team members from previous registrations.
 */
export async function fetchTeamPreviousMembersAction(
  teamId: string
): Promise<ActionResult<PreviousTeamMember[]>> {
  try {
    const members = await getTeamPreviousMembers(teamId);
    return {
      success: true,
      data: members,
    };
  } catch (error) {
    console.error("Failed to fetch previous team members:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to load team members.",
    };
  }
}

/**
 * Server Action: Submit complete public team registration.
 * Validates all inputs server-side, verifies business constraints,
 * creates records in a transaction, and returns the generated registration code.
 */
export async function submitTeamRegistrationAction(
  input: CreateRegistrationInput
): Promise<ActionResult<CreateRegistrationResult>> {
  try {
    const result = await createRegistration(input);
    return {
      success: true,
      data: result,
    };
  } catch (error) {
    console.error("Failed to submit team registration:", error);
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "An unexpected error occurred while submitting your registration.",
    };
  }
}

