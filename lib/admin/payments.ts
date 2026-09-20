import { prisma } from "@/lib/prisma";
import {
  payment_status,
  payment_method,
  registration_status,
  Prisma,
} from "@prisma/client";
import {
  calculateRegistrationAccounting,
  CanonicalRegistrationAccounting,
  PaymentCompletionStatus,
} from "@/lib/admin/accounting";

export interface AdminPaymentListItem {
  id: string;
  amount: number;
  status: payment_status;
  paymentMethod: payment_method;
  referenceNumber: string | null;
  createdAt: Date;
  verifiedAt: Date | null;
  verifierDisplayName: string | null;

  // Registration
  registrationId: string;
  registrationCode: string;
  registrationStatus: registration_status;

  // Team
  teamId: string;
  teamName: string;

  // Division
  categoryId: string;
  categoryName: string;

  // Player
  registrationPlayerId: string | null;
  playerId: string | null;
  fullName: string;
  jerseyNumber: number | null;

  // Legacy
  isLegacyUnallocated: boolean;

  // Accounting Context
  rosterCount: number;
  paidPlayerCount: number;
  expectedAmount: number;
  verifiedPaidAmount: number;
  balance: number;
  paymentCompleteness: PaymentCompletionStatus;
}

export interface AdminPaymentsQueryParams {
  search?: string;
  status?: payment_status;
  paymentMethod?: payment_method;
  categoryId?: string;
  verifiedRegistrationOnly?: boolean;
  completeness?: PaymentCompletionStatus;
  page?: number;
  pageSize?: number;
}

export interface AdminPaymentsResult {
  items: AdminPaymentListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

function formatFullName(
  first: string,
  middle: string | null | undefined,
  last: string,
  suffix: string | null | undefined
): string {
  const parts: string[] = [first.trim()];
  if (middle && middle.trim()) parts.push(middle.trim());
  parts.push(last.trim());
  if (suffix && suffix.trim()) parts.push(suffix.trim());
  return parts.join(" ");
}

/**
 * Batch-loads canonical registration accounting for a set of registration IDs.
 * Executes ONE batched query and evaluates calculations in memory.
 * Eliminates N+1 accounting queries.
 */
export async function getBatchRegistrationAccounting(
  registrationIds: string[]
): Promise<Map<string, CanonicalRegistrationAccounting>> {
  const resultMap = new Map<string, CanonicalRegistrationAccounting>();
  if (registrationIds.length === 0) return resultMap;

  const rawRegistrations = await prisma.registrations.findMany({
    where: {
      id: { in: registrationIds },
    },
    select: {
      id: true,
      registration_code: true,
      status: true,
      teams: {
        select: {
          id: true,
          team_name: true,
          slug: true,
        },
      },
      leagues: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      league_categories_registrations_league_category_idToleague_categories: {
        select: {
          id: true,
          name: true,
          registration_fee: true,
          min_players: true,
          max_players: true,
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
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              payment_method: true,
              reference_number: true,
              verified_at: true,
              created_at: true,
            },
          },
        },
      },
      payments: {
        where: {
          registration_player_id: null,
        },
        select: {
          id: true,
          registration_player_id: true,
          amount: true,
          status: true,
          payment_method: true,
          reference_number: true,
          verified_at: true,
          created_at: true,
          notes: true,
        },
      },
    },
  });

  for (const raw of rawRegistrations) {
    const acct = calculateRegistrationAccounting(raw);
    resultMap.set(raw.id, acct);
  }

  return resultMap;
}

/**
 * Resolves qualifying registration IDs based on canonical team payment completeness.
 * Strictly satisfies Section E: evaluates completeness BEFORE payment count and pagination.
 */
