import { createHash, timingSafeEqual } from "node:crypto";

/**
 * MVA Scoreboard Catalog Integration Policy & Service
 *
 * Architectural boundary:
 *   Scoreboard server -> authenticated MVA integration API -> MVA database
 *
 * Tournament Eligibility Policy (Phase 01C / Phase 02):
 *   Only tournaments in `REGISTRATION_CLOSED` or `ONGOING` status are eligible
 *   for new scoreboard match selection and matchup validation by default.
 *   - `DRAFT`, `OPEN_FOR_REGISTRATION`, and `ADMIN_REGISTRATION_ONLY` are excluded
 *     because team entries have not settled for official match scheduling.
 *   - `COMPLETED` and `ARCHIVED` are excluded from new match creation.
 *
 * Team / Registration Eligibility Policy:
 *   Only registrations with `status = 'VERIFIED'` belonging to the requested
 *   eligible tournament (`league_id`) and division (`league_category_id`) are
 *   selectable or valid for a matchup.
 */

export type MvaLeagueStatus =
  | "DRAFT"
  | "OPEN_FOR_REGISTRATION"
  | "ADMIN_REGISTRATION_ONLY"
  | "REGISTRATION_CLOSED"
  | "ONGOING"
  | "COMPLETED"
  | "ARCHIVED";

export type MvaRegistrationStatus =
  | "PENDING_PAYMENT"
  | "VERIFIED"
  | "REJECTED"
  | "CANCELLED";

export const SCOREBOARD_ELIGIBLE_LEAGUE_STATUSES = [
  "REGISTRATION_CLOSED",
  "ONGOING",
] as const;

export type ScoreboardEligibleLeagueStatus =
  (typeof SCOREBOARD_ELIGIBLE_LEAGUE_STATUSES)[number];

export const SCOREBOARD_ELIGIBLE_REGISTRATION_STATUS = "VERIFIED" as const;

export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export const MAX_LOGO_URL_LENGTH = 2048;
export const MIN_INTEGRATION_TOKEN_LENGTH = 16;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_REGEX.test(value.trim());
}

export function isEligibleTournamentStatus(
  status: unknown
): status is ScoreboardEligibleLeagueStatus {
  return (
    typeof status === "string" &&
    (SCOREBOARD_ELIGIBLE_LEAGUE_STATUSES as readonly string[]).includes(status)
  );
}

export interface TournamentSummary {
  id: string;
  name: string;
  year: number | null;
  status: MvaLeagueStatus;
}

export interface DivisionSummary {
  id: string;
  tournamentId: string;
  name: string;
}

export interface EligibleTeam {
  registrationId: string;
  teamId: string;
  name: string;
  logoUrl: string | null;
}

export interface CatalogPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ValidateMatchupRequest {
  tournamentId: string;
  divisionId: string;
  registrationAId: string;
  registrationBId: string;
}

export interface ValidatedMatchup {
  tournament: TournamentSummary;
  division: DivisionSummary;
  teamA: EligibleTeam;
  teamB: EligibleTeam;
  validatedAt: string;
}

export interface VerifyAdminStatusResponse {
  authUserId: string;
  isActiveAdmin: boolean;
  verifiedAt: string;
}

export interface CatalogLeagueRecord {
  id: string;
  name: string;
  year: number | null;
  status: MvaLeagueStatus;
  createdAt: Date;
}

export interface CatalogDivisionRecord {
  id: string;
  leagueId: string;
  name: string;
}

export interface CatalogRegistrationRecord {
  registrationId: string;
  leagueId: string;
  divisionId: string;
  teamId: string;
  teamName: string;
  logoUrl: string | null;
  status: MvaRegistrationStatus;
}

export interface CatalogAdminAccessRecord {
  authUserId: string;
  isActive: boolean;
  role: string;
}

