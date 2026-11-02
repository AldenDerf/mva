import assert from "node:assert/strict";
import test from "node:test";
import {
  handleListDivisionsRequest,
  handleListTeamsRequest,
  handleListTournamentsRequest,
  handleValidateMatchupRequest,
  sanitizeScoreboardLogoUrl,
  type CatalogDivisionRecord,
  type CatalogLeagueRecord,
  type CatalogRegistrationRecord,
  type ScoreboardCatalogStore,
} from "../lib/integrations/scoreboard-catalog.ts";

const VALID_SECRET = "test-mva-scoreboard-machine-secret-2026";
const ALLOWED_HOSTS = new Set(["project-ref.supabase.co", "cdn.mva.example.org"]);

const TOURNAMENT_ONGOING_ID = "11111111-1111-4111-8111-111111111111";
const TOURNAMENT_CLOSED_ID = "22222222-2222-4222-8222-222222222222";
const TOURNAMENT_DRAFT_ID = "33333333-3333-4333-8333-333333333333";
const TOURNAMENT_OPEN_ID = "44444444-4444-4444-8444-444444444444";
const TOURNAMENT_COMPLETED_ID = "55555555-5555-4555-8555-555555555555";

const DIVISION_MEN_ID = "aaaa1111-1111-4111-8111-111111111111";
const DIVISION_WOMEN_ID = "aaaa2222-2222-4222-8222-222222222222";
const DIVISION_OTHER_TOURNAMENT_ID = "bbbb1111-1111-4111-8111-111111111111";

const REG_VERIFIED_A_ID = "cccc1111-1111-4111-8111-111111111111";
const REG_VERIFIED_B_ID = "cccc2222-2222-4222-8222-222222222222";
const REG_PENDING_ID = "cccc3333-3333-4333-8333-333333333333";
const REG_REJECTED_ID = "cccc4444-4444-4444-8444-444444444444";
const REG_CANCELLED_ID = "cccc5555-5555-4555-8555-555555555555";
const REG_WOMEN_VERIFIED_ID = "cccc6666-6666-4666-8666-666666666666";

const TEAM_A_ID = "dddd1111-1111-4111-8111-111111111111";
const TEAM_B_ID = "dddd2222-2222-4222-8222-222222222222";
const TEAM_C_ID = "dddd3333-3333-4333-8333-333333333333";
const TEAM_D_ID = "dddd4444-4444-4444-8444-444444444444";
const TEAM_E_ID = "dddd5555-5555-4555-8555-555555555555";

