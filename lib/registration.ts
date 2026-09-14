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
      ? `Roster complete — ${count}/${minRequired} players.`
      : `Roster incomplete — ${count}/${minRequired} players. You can submit your registration now. Additional players can be added later.`,
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

export interface ExistingTeamItem {
  id: string;
  team_name: string;
  slug: string;
  logo_url: string | null;
  description: string | null;
  is_registered_in_category?: boolean;
}

export interface PreviousTeamMember {
  player_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  jersey_number?: string;
  position?: string;
}

export interface RegistrationPlayerInput {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  jersey_number?: string | number | null;
  position?: string | null;
  is_captain: boolean;
  player_id?: string | null;
}

export interface RegistrantInput {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  contact: string;
  email?: string | null;
}

export interface CreateRegistrationInput {
  league_id: string;
  league_category_id: string;
  team_mode: "existing" | "new";
  team_id?: string | null;
  new_team_name?: string | null;
  registrant: RegistrantInput;
  players: RegistrationPlayerInput[];
}

export interface CreateRegistrationResult {
  registration_id: string;
  registration_code: string | null;
  status: "PENDING_PAYMENT";
  team_id: string;
  team_name: string;
  player_count: number;
  total_fee: number;
  fee_per_player: number;
  is_complete: boolean;
  captain_name: string;
  registrant_name: string;
}

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Retrieves all registered teams, optionally annotating whether each team
 * is already registered in the specified league & category.
 */
export async function getExistingTeams(
  leagueId?: string,
  categoryId?: string
): Promise<ExistingTeamItem[]> {
  const teams = await prisma.teams.findMany({
    select: {
      id: true,
      team_name: true,
      slug: true,
      logo_url: true,
      description: true,
      registrations:
        leagueId && categoryId && isValidUuid(leagueId) && isValidUuid(categoryId)
          ? {
              where: {
                league_id: leagueId,
                league_category_id: categoryId,
              },
              select: {
                id: true,
              },
            }
          : false,
    },
    orderBy: {
      team_name: "asc",
    },
  });

  return teams.map((team) => ({
    id: team.id,
    team_name: team.team_name,
    slug: team.slug,
    logo_url: team.logo_url,
    description: team.description,
    is_registered_in_category: Boolean(
      team.registrations && team.registrations.length > 0
    ),
  }));
}

/**
 * Retrieves past members associated with an existing team from previous registrations.
 * Does NOT mutate or lock historical records; returns reusable player profiles.
 */
export async function getTeamPreviousMembers(
  teamId: string
): Promise<PreviousTeamMember[]> {
  if (!isValidUuid(teamId)) {
    throw new Error("Invalid team ID format.");
  }

  const registrations = await prisma.registrations.findMany({
    where: { team_id: teamId },
    orderBy: { submitted_at: "desc" },
    include: {
      registration_players: {
        include: {
          players: true,
        },
      },
    },
  });

  const seenPlayerIds = new Set<string>();
  const members: PreviousTeamMember[] = [];

  for (const reg of registrations) {
    for (const rp of reg.registration_players) {
      if (!seenPlayerIds.has(rp.player_id)) {
        seenPlayerIds.add(rp.player_id);
        members.push({
          player_id: rp.player_id,
          first_name: rp.players.first_name,
          middle_name: rp.players.middle_name,
          last_name: rp.players.last_name,
          suffix: rp.players.suffix,
          jersey_number:
            rp.jersey_number !== null ? String(rp.jersey_number) : undefined,
          position: rp.position ?? undefined,
        });
      }
    }
  }

  return members;
}

/**
 * Creates a public team registration with all validations applied.
 * Uses a database transaction to ensure atomicity.
 * Sets status to PENDING_PAYMENT.
 */