export interface ScoreboardCatalogStore {
  listLeaguesByStatuses(
    statuses: readonly ScoreboardEligibleLeagueStatus[]
  ): Promise<CatalogLeagueRecord[]>;
  findLeagueById(leagueId: string): Promise<CatalogLeagueRecord | null>;
  listDivisionsByLeague(leagueId: string): Promise<CatalogDivisionRecord[]>;
  findDivision(
    leagueId: string,
    divisionId: string
  ): Promise<CatalogDivisionRecord | null>;
  listVerifiedRegistrations(
    leagueId: string,
    divisionId: string
  ): Promise<CatalogRegistrationRecord[]>;
  findRegistrationsByIds(
    registrationIds: readonly string[]
  ): Promise<CatalogRegistrationRecord[]>;
  findAdminAccessByAuthUserId?(
    authUserId: string
  ): Promise<CatalogAdminAccessRecord | null>;
}

export type IntegrationAuthResult =
  | { ok: true }
  | {
      ok: false;
      status: 401 | 503;
      code: "UNAUTHORIZED" | "INTEGRATION_UNCONFIGURED";
      error: string;
    };

/**
 * Verifies machine-to-machine `Authorization: Bearer <token>` credentials.
 * Fails closed when unconfigured (503) or when credentials are missing/invalid (401).
 */
export function verifyScoreboardIntegrationRequest(
  request: Request,
  configuredSecret: string | undefined = process.env.MVA_SCOREBOARD_INTEGRATION_TOKEN
): IntegrationAuthResult {
  const secret = typeof configuredSecret === "string" ? configuredSecret.trim() : "";
  if (secret.length < MIN_INTEGRATION_TOKEN_LENGTH) {
    return {
      ok: false,
      status: 503,
      code: "INTEGRATION_UNCONFIGURED",
      error: "Scoreboard integration is not configured.",
    };
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Unauthorized integration request.",
    };
  }

  const match = /^Bearer\s+(\S+)$/.exec(authHeader.trim());
  if (!match) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Unauthorized integration request.",
    };
  }

  const providedToken = match[1];
  const expectedDigest = createHash("sha256").update(secret, "utf8").digest();
  const providedDigest = createHash("sha256").update(providedToken, "utf8").digest();

  if (
    !timingSafeEqual(expectedDigest, providedDigest) ||
    providedToken.length !== secret.length
  ) {
    return {
      ok: false,
      status: 401,
      code: "UNAUTHORIZED",
      error: "Unauthorized integration request.",
    };
  }

  return { ok: true };
}

export function buildAllowedLogoHosts(
  rawAllowedHosts: string | undefined = process.env.MVA_LOGO_ALLOWED_HOSTS,
  supabaseUrl: string | undefined = process.env.NEXT_PUBLIC_SUPABASE_URL
): Set<string> {
  const hosts = new Set<string>();

  if (typeof rawAllowedHosts === "string") {
    for (const part of rawAllowedHosts.split(",")) {
      const normalized = part.trim().toLowerCase();
      if (normalized && !normalized.includes("/") && !normalized.includes(":")) {
        hosts.add(normalized);
      }
    }
  }

  if (typeof supabaseUrl === "string" && supabaseUrl.trim()) {
    try {
      const parsed = new URL(supabaseUrl.trim());
      const hostname = parsed.hostname.toLowerCase();
      if (
        parsed.protocol === "https:" &&
        hostname &&
        hostname !== "your-project.supabase.co"
      ) {
        hosts.add(hostname);
      }
    } catch {
      // Ignore invalid Supabase URL
    }
  }

  return hosts;
}

/**
 * Validates a team logo URL against HTTPS scheme, credential absence, length bounds,
 * and the approved host allowlist. Returns `null` for missing or untrusted URLs.
 */
