import { league_status } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminContext } from "@/lib/auth/admin";

export const tournamentSelect = {
  id: true, name: true, year: true, description: true, status: true,
  registration_open_at: true, registration_close_at: true,
  start_date: true, end_date: true, created_at: true,
  _count: { select: { league_categories: true, registrations: true } },
} as const;

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
  return prisma.leagues.findUnique({
    where: { id },
    select: { ...tournamentSelect, league_categories: {
      select: { id: true, name: true, description: true, _count: { select: { registrations_registrations_league_category_idToleague_categories: true } } },
      orderBy: { name: "asc" as const },
    } },
  });
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