export async function createRegistration(
  input: CreateRegistrationInput
): Promise<CreateRegistrationResult> {
  // 1. Authoritative validation of League and Category
  const validation = await validateLeagueAndCategory(
    input.league_id,
    input.league_category_id
  );
  if (!validation.valid || !validation.league || !validation.category) {
    throw new Error(validation.error ?? "Invalid league or category.");
  }

  const { league, category } = validation;

  // 2. Validate Registrant
  if (!input.registrant.first_name?.trim() || !input.registrant.last_name?.trim()) {
    throw new Error("Registrant first and last name are required.");
  }
  if (!input.registrant.contact?.trim()) {
    throw new Error("Registrant contact number is required.");
  }

  // 3. Validate Roster
  if (!input.players || input.players.length === 0) {
    throw new Error("At least one player is required to register a team.");
  }

  if (input.players.length > category.max_players) {
    throw new Error(
      `Player count (${input.players.length}) exceeds the maximum limit of ${category.max_players} players.`
    );
  }

  // Check captain assignment: exactly one player must be designated as captain
  const captains = input.players.filter((p) => p.is_captain);
  if (captains.length !== 1) {
    throw new Error(
      "A single team captain must be selected from the current registration roster."
    );
  }
  const designatedCaptain = captains[0];

  // 4. Validate Team
  let targetTeamId: string;
  let targetTeamName: string;

  if (input.team_mode === "existing") {
    if (!input.team_id || !isValidUuid(input.team_id)) {
      throw new Error("Please select a valid existing team.");
    }

    const existingTeam = await prisma.teams.findUnique({
      where: { id: input.team_id },
    });

    if (!existingTeam) {
      throw new Error("The selected existing team was not found.");
    }

    // Ensure team is not already registered in this league/category
    const duplicateCheck = await prisma.registrations.findUnique({
      where: {
        league_id_league_category_id_team_id: {
          league_id: league.id,
          league_category_id: category.id,
          team_id: existingTeam.id,
        },
      },
    });

    if (duplicateCheck) {
      throw new Error(
        `Team "${existingTeam.team_name}" is already registered in this division.`
      );
    }

    targetTeamId = existingTeam.id;
    targetTeamName = existingTeam.team_name;
  } else {
    // New Team Flow
    const trimmedName = input.new_team_name?.trim();
    if (!trimmedName) {
      throw new Error("Team name is required for creating a new team.");
    }

    // Check if team name already exists
    const duplicateTeam = await prisma.teams.findFirst({
      where: {
        team_name: {
          equals: trimmedName,
          mode: "insensitive",
        },
      },
    });

    if (duplicateTeam) {
      throw new Error(
        `A team named "${trimmedName}" already exists. Please choose another name or select "I have an existing team".`
      );
    }

    let slug = generateSlug(trimmedName);
    if (!slug) slug = `team-${Date.now()}`;

    // Verify slug uniqueness
    const existingSlug = await prisma.teams.findUnique({
      where: { slug },
    });
    if (existingSlug) {
      slug = `${slug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const newTeam = await prisma.teams.create({
      data: {
        team_name: trimmedName,
        slug,
      },
    });

    targetTeamId = newTeam.id;
    targetTeamName = newTeam.team_name;
  }

  // 5. Database Transaction: Process Players and Create Registration
  const feePerPlayer = category.registration_fee;
  const playerCount = input.players.length;
  const totalFee = playerCount * feePerPlayer;
  const isComplete = playerCount >= category.min_players;

  const result = await prisma.$transaction(async (tx) => {
    // A. Resolve or create player records
    const resolvedPlayers: Array<{
      playerId: string;
      jerseyNumber: number | null;
      position: string | null;
      isCaptain: boolean;
    }> = [];

    for (const p of input.players) {
      let resolvedPlayerId: string | null = null;

      // 1. If existing player_id provided and exists
      if (p.player_id && isValidUuid(p.player_id)) {
        const existingPlayer = await tx.players.findUnique({
          where: { id: p.player_id },
          select: { id: true },
        });
        if (existingPlayer) {
          resolvedPlayerId = existingPlayer.id;
        }
      }

      // 2. If no valid ID, search by first_name and last_name
      if (!resolvedPlayerId) {
        const matchedPlayer = await tx.players.findFirst({
          where: {
            first_name: {
              equals: p.first_name.trim(),
              mode: "insensitive",
            },
            last_name: {
              equals: p.last_name.trim(),
              mode: "insensitive",
            },
          },
          select: { id: true },
        });

        if (matchedPlayer) {
          resolvedPlayerId = matchedPlayer.id;
        }
      }

      // 3. Create player record if not found
      if (!resolvedPlayerId) {
        const newPlayer = await tx.players.create({
          data: {
            first_name: p.first_name.trim(),
            middle_name: p.middle_name?.trim() || null,
            last_name: p.last_name.trim(),
            suffix: p.suffix?.trim() || null,
          },
          select: { id: true },
        });
        resolvedPlayerId = newPlayer.id;
      }

      const parsedJersey =
        p.jersey_number !== undefined && p.jersey_number !== null && p.jersey_number !== ""
          ? parseInt(String(p.jersey_number), 10)
          : null;

      resolvedPlayers.push({
        playerId: resolvedPlayerId,
        jerseyNumber: isNaN(parsedJersey ?? NaN) ? null : parsedJersey,
        position: p.position?.trim() || null,
        isCaptain: p.is_captain,
      });
    }

    // B. Create Registration Record
    const registration = await tx.registrations.create({
      data: {
        league_id: league.id,
        league_category_id: category.id,
        team_id: targetTeamId,
        registrant_first_name: input.registrant.first_name.trim(),
        registrant_middle_name: input.registrant.middle_name?.trim() || null,
        registrant_last_name: input.registrant.last_name.trim(),
        registrant_suffix: input.registrant.suffix?.trim() || null,
        registrant_contact: input.registrant.contact.trim(),
        registrant_email: input.registrant.email?.trim() || null,
        status: "PENDING_PAYMENT",
        submitted_at: new Date(),
      },
    });

    // C. Create registration_players records
    for (const rp of resolvedPlayers) {
      await tx.registration_players.create({
        data: {
          registration_id: registration.id,
          player_id: rp.playerId,
          jersey_number: rp.jerseyNumber,
          position: rp.position,
          is_captain: rp.isCaptain,
        },
      });
    }

    // D. Create pending payment record to retain calculated total fee
    await tx.payments.create({
      data: {
        registration_id: registration.id,
        payment_method: "OTHER",
        amount: totalFee,
        status: "PENDING",
        notes: `Initial registration fee assessment: ${playerCount} players × ₱${feePerPlayer}.`,
      },
    });

    // E. Re-read registration to capture registration_code generated by trigger
    const updatedReg = await tx.registrations.findUnique({
      where: { id: registration.id },
      select: {
        id: true,
        registration_code: true,
        status: true,
      },
    });

    return {
      registration_id: registration.id,
      registration_code: updatedReg?.registration_code ?? null,
      status: "PENDING_PAYMENT" as const,
      team_id: targetTeamId,
      team_name: targetTeamName,
      player_count: playerCount,
      total_fee: totalFee,
      fee_per_player: feePerPlayer,
      is_complete: isComplete,
      captain_name: `${designatedCaptain.first_name} ${designatedCaptain.last_name}`.trim(),
      registrant_name: `${input.registrant.first_name} ${input.registrant.last_name}`.trim(),
    };
  });

  return result;
}