export function sanitizeScoreboardLogoUrl(
  logoUrl: string | null | undefined,
  allowedHosts: ReadonlySet<string> = buildAllowedLogoHosts()
): string | null {
  if (typeof logoUrl !== "string") return null;
  const trimmed = logoUrl.trim();
  if (!trimmed || trimmed.length > MAX_LOGO_URL_LENGTH) return null;

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") return null;
    if (parsed.username || parsed.password) return null;
    const hostname = parsed.hostname.toLowerCase();
    if (!hostname || !allowedHosts.has(hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export type PaginationParseResult =
  | { ok: true; cursor: string | null; limit: number }
  | { ok: false; error: string };

export function parsePaginationParams(
  searchParams: URLSearchParams
): PaginationParseResult {
  const rawCursor = searchParams.get("cursor");
  let cursor: string | null = null;
  if (rawCursor !== null && rawCursor.trim() !== "") {
    if (!isValidUuid(rawCursor)) {
      return { ok: false, error: "Invalid pagination cursor format." };
    }
    cursor = rawCursor.trim().toLowerCase();
  }

  const rawLimit = searchParams.get("limit");
  if (rawLimit === null || rawLimit.trim() === "") {
    return { ok: true, cursor, limit: DEFAULT_PAGE_LIMIT };
  }

  if (!/^\d+$/.test(rawLimit.trim())) {
    return { ok: false, error: "Pagination limit must be an integer between 1 and 100." };
  }

  const limit = Number(rawLimit.trim());
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_PAGE_LIMIT) {
    return { ok: false, error: "Pagination limit must be an integer between 1 and 100." };
  }

  return { ok: true, cursor, limit };
}

export function paginateById<T>(
  items: readonly T[],
  getId: (item: T) => string,
  cursor: string | null,
  limit: number
): { ok: true; page: CatalogPage<T> } | { ok: false; error: string } {
  let startIndex = 0;
  if (cursor !== null) {
    const idx = items.findIndex(
      (item) => getId(item).toLowerCase() === cursor.toLowerCase()
    );
    if (idx === -1) {
      return { ok: false, error: "Pagination cursor was not found." };
    }
    startIndex = idx + 1;
  }

  const slice = items.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < items.length;
  const nextCursor =
    hasMore && slice.length > 0 ? getId(slice[slice.length - 1]) : null;

  return {
    ok: true,
    page: {
      items: slice,
      nextCursor,
    },
  };
}

const NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function jsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: Record<string, string>
): Response {
  return Response.json(body, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      ...extraHeaders,
    },
  });
}

export function methodNotAllowedResponse(allowed: "GET" | "POST"): Response {
  return jsonResponse(
    { error: "Method not allowed.", code: "METHOD_NOT_ALLOWED" },
    405,
    { Allow: allowed }
  );
}

function authorizeOrRespond(
  request: Request,
  configuredSecret?: string
): Response | null {
  const auth = verifyScoreboardIntegrationRequest(request, configuredSecret);
  if (!auth.ok) {
    return jsonResponse(
      { error: auth.error, code: auth.code },
      auth.status,
      auth.status === 401 ? { "WWW-Authenticate": 'Bearer realm="mva-scoreboard"' } : undefined
    );
  }
  return null;
}

export interface CatalogHandlerOptions {
  store: ScoreboardCatalogStore;
  secret?: string;
  allowedLogoHosts?: ReadonlySet<string>;
}

/**
 * A. GET /api/integrations/scoreboard/tournaments
 */
export async function handleListTournamentsRequest(
  request: Request,
  options: CatalogHandlerOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const authError = authorizeOrRespond(request, options.secret);
  if (authError) return authError;

  const url = new URL(request.url);
  const pagination = parsePaginationParams(url.searchParams);
  if (!pagination.ok) {
    return jsonResponse({ error: pagination.error, code: "INVALID_REQUEST" }, 400);
  }

  try {
    const records = await options.store.listLeaguesByStatuses(
      SCOREBOARD_ELIGIBLE_LEAGUE_STATUSES
    );

    const eligibleTournaments: TournamentSummary[] = records
      .filter((record) => isEligibleTournamentStatus(record.status))
      .map((record) => ({
        id: record.id,
        name: record.name,
        year: record.year,
        status: record.status,
      }));

    const paged = paginateById(
      eligibleTournaments,
      (item) => item.id,
      pagination.cursor,
      pagination.limit
    );
    if (!paged.ok) {
      return jsonResponse({ error: paged.error, code: "INVALID_REQUEST" }, 400);
    }

    return jsonResponse(paged.page, 200);
  } catch {
    return jsonResponse(
      { error: "Tournament catalog is temporarily unavailable.", code: "UPSTREAM_ERROR" },
      503
    );
  }
}

/**
 * B. GET /api/integrations/scoreboard/divisions?tournamentId={uuid}
 */