async function getQualifyingRegistrationIdsForCompleteness(
  completeness: PaymentCompletionStatus,
  baseFilter: {
    categoryId?: string;
    verifiedRegistrationOnly?: boolean;
  }
): Promise<string[]> {
  const regWhere: Prisma.registrationsWhereInput = {};

  if (baseFilter.categoryId) {
    regWhere.league_category_id = baseFilter.categoryId;
  }

  if (baseFilter.verifiedRegistrationOnly) {
    regWhere.status = "VERIFIED";
  }

  const candidateRegistrations = await prisma.registrations.findMany({
    where: regWhere,
    select: {
      id: true,
      registration_code: true,
      status: true,
      teams: {
        select: {
          id: true,
          team_name: true,
          slug: true,
        },
      },
      leagues: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      league_categories_registrations_league_category_idToleague_categories: {
        select: {
          id: true,
          name: true,
          registration_fee: true,
          min_players: true,
          max_players: true,
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
            },
          },
          payments: {
            select: {
              id: true,
              amount: true,
              status: true,
              payment_method: true,
              reference_number: true,
              verified_at: true,
              created_at: true,
            },
          },
        },
      },
      payments: {
        where: {
          registration_player_id: null,
        },
        select: {
          id: true,
          registration_player_id: true,
          amount: true,
          status: true,
          payment_method: true,
          reference_number: true,
          verified_at: true,
          created_at: true,
          notes: true,
        },
      },
    },
  });

  const matchingIds: string[] = [];

  for (const reg of candidateRegistrations) {
    const acct = calculateRegistrationAccounting(reg);
    if (completeness === "COMPLETE" && acct.paymentComplete) {
      matchingIds.push(reg.id);
    } else if (completeness === "INCOMPLETE" && !acct.paymentComplete) {
      matchingIds.push(reg.id);
    }
  }

  return matchingIds;
}

/**
 * Builds the Prisma where clause for payments query based on all active search and filter params.
 */
export async function buildPaymentsWhereClause(
  params: AdminPaymentsQueryParams
): Promise<Prisma.paymentsWhereInput> {
  const andConditions: Prisma.paymentsWhereInput[] = [];

  // 1. Payment Status Filter
  if (params.status) {
    andConditions.push({ status: params.status });
  }

  // 2. Payment Method Filter
  if (params.paymentMethod) {
    andConditions.push({ payment_method: params.paymentMethod });
  }

  // 3. Category / Division Filter
  if (params.categoryId) {
    andConditions.push({
      registrations: {
        league_category_id: params.categoryId,
      },
    });
  }

  // 4. Verified Registration Only Filter
  if (params.verifiedRegistrationOnly) {
    andConditions.push({
      registrations: {
        status: "VERIFIED",
      },
    });
  }

  // 5. Team Payment Completeness Filter (Section E)
  if (params.completeness) {
    const qualifyingRegistrationIds =
      await getQualifyingRegistrationIdsForCompleteness(params.completeness, {
        categoryId: params.categoryId,
        verifiedRegistrationOnly: params.verifiedRegistrationOnly,
      });

    if (qualifyingRegistrationIds.length === 0) {
      // Nil-UUID ensure 0 records match
      andConditions.push({
        registration_id: { in: ["00000000-0000-0000-0000-000000000000"] },
      });
    } else {
      andConditions.push({
        registration_id: { in: qualifyingRegistrationIds },
      });
    }
  }

  // 6. Search Query (Section C)
  // Supports: Registration code, Payment reference, Team name, and Tokenized player full-name
  const trimmedSearch = params.search?.trim();
  if (trimmedSearch) {
    const tokens = trimmedSearch.split(/\s+/).filter(Boolean);

    const searchOrConditions: Prisma.paymentsWhereInput[] = [
      // 1. Payment reference number
      {
        reference_number: {
          contains: trimmedSearch,
          mode: "insensitive",
        },
      },
      // 2. Registration code
      {
        registrations: {
          registration_code: {
            contains: trimmedSearch,
            mode: "insensitive",
          },
        },
      },
      // 3. Team name
      {
        registrations: {
          teams: {
            team_name: {
              contains: trimmedSearch,
              mode: "insensitive",
            },
          },
        },
      },
      // 4. Tokenized player full-name search
      // Every token must match one of first_name, middle_name, last_name, or suffix
      {
        registration_players: {
          players: {
            AND: tokens.map((token) => ({
              OR: [
                { first_name: { contains: token, mode: "insensitive" as const } },
                { middle_name: { contains: token, mode: "insensitive" as const } },
                { last_name: { contains: token, mode: "insensitive" as const } },
                { suffix: { contains: token, mode: "insensitive" as const } },
              ],
            })),
          },
        },
      },
    ];

    andConditions.push({ OR: searchOrConditions });
  }

  return andConditions.length > 0 ? { AND: andConditions } : {};
}

/**
 * Main query function for /admin/payments.
 *
 * Implements:
 * - Server-side search & filters
 * - Completeness before pagination
 * - Paginated payment retrieval
 * - Single-pass batched accounting lookup (No N+1)
 * - Legacy payment demarcation
 */