function createFixtureStore(overrides?: {
  leagues?: CatalogLeagueRecord[];
  divisions?: CatalogDivisionRecord[];
  registrations?: CatalogRegistrationRecord[];
  throwOnQuery?: boolean;
}): ScoreboardCatalogStore {
  const leagues: CatalogLeagueRecord[] = overrides?.leagues ?? [
    {
      id: TOURNAMENT_ONGOING_ID,
      name: "MVA Governors Cup 2026",
      year: 2026,
      status: "ONGOING",
      createdAt: new Date("2026-05-01T00:00:00Z"),
    },
    {
      id: TOURNAMENT_CLOSED_ID,
      name: "MVA Fiesta Invitational 2026",
      year: 2026,
      status: "REGISTRATION_CLOSED",
      createdAt: new Date("2026-04-01T00:00:00Z"),
    },
    {
      id: TOURNAMENT_DRAFT_ID,
      name: "Draft League",
      year: 2026,
      status: "DRAFT",
      createdAt: new Date("2026-03-01T00:00:00Z"),
    },
    {
      id: TOURNAMENT_OPEN_ID,
      name: "Open Registration League",
      year: 2026,
      status: "OPEN_FOR_REGISTRATION",
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
    {
      id: TOURNAMENT_COMPLETED_ID,
      name: "Completed League 2025",
      year: 2025,
      status: "COMPLETED",
      createdAt: new Date("2025-05-01T00:00:00Z"),
    },
  ];

  const divisions: CatalogDivisionRecord[] = overrides?.divisions ?? [
    {
      id: DIVISION_MEN_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      name: "Men's Open",
    },
    {
      id: DIVISION_WOMEN_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      name: "Women's Open",
    },
    {
      id: DIVISION_OTHER_TOURNAMENT_ID,
      leagueId: TOURNAMENT_CLOSED_ID,
      name: "Inter-Barangay",
    },
  ];

  const registrations: CatalogRegistrationRecord[] = overrides?.registrations ?? [
    {
      registrationId: REG_VERIFIED_A_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_A_ID,
      teamName: "Mahatao Waves",
      logoUrl: "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png",
      status: "VERIFIED",
    },
    {
      registrationId: REG_VERIFIED_B_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_B_ID,
      teamName: "San Carlos Spikers",
      logoUrl: "https://untrusted.example.com/evil-logo.png",
      status: "VERIFIED",
    },
    {
      registrationId: REG_PENDING_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_C_ID,
      teamName: "Pending Team",
      logoUrl: null,
      status: "PENDING_PAYMENT",
    },
    {
      registrationId: REG_REJECTED_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_D_ID,
      teamName: "Rejected Team",
      logoUrl: null,
      status: "REJECTED",
    },
    {
      registrationId: REG_CANCELLED_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_E_ID,
      teamName: "Cancelled Team",
      logoUrl: null,
      status: "CANCELLED",
    },
    {
      registrationId: REG_WOMEN_VERIFIED_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_WOMEN_ID,
      teamId: TEAM_C_ID,
      teamName: "Hanib Lady Aces",
      logoUrl: null,
      status: "VERIFIED",
    },
  ];

  const maybeThrow = () => {
    if (overrides?.throwOnQuery) {
      throw new Error("Database connection failure");
    }
  };

  return {
    async listLeaguesByStatuses(statuses) {
      maybeThrow();
      return leagues.filter((l) =>
        (statuses as readonly string[]).includes(l.status)
      );
    },
    async findLeagueById(leagueId) {
      maybeThrow();
      return (
        leagues.find((l) => l.id.toLowerCase() === leagueId.toLowerCase()) ??
        null
      );
    },
    async listDivisionsByLeague(leagueId) {
      maybeThrow();
      return divisions.filter(
        (d) => d.leagueId.toLowerCase() === leagueId.toLowerCase()
      );
    },
    async findDivision(leagueId, divisionId) {
      maybeThrow();
      return (
        divisions.find(
          (d) =>
            d.leagueId.toLowerCase() === leagueId.toLowerCase() &&
            d.id.toLowerCase() === divisionId.toLowerCase()
        ) ?? null
      );
    },
    async listVerifiedRegistrations(leagueId, divisionId) {
      maybeThrow();
      return registrations.filter(
        (r) =>
          r.leagueId.toLowerCase() === leagueId.toLowerCase() &&
          r.divisionId.toLowerCase() === divisionId.toLowerCase() &&
          r.status === "VERIFIED"
      );
    },
    async findRegistrationsByIds(registrationIds) {
      maybeThrow();
      const set = new Set(registrationIds.map((id) => id.toLowerCase()));
      return registrations.filter((r) =>
        set.has(r.registrationId.toLowerCase())
      );
    },
  };
}

function authRequest(url: string, init?: RequestInit, token = VALID_SECRET): Request {
  const headers = new Headers(init?.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return new Request(url, { ...init, headers });
}

test("authentication and machine credential rejection", async () => {
  const store = createFixtureStore();

  // 1. Missing Authorization header -> 401
  const noAuthRes = await handleListTournamentsRequest(
    new Request("https://mva.example.org/api/integrations/scoreboard/tournaments"),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(noAuthRes.status, 401);

  // 2. Wrong machine token -> 401
  const wrongTokenRes = await handleListTournamentsRequest(
    authRequest(
      "https://mva.example.org/api/integrations/scoreboard/tournaments",
      undefined,
      "wrong-machine-secret-value-12345"
    ),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(wrongTokenRes.status, 401);

  // 3. Unconfigured server secret -> 503 fail-closed
  const unconfiguredRes = await handleListTournamentsRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/tournaments"),
    { store, secret: "", allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(unconfiguredRes.status, 503);
});

test("strict HTTP method handling rejects unsupported methods with 405", async () => {
  const store = createFixtureStore();

  const postToGetRes = await handleListTournamentsRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/tournaments", {
      method: "POST",
    }),
    { store, secret: VALID_SECRET }
  );
  assert.equal(postToGetRes.status, 405);
  assert.equal(postToGetRes.headers.get("allow"), "GET");

  const getToPostRes = await handleValidateMatchupRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/validate-matchup", {
      method: "GET",
    }),
    { store, secret: VALID_SECRET }
  );
  assert.equal(getToPostRes.status, 405);
  assert.equal(getToPostRes.headers.get("allow"), "POST");
});