export async function handleListDivisionsRequest(
  request: Request,
  options: CatalogHandlerOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const authError = authorizeOrRespond(request, options.secret);
  if (authError) return authError;

  const url = new URL(request.url);
  const rawTournamentId = url.searchParams.get("tournamentId");
  if (!isValidUuid(rawTournamentId)) {
    return jsonResponse(
      { error: "A valid tournamentId UUID is required.", code: "INVALID_REQUEST" },
      400
    );
  }
  const tournamentId = rawTournamentId.trim().toLowerCase();

  const pagination = parsePaginationParams(url.searchParams);
  if (!pagination.ok) {
    return jsonResponse({ error: pagination.error, code: "INVALID_REQUEST" }, 400);
  }

  try {
    const tournament = await options.store.findLeagueById(tournamentId);
    if (!tournament) {
      return jsonResponse(
        { error: "Tournament not found.", code: "NOT_FOUND" },
        404
      );
    }
    if (!isEligibleTournamentStatus(tournament.status)) {
      return jsonResponse(
        {
          error: "Tournament status is not eligible for scoreboard scheduling.",
          code: "INELIGIBLE_TOURNAMENT",
        },
        409
      );
    }

    const records = await options.store.listDivisionsByLeague(tournament.id);
    const divisions: DivisionSummary[] = records
      .filter(
        (record) => record.leagueId.toLowerCase() === tournament.id.toLowerCase()
      )
      .map((record) => ({
        id: record.id,
        tournamentId: record.leagueId,
        name: record.name,
      }));

    const paged = paginateById(
      divisions,
      (item) => item.id,
      pagination.cursor,
      pagination.limit
    );
    if (!paged.ok) {
      return jsonResponse({ error: paged.error, code: "INVALID_REQUEST" }, 400);
    }

    return jsonResponse(paged.page, 200);
  } catch {
    return jsonResponse(
      { error: "Division catalog is temporarily unavailable.", code: "UPSTREAM_ERROR" },
      503
    );
  }
}

/**
 * C. GET /api/integrations/scoreboard/teams?tournamentId={uuid}&divisionId={uuid}
 */
export async function handleListTeamsRequest(
  request: Request,
  options: CatalogHandlerOptions
): Promise<Response> {
  if (request.method !== "GET") {
    return methodNotAllowedResponse("GET");
  }

  const authError = authorizeOrRespond(request, options.secret);
  if (authError) return authError;

  const url = new URL(request.url);
  const rawTournamentId = url.searchParams.get("tournamentId");
  const rawDivisionId = url.searchParams.get("divisionId");
  if (!isValidUuid(rawTournamentId) || !isValidUuid(rawDivisionId)) {
    return jsonResponse(
      {
        error: "Valid tournamentId and divisionId UUIDs are required.",
        code: "INVALID_REQUEST",
      },
      400
    );
  }
  const tournamentId = rawTournamentId.trim().toLowerCase();
  const divisionId = rawDivisionId.trim().toLowerCase();

  const pagination = parsePaginationParams(url.searchParams);
  if (!pagination.ok) {
    return jsonResponse({ error: pagination.error, code: "INVALID_REQUEST" }, 400);
  }

  try {
    const tournament = await options.store.findLeagueById(tournamentId);
    if (!tournament) {
      return jsonResponse(
        { error: "Tournament not found.", code: "NOT_FOUND" },
        404
      );
    }
    if (!isEligibleTournamentStatus(tournament.status)) {
      return jsonResponse(
        {
          error: "Tournament status is not eligible for scoreboard scheduling.",
          code: "INELIGIBLE_TOURNAMENT",
        },
        409
      );
    }

    const division = await options.store.findDivision(tournament.id, divisionId);
    if (
      !division ||
      division.leagueId.toLowerCase() !== tournament.id.toLowerCase()
    ) {
      return jsonResponse(
        { error: "Division not found in the specified tournament.", code: "NOT_FOUND" },
        404
      );
    }

    const allowedLogoHosts = options.allowedLogoHosts ?? buildAllowedLogoHosts();
    const registrations = await options.store.listVerifiedRegistrations(
      tournament.id,
      division.id
    );

    const seenTeamIds = new Set<string>();
    const eligibleTeams: EligibleTeam[] = [];

    for (const reg of registrations) {
      if (
        reg.status !== SCOREBOARD_ELIGIBLE_REGISTRATION_STATUS ||
        reg.leagueId.toLowerCase() !== tournament.id.toLowerCase() ||
        reg.divisionId.toLowerCase() !== division.id.toLowerCase()
      ) {
        continue;
      }
      const normalizedTeamId = reg.teamId.toLowerCase();
      if (seenTeamIds.has(normalizedTeamId)) {
        continue;
      }
      seenTeamIds.add(normalizedTeamId);

      eligibleTeams.push({
        registrationId: reg.registrationId,
        teamId: reg.teamId,
        name: reg.teamName,
        logoUrl: sanitizeScoreboardLogoUrl(reg.logoUrl, allowedLogoHosts),
      });
    }

    const paged = paginateById(
      eligibleTeams,
      (item) => item.registrationId,
      pagination.cursor,
      pagination.limit
    );
    if (!paged.ok) {
      return jsonResponse({ error: paged.error, code: "INVALID_REQUEST" }, 400);
    }

    return jsonResponse(paged.page, 200);
  } catch {
    return jsonResponse(
      { error: "Team catalog is temporarily unavailable.", code: "UPSTREAM_ERROR" },
      503
    );
  }
}