export async function getAdminPaymentsList(
  params: AdminPaymentsQueryParams
): Promise<AdminPaymentsResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  const where = await buildPaymentsWhereClause(params);

  // Execute count and paginated query
  const [totalCount, rawPayments] = await Promise.all([
    prisma.payments.count({ where }),
    prisma.payments.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: [
        { created_at: "desc" },
        { id: "desc" },
      ],
      select: {
        id: true,
        amount: true,
        status: true,
        payment_method: true,
        reference_number: true,
        created_at: true,
        verified_at: true,
        registration_id: true,
        registration_player_id: true,
        verified_by_profile: {
          select: {
            id: true,
            display_name: true,
            email: true,
          },
        },
        registrations: {
          select: {
            id: true,
            registration_code: true,
            status: true,
            teams: {
              select: {
                id: true,
                team_name: true,
              },
            },
            league_categories_registrations_league_category_idToleague_categories: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        registration_players: {
          select: {
            id: true,
            jersey_number: true,
            players: {
              select: {
                id: true,
                first_name: true,
                middle_name: true,
                last_name: true,
                suffix: true,
              },
            },
          },
        },
      },
    }),
  ]);

  // Collect UNIQUE registration IDs for canonical accounting
  const uniqueRegIds = Array.from(
    new Set(rawPayments.map((p) => p.registration_id))
  );

  // Batch-load canonical accounting ONCE per registration (Section F)
  const accountingMap = await getBatchRegistrationAccounting(uniqueRegIds);

  const items: AdminPaymentListItem[] = rawPayments.map((p) => {
    const isLegacy = p.registration_player_id === null;
    const reg = p.registrations;
    const category =
      reg.league_categories_registrations_league_category_idToleague_categories;
    const accounting = accountingMap.get(p.registration_id);

    let fullName = "Legacy / Unallocated Payment";
    let playerId: string | null = null;
    let registrationPlayerId: string | null = null;
    let jerseyNumber: number | null = null;

    if (!isLegacy && p.registration_players?.players) {
      const pl = p.registration_players.players;
      playerId = pl.id;
      registrationPlayerId = p.registration_players.id;
      jerseyNumber = p.registration_players.jersey_number ?? null;
      fullName = formatFullName(
        pl.first_name,
        pl.middle_name,
        pl.last_name,
        pl.suffix
      );
    }

    const verifierName =
      p.verified_by_profile?.display_name ||
      p.verified_by_profile?.email ||
      null;

    return {
      id: p.id,
      amount: Number(p.amount),
      status: p.status,
      paymentMethod: p.payment_method,
      referenceNumber: p.reference_number,
      createdAt: p.created_at,
      verifiedAt: p.verified_at,
      verifierDisplayName: verifierName,

      registrationId: p.registration_id,
      registrationCode: reg.registration_code || `REG-${p.registration_id.slice(0, 8).toUpperCase()}`,
      registrationStatus: reg.status,

      teamId: reg.teams.id,
      teamName: reg.teams.team_name,

      categoryId: category ? category.id : "",
      categoryName: category ? category.name : "Unassigned",

      registrationPlayerId,
      playerId,
      fullName,
      jerseyNumber,

      isLegacyUnallocated: isLegacy,

      rosterCount: accounting?.rosterCount ?? 0,
      paidPlayerCount: accounting?.paidPlayerCount ?? 0,
      expectedAmount: accounting?.expectedAmount ?? 0,
      verifiedPaidAmount: accounting?.verifiedPaidAmount ?? 0,
      balance: accounting?.balance ?? 0,
      paymentCompleteness: accounting?.paymentCompletionStatus ?? "INCOMPLETE",
    };
  });

  const totalPages = Math.ceil(totalCount / pageSize);

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
    hasPreviousPage: page > 1,
    hasNextPage: page < totalPages,
  };
}

/**
 * Fetches all active league categories for filter dropdown options.
 */
export async function getAdminPaymentFilterCategories(): Promise<
  Array<{ id: string; name: string; leagueName: string }>
> {
  const categories = await prisma.league_categories.findMany({
    orderBy: [
      { leagues: { name: "asc" } },
      { name: "asc" },
    ],
    select: {
      id: true,
      name: true,
      leagues: {
        select: {
          name: true,
        },
      },
    },
  });

  return categories.map((c) => ({
    id: c.id,
    name: c.name,
    leagueName: c.leagues.name,
  }));
}