test("list tournaments returns only eligible statuses (ONGOING, REGISTRATION_CLOSED)", async () => {
  const store = createFixtureStore();
  const res = await handleListTournamentsRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/tournaments"),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(res.status, 200);
  const body = (await res.json()) as {
    items: Array<Record<string, unknown>>;
    nextCursor: string | null;
  };
  assert.equal(body.items.length, 2);
  assert.deepEqual(
    body.items.map((t) => t.id),
    [TOURNAMENT_ONGOING_ID, TOURNAMENT_CLOSED_ID]
  );
  for (const item of body.items) {
    assert.deepEqual(Object.keys(item).sort(), ["id", "name", "status", "year"]);
  }
});

test("list divisions validates tournamentId and rejects ineligible tournaments", async () => {
  const store = createFixtureStore();

  // Invalid UUID -> 400
  const invalidUuidRes = await handleListDivisionsRequest(
    authRequest(
      "https://mva.example.org/api/integrations/scoreboard/divisions?tournamentId=not-a-uuid"
    ),
    { store, secret: VALID_SECRET }
  );
  assert.equal(invalidUuidRes.status, 400);

  // Ineligible DRAFT tournament -> 409
  const draftRes = await handleListDivisionsRequest(
    authRequest(
      `https://mva.example.org/api/integrations/scoreboard/divisions?tournamentId=${TOURNAMENT_DRAFT_ID}`
    ),
    { store, secret: VALID_SECRET }
  );
  assert.equal(draftRes.status, 409);

  // Valid eligible tournament -> returns only its divisions
  const validRes = await handleListDivisionsRequest(
    authRequest(
      `https://mva.example.org/api/integrations/scoreboard/divisions?tournamentId=${TOURNAMENT_ONGOING_ID}`
    ),
    { store, secret: VALID_SECRET }
  );
  assert.equal(validRes.status, 200);
  const body = (await validRes.json()) as {
    items: Array<Record<string, unknown>>;
    nextCursor: string | null;
  };
  assert.equal(body.items.length, 2);
  for (const div of body.items) {
    assert.equal(div.tournamentId, TOURNAMENT_ONGOING_ID);
    assert.deepEqual(Object.keys(div).sort(), ["id", "name", "tournamentId"]);
  }
});