/**
 * D. POST /api/integrations/scoreboard/validate-matchup
 */
export async function handleValidateMatchupRequest(
  request: Request,
  options: CatalogHandlerOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authError = authorizeOrRespond(request, options.secret);
  if (authError) return authError;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 4096) {
    return jsonResponse(
      { error: "Request payload too large.", code: "PAYLOAD_TOO_LARGE" },
      413
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body.", code: "INVALID_REQUEST" },
      400
    );
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return jsonResponse(
      { error: "Matchup validation payload must be a JSON object.", code: "INVALID_REQUEST" },
      400
    );
  }

  const input = rawBody as Record<string, unknown>;
  const { tournamentId, divisionId, registrationAId, registrationBId } = input;

  if (
    !isValidUuid(tournamentId) ||
    !isValidUuid(divisionId) ||
    !isValidUuid(registrationAId) ||
    !isValidUuid(registrationBId)
  ) {
    return jsonResponse(
      {
        error:
          "tournamentId, divisionId, registrationAId, and registrationBId must be valid UUIDs.",
        code: "INVALID_REQUEST",
      },
      400
    );
  }

  const normTournamentId = tournamentId.trim().toLowerCase();
  const normDivisionId = divisionId.trim().toLowerCase();
  const normRegAId = registrationAId.trim().toLowerCase();
  const normRegBId = registrationBId.trim().toLowerCase();

  if (normRegAId === normRegBId) {
    return jsonResponse(
      {
        error: "Team A and Team B must reference two distinct registrations.",
        code: "IDENTICAL_TEAM",
      },
      400
    );
  }

  try {
    const tournament = await options.store.findLeagueById(normTournamentId);
    if (!tournament) {
      return jsonResponse(
        { error: "Tournament not found.", code: "NOT_FOUND" },
        404
      );
    }

    if (!isEligibleTournamentStatus(tournament.status)) {
      return jsonResponse(
        {
          error: "Tournament is not in an eligible status for scoreboard matches.",
          code: "INELIGIBLE_TOURNAMENT",
        },
        409
      );
    }

    const division = await options.store.findDivision(
      tournament.id,
      normDivisionId
    );
    if (
      !division ||
      division.leagueId.toLowerCase() !== tournament.id.toLowerCase()
    ) {
      return jsonResponse(
        { error: "Division does not belong to the specified tournament.", code: "NOT_FOUND" },
        404
      );
    }

    const registrations = await options.store.findRegistrationsByIds([
      normRegAId,
      normRegBId,
    ]);

    const regA = registrations.find(
      (reg) => reg.registrationId.toLowerCase() === normRegAId
    );
    const regB = registrations.find(
      (reg) => reg.registrationId.toLowerCase() === normRegBId
    );

    if (!regA || !regB) {
      return jsonResponse(
        {
          error: "One or both team registrations do not exist.",
          code: "INELIGIBLE_MATCHUP",
        },
        409
      );
    }

    if (
      regA.leagueId.toLowerCase() !== tournament.id.toLowerCase() ||
      regB.leagueId.toLowerCase() !== tournament.id.toLowerCase() ||
      regA.divisionId.toLowerCase() !== division.id.toLowerCase() ||
      regB.divisionId.toLowerCase() !== division.id.toLowerCase()
    ) {
      return jsonResponse(
        {
          error:
            "Both team registrations must belong to the selected tournament and division.",
          code: "CROSS_DIVISION_OR_TOURNAMENT",
        },
        409
      );
    }

    if (
      regA.status !== SCOREBOARD_ELIGIBLE_REGISTRATION_STATUS ||
      regB.status !== SCOREBOARD_ELIGIBLE_REGISTRATION_STATUS
    ) {
      return jsonResponse(
        {
          error:
            "Both team registrations must have VERIFIED status to be eligible.",
          code: "UNVERIFIED_REGISTRATION",
        },
        409
      );
    }

    if (regA.teamId.toLowerCase() === regB.teamId.toLowerCase()) {
      return jsonResponse(
        {
          error: "Team A and Team B must be distinct teams.",
          code: "IDENTICAL_TEAM",
        },
        409
      );
    }

    const allowedLogoHosts = options.allowedLogoHosts ?? buildAllowedLogoHosts();

    const responsePayload: ValidatedMatchup = {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        year: tournament.year,
        status: tournament.status,
      },
      division: {
        id: division.id,
        tournamentId: division.leagueId,
        name: division.name,
      },
      teamA: {
        registrationId: regA.registrationId,
        teamId: regA.teamId,
        name: regA.teamName,
        logoUrl: sanitizeScoreboardLogoUrl(regA.logoUrl, allowedLogoHosts),
      },
      teamB: {
        registrationId: regB.registrationId,
        teamId: regB.teamId,
        name: regB.teamName,
        logoUrl: sanitizeScoreboardLogoUrl(regB.logoUrl, allowedLogoHosts),
      },
      validatedAt: new Date().toISOString(),
    };

    return jsonResponse(responsePayload, 200);
  } catch {
    return jsonResponse(
      { error: "Matchup validation is temporarily unavailable.", code: "UPSTREAM_ERROR" },
      503
    );
  }
}

