import { league_status, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminContext } from "@/lib/auth/admin";

export const tournamentSelect = {
  id: true, name: true, year: true, description: true, status: true,
  registration_open_at: true, registration_close_at: true,
  start_date: true, end_date: true, created_at: true,
  _count: { select: { league_categories: true, registrations: true } },
} as const;

export function mergeDivisionRegistrationCounts<T extends { id: string }>(
  divisions: T[], counts: Array<{ league_category_id: string; _count: { id: number } }>
) {
  const countByDivision = new Map(counts.map(row => [row.league_category_id, row._count.id]));
  return divisions.map(category => ({ ...category, registrationCount: countByDivision.get(category.id) ?? 0 }));
}

export async function listTournaments(page: number) {
  const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const [items, total] = await Promise.all([
    prisma.leagues.findMany({
      select: tournamentSelect,
      orderBy: [{ year: "desc" }, { created_at: "desc" }],
      take: 20, skip: (currentPage - 1) * 20,
    }),
    prisma.leagues.count(),
  ]);
  return { items, total, page: currentPage };
}

export async function getTournament(id: string) {
  const tournament = await prisma.leagues.findUnique({
    where: { id },
    select: { ...tournamentSelect, league_categories: {
      select: { id: true, name: true, description: true, registration_fee: true, min_players: true, max_players: true },
      orderBy: { name: "asc" as const },
    } },
  });
  if (!tournament) return null;
  const divisionIds = tournament.league_categories.map(category => category.id);
  if (divisionIds.length === 0) return { ...tournament, league_categories: mergeDivisionRegistrationCounts(tournament.league_categories, []) };
  const counts = await prisma.registrations.groupBy({
    by: ["league_category_id"],
    where: { league_id: id, league_category_id: { in: divisionIds } },
    _count: { id: true },
  });
  return { ...tournament, league_categories: mergeDivisionRegistrationCounts(tournament.league_categories, counts) };
}

export async function getDivision(tournamentId: string, divisionId: string) {
  return prisma.league_categories.findFirst({
    where: { id: divisionId, league_id: tournamentId },
    select: { id: true, league_id: true, name: true, description: true,
      registration_fee: true, min_players: true, max_players: true },
  });
}

export type DivisionInput = { name: string; description: string | null; registration_fee: Prisma.Decimal;
  min_players: number; max_players: number };
export type DivisionResult = { ok: true } | { ok: false; field: string; message: string };

export function validateDivision(form: FormData): { input?: DivisionInput; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const name = value("name");
  if (!name) errors.name = "Division name is required.";
  else if (name.length > 100) errors.name = "Use 100 characters or fewer.";
  const feeText = value("registration_fee");
  if (!/^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(feeText))
    errors.registration_fee = "Enter a nonnegative fee with at most two decimal places.";
  const minText = value("min_players");
  const maxText = value("max_players");
  const min = Number(minText);
  const max = Number(maxText);
  if (!/^\d+$/.test(minText) || !Number.isSafeInteger(min) || min < 1 || min > 2147483647)
    errors.min_players = "Minimum players must be a positive whole number.";
  if (!/^\d+$/.test(maxText) || !Number.isSafeInteger(max) || max < min || max < 1 || max > 2147483647)
    errors.max_players = "Maximum players must be a whole number at least the minimum.";
  if (Object.keys(errors).length) return { errors };
  return { errors, input: { name, description: value("description") || null,
    registration_fee: new Prisma.Decimal(feeText), min_players: min, max_players: max } };
}