test("list eligible teams returns only VERIFIED registrations, strips unapproved logos, and leaks no private fields", async () => {
  const store = createFixtureStore();

  // Cross-tournament division -> 404
  const crossDivRes = await handleListTeamsRequest(
    authRequest(
      `https://mva.example.org/api/integrations/scoreboard/teams?tournamentId=${TOURNAMENT_ONGOING_ID}&divisionId=${DIVISION_OTHER_TOURNAMENT_ID}`
    ),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(crossDivRes.status, 404);

  // Valid tournament + division -> only VERIFIED teams
  const validRes = await handleListTeamsRequest(
    authRequest(
      `https://mva.example.org/api/integrations/scoreboard/teams?tournamentId=${TOURNAMENT_ONGOING_ID}&divisionId=${DIVISION_MEN_ID}`
    ),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(validRes.status, 200);
  const body = (await validRes.json()) as {
    items: Array<{
      registrationId: string;
      teamId: string;
      name: string;
      logoUrl: string | null;
    }>;
  };

  assert.equal(body.items.length, 2);
  assert.equal(body.items[0].registrationId, REG_VERIFIED_A_ID);
  assert.equal(
    body.items[0].logoUrl,
    "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png"
  );
  // Team B had an unapproved logo host -> sanitized to null
  assert.equal(body.items[1].registrationId, REG_VERIFIED_B_ID);
  assert.equal(body.items[1].logoUrl, null);

  for (const item of body.items) {
    assert.deepEqual(
      Object.keys(item).sort(),
      ["logoUrl", "name", "registrationId", "teamId"]
    );
  }
});

test("validate matchup enforces distinct VERIFIED teams in the same eligible tournament and division", async () => {
  const registrations: CatalogRegistrationRecord[] = [
    {
      registrationId: REG_VERIFIED_A_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_A_ID,
      teamName: "Mahatao Waves",
      logoUrl: "https://project-ref.supabase.co/storage/v1/object/public/logos/waves.png",
      status: "VERIFIED",
    },
    {
      registrationId: REG_VERIFIED_B_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_B_ID,
      teamName: "San Carlos Spikers",
      logoUrl: null,
      status: "VERIFIED",
    },
    {
      registrationId: REG_PENDING_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_MEN_ID,
      teamId: TEAM_C_ID,
      teamName: "Pending Team",
      logoUrl: null,
      status: "PENDING_PAYMENT",
    },
    {
      registrationId: REG_WOMEN_VERIFIED_ID,
      leagueId: TOURNAMENT_ONGOING_ID,
      divisionId: DIVISION_WOMEN_ID,
      teamId: TEAM_D_ID,
      teamName: "Hanib Lady Aces",
      logoUrl: null,
      status: "VERIFIED",
    },
  ];
  const store = createFixtureStore({ registrations });

  // 1. Valid matchup -> 200
  const okRes = await handleValidateMatchupRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/validate-matchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ONGOING_ID,
        divisionId: DIVISION_MEN_ID,
        registrationAId: REG_VERIFIED_A_ID,
        registrationBId: REG_VERIFIED_B_ID,
      }),
    }),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(okRes.status, 200);
  const okBody = (await okRes.json()) as {
    tournament: { id: string };
    division: { id: string };
    teamA: { registrationId: string };
    teamB: { registrationId: string };
    validatedAt: string;
  };
  assert.equal(okBody.tournament.id, TOURNAMENT_ONGOING_ID);
  assert.equal(okBody.division.id, DIVISION_MEN_ID);
  assert.equal(okBody.teamA.registrationId, REG_VERIFIED_A_ID);
  assert.equal(okBody.teamB.registrationId, REG_VERIFIED_B_ID);
  assert.ok(!Number.isNaN(Date.parse(okBody.validatedAt)));

  // 2. Identical registration IDs -> 400
  const sameRegRes = await handleValidateMatchupRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/validate-matchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ONGOING_ID,
        divisionId: DIVISION_MEN_ID,
        registrationAId: REG_VERIFIED_A_ID,
        registrationBId: REG_VERIFIED_A_ID,
      }),
    }),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(sameRegRes.status, 400);

  // 3. Unverified registration -> 409
  const pendingRes = await handleValidateMatchupRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/validate-matchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ONGOING_ID,
        divisionId: DIVISION_MEN_ID,
        registrationAId: REG_VERIFIED_A_ID,
        registrationBId: REG_PENDING_ID,
      }),
    }),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(pendingRes.status, 409);

  // 4. Cross-division registration -> 409
  const crossDivRes = await handleValidateMatchupRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/validate-matchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ONGOING_ID,
        divisionId: DIVISION_MEN_ID,
        registrationAId: REG_VERIFIED_A_ID,
        registrationBId: REG_WOMEN_VERIFIED_ID,
      }),
    }),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(crossDivRes.status, 409);

  // 5. Changed registration eligibility after selection -> 409
  registrations[1] = { ...registrations[1], status: "CANCELLED" };
  const changedEligibilityRes = await handleValidateMatchupRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/validate-matchup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tournamentId: TOURNAMENT_ONGOING_ID,
        divisionId: DIVISION_MEN_ID,
        registrationAId: REG_VERIFIED_A_ID,
        registrationBId: REG_VERIFIED_B_ID,
      }),
    }),
    { store, secret: VALID_SECRET, allowedLogoHosts: ALLOWED_HOSTS }
  );
  assert.equal(changedEligibilityRes.status, 409);
});

test("sanitizeScoreboardLogoUrl rejects http, credentials, javascript URLs, and unapproved hosts", () => {
  assert.equal(
    sanitizeScoreboardLogoUrl(
      "https://project-ref.supabase.co/storage/v1/object/public/logos/a.png",
      ALLOWED_HOSTS
    ),
    "https://project-ref.supabase.co/storage/v1/object/public/logos/a.png"
  );
  assert.equal(
    sanitizeScoreboardLogoUrl(
      "http://project-ref.supabase.co/storage/v1/object/public/logos/a.png",
      ALLOWED_HOSTS
    ),
    null
  );
  assert.equal(
    sanitizeScoreboardLogoUrl(
      "https://user:pass@project-ref.supabase.co/logo.png",
      ALLOWED_HOSTS
    ),
    null
  );
  assert.equal(
    sanitizeScoreboardLogoUrl("javascript:alert(1)", ALLOWED_HOSTS),
    null
  );
  assert.equal(
    sanitizeScoreboardLogoUrl("https://evil.example.org/logo.png", ALLOWED_HOSTS),
    null
  );
  assert.equal(sanitizeScoreboardLogoUrl(null, ALLOWED_HOSTS), null);
});

test("database failure returns safe 503 response without leaking internal error details", async () => {
  const failingStore = createFixtureStore({ throwOnQuery: true });
  const res = await handleListTournamentsRequest(
    authRequest("https://mva.example.org/api/integrations/scoreboard/tournaments"),
    { store: failingStore, secret: VALID_SECRET }
  );
  assert.equal(res.status, 503);
  const body = (await res.json()) as { error: string; code: string };
  assert.equal(body.code, "UPSTREAM_ERROR");
  assert.equal(body.error.includes("Database connection failure"), false);
});