/**
 * E. POST /api/integrations/scoreboard/verify-admin
 */
export async function handleVerifyAdminRequest(
  request: Request,
  options: CatalogHandlerOptions
): Promise<Response> {
  if (request.method !== "POST") {
    return methodNotAllowedResponse("POST");
  }

  const authError = authorizeOrRespond(request, options.secret);
  if (authError) return authError;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > 1024) {
    return jsonResponse(
      { error: "Request payload too large.", code: "PAYLOAD_TOO_LARGE" },
      413
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return jsonResponse(
      { error: "Invalid JSON body.", code: "INVALID_REQUEST" },
      400
    );
  }

  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return jsonResponse(
      { error: "Admin verification payload must be a JSON object.", code: "INVALID_REQUEST" },
      400
    );
  }

  const input = rawBody as Record<string, unknown>;
  const { authUserId } = input;
  const keys = Object.keys(input);

  if (keys.length !== 1 || keys[0] !== "authUserId" || !isValidUuid(authUserId)) {
    return jsonResponse(
      { error: "A valid authUserId UUID is required.", code: "INVALID_REQUEST" },
      400
    );
  }

  const normAuthUserId = authUserId.trim().toLowerCase();

  try {
    if (!options.store.findAdminAccessByAuthUserId) {
      return jsonResponse(
        { error: "Admin verification is temporarily unavailable.", code: "UPSTREAM_ERROR" },
        503
      );
    }

    const record = await options.store.findAdminAccessByAuthUserId(normAuthUserId);
    const isActiveAdmin = Boolean(
      record &&
      record.authUserId.toLowerCase() === normAuthUserId &&
      record.isActive === true &&
      record.role === "ADMIN"
    );

    const payload: VerifyAdminStatusResponse = {
      authUserId: record?.authUserId ?? normAuthUserId,
      isActiveAdmin,
      verifiedAt: new Date().toISOString(),
    };

    return jsonResponse(payload, 200);
  } catch {
    return jsonResponse(
      { error: "Admin verification is temporarily unavailable.", code: "UPSTREAM_ERROR" },
      503
    );
  }
}