export async function createDivision(admin: AdminContext, tournamentId: string, input: DivisionInput): Promise<DivisionResult> {
  return prisma.$transaction(async (tx): Promise<DivisionResult> => {
    const tournament = await tx.leagues.findUnique({ where: { id: tournamentId }, select: { name: true } });
    if (!tournament) return { ok: false, field: "form", message: "Tournament was not found." };
    const duplicate = await tx.league_categories.findFirst({
      where: { league_id: tournamentId, name: { equals: input.name, mode: "insensitive" } }, select: { id: true },
    });
    if (duplicate) return { ok: false, field: "name", message: "This division name is already used in this tournament." };
    const division = await tx.league_categories.create({ data: { ...input, league_id: tournamentId } });
    await tx.admin_audit_logs.create({ data: { admin_profile_id: admin.profileId,
      action: "TOURNAMENT_DIVISION_CREATED", entity_type: "LEAGUE_CATEGORY", entity_id: division.id,
      metadata: { tournament_id: tournamentId, tournament_name: tournament.name, division_name: division.name,
        registration_fee: division.registration_fee.toString(), min_players: division.min_players,
        max_players: division.max_players, actor_email: admin.email } } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateDivision(admin: AdminContext, tournamentId: string, divisionId: string, input: DivisionInput): Promise<DivisionResult> {
  return prisma.$transaction(async (tx): Promise<DivisionResult> => {
    const previous = await tx.league_categories.findFirst({ where: { id: divisionId, league_id: tournamentId },
      include: { leagues: { select: { name: true } } } });
    if (!previous) return { ok: false, field: "form", message: "Division was not found in this tournament." };
    const duplicate = await tx.league_categories.findFirst({ where: {
      league_id: tournamentId, id: { not: divisionId }, name: { equals: input.name, mode: "insensitive" },
    }, select: { id: true } });
    if (duplicate) return { ok: false, field: "name", message: "This division name is already used in this tournament." };
    const registrationCount = await tx.registrations.count({ where: { league_category_id: divisionId } });
    // Accounting reads the current category fee, so changing it would retroactively change obligations.
    if (registrationCount && !previous.registration_fee.equals(input.registration_fee))
      return { ok: false, field: "registration_fee", message: "Registration fee cannot change after teams have registered." };
    // Keep every existing active roster valid under the revised limits.
    if (registrationCount && input.min_players > previous.min_players) {
      const emptyRoster = await tx.registrations.findFirst({ where: { league_category_id: divisionId,
        registration_players: { none: { status: "ACTIVE" } } }, select: { id: true } });
      const undersized = await tx.registration_players.groupBy({ by: ["registration_id"],
        where: { status: "ACTIVE", registrations: { league_category_id: divisionId } },
        _count: { id: true }, having: { id: { _count: { lt: input.min_players } } },
        orderBy: { registration_id: "asc" }, take: 1 });
      if (emptyRoster || undersized.length)
        return { ok: false, field: "min_players", message: "Minimum exceeds an existing registered roster size." };
    }
    if (registrationCount && input.max_players < previous.max_players) {
      const oversized = await tx.registration_players.groupBy({ by: ["registration_id"],
        where: { status: "ACTIVE", registrations: { league_category_id: divisionId } },
        _count: { id: true }, having: { id: { _count: { gt: input.max_players } } },
        orderBy: { registration_id: "asc" }, take: 1 });
      if (oversized.length)
        return { ok: false, field: "max_players", message: "Maximum is below an existing registered roster size." };
    }
    await tx.league_categories.update({ where: { id: divisionId }, data: input });
    await tx.admin_audit_logs.create({ data: { admin_profile_id: admin.profileId,
      action: "TOURNAMENT_DIVISION_UPDATED", entity_type: "LEAGUE_CATEGORY", entity_id: divisionId,
      metadata: { tournament_id: tournamentId, tournament_name: previous.leagues.name,
        before: { name: previous.name, description: previous.description, registration_fee: previous.registration_fee.toString(),
          min_players: previous.min_players, max_players: previous.max_players },
        after: { name: input.name, description: input.description, registration_fee: input.registration_fee.toString(),
          min_players: input.min_players, max_players: input.max_players }, actor_email: admin.email } } });
    return { ok: true };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export type TournamentInput = {
  name: string; year: number | null; description: string | null;
  registration_open_at: Date | null; registration_close_at: Date | null;
  start_date: Date | null; end_date: Date | null; status: league_status;
};

export type TournamentValidation = { input?: TournamentInput; errors: Record<string, string> };

export function validateTournament(form: FormData, mode: "create" | "edit"): TournamentValidation {
  const errors: Record<string, string> = {};
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const name = value("name");
  if (!name) errors.name = "Tournament name is required.";
  else if (name.length > 150) errors.name = "Use 150 characters or fewer.";
  const yearText = value("year");
  const year = yearText ? Number(yearText) : null;
  if (year !== null && (!Number.isInteger(year) || year < 1900 || year > new Date().getFullYear() + 10))
    errors.year = "Enter a year from 1900 through ten years from now.";
  const parseDate = (key: string, dateOnly = false) => {
    const raw = value(key);
    if (!raw) return null;
    if (!(dateOnly ? /^\d{4}-\d{2}-\d{2}$/.test(raw) : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw))) {
      errors[key] = "Enter a valid date and time."; return null;
    }
    const date = new Date(dateOnly ? `${raw}T00:00:00.000Z` : `${raw}:00+08:00`);
    const roundTrip = dateOnly ? date.toISOString().slice(0, 10) : new Date(date.getTime() + 8 * 60 * 60000).toISOString().slice(0, 16);
    if (Number.isNaN(date.getTime()) || roundTrip !== raw) {
      errors[key] = "Enter a valid date and time."; return null;
    }
    return date;
  };
  const registration_open_at = parseDate("registration_open_at");
  const registration_close_at = parseDate("registration_close_at");
  const start_date = parseDate("start_date", true);
  const end_date = parseDate("end_date", true);
  if (registration_open_at && registration_close_at && registration_close_at < registration_open_at)
    errors.registration_close_at = "Registration close must follow registration open.";
  if (start_date && end_date && end_date < start_date)
    errors.end_date = "Tournament end must follow tournament start.";
  const status = value("status") as league_status;
  const allowed: league_status[] = mode === "create"
    ? ["DRAFT", "OPEN_FOR_REGISTRATION"]
    : ["DRAFT", "OPEN_FOR_REGISTRATION", "REGISTRATION_CLOSED", "ONGOING", "COMPLETED", "ARCHIVED"];
  if (!allowed.includes(status)) errors.status = "Choose a valid status.";
  if (Object.keys(errors).length) return { errors };
  return { errors, input: { name, year, description: value("description") || null,
    registration_open_at, registration_close_at, start_date, end_date, status } };
}

export async function createTournament(admin: AdminContext, input: TournamentInput) {
  return prisma.$transaction(async (tx) => {
    const league = await tx.leagues.create({ data: input });
    await tx.admin_audit_logs.create({ data: {
      admin_profile_id: admin.profileId, action: "TOURNAMENT_CREATED",
      entity_type: "LEAGUE", entity_id: league.id,
      metadata: { name: league.name, year: league.year, status: league.status, actor_email: admin.email },
    } });
    return league.id;
  });
}

export async function updateTournament(admin: AdminContext, id: string, input: TournamentInput) {
  return prisma.$transaction(async (tx) => {
    const previous = await tx.leagues.findUnique({ where: { id } });
    if (!previous) return false;
    await tx.leagues.update({ where: { id }, data: input });
    await tx.admin_audit_logs.create({ data: {
      admin_profile_id: admin.profileId, action: "TOURNAMENT_UPDATED",
      entity_type: "LEAGUE", entity_id: id,
      metadata: { previous: { name: previous.name, year: previous.year, status: previous.status,
        description: previous.description, registration_open_at: previous.registration_open_at?.toISOString(),
        registration_close_at: previous.registration_close_at?.toISOString(),
        start_date: previous.start_date?.toISOString(), end_date: previous.end_date?.toISOString() },
        updated: input, actor_email: admin.email },
    } });
    return true;
  });
}
