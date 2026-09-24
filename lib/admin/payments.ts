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
  paymentStatus?: payment_status;
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
          status: true,
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
          payment_allocations: {
            select: {
              id: true,
              registration_player_id: true,
              amount: true,
              reversed_at: true,
            },
          },
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
 * Builds the base Prisma where clause for payments query from search, status,
 * method, division/category, and verified-registration-only filters (excluding completeness).
 */
export function buildBasePaymentsWhereClause(
  params: AdminPaymentsQueryParams
): Prisma.paymentsWhereInput {
  const andConditions: Prisma.paymentsWhereInput[] = [];

  // 1. Payment Status Filter
  const statusFilter = params.paymentStatus ?? params.status;
  if (statusFilter) {
    andConditions.push({ status: statusFilter });
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

  // 5. Search Query (Section C)
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
 * Builds the complete Prisma where clause for payments query based on all active search,
 * filters, and completeness candidates.
 */
export async function buildPaymentsWhereClause(
  params: AdminPaymentsQueryParams
): Promise<Prisma.paymentsWhereInput> {
  const baseWhere = buildBasePaymentsWhereClause(params);

  if (!params.completeness) {
    return baseWhere;
  }

  // Narrow candidates to only registrations that contain payments matching the base filters
  const candidateRows = await prisma.payments.findMany({
    where: baseWhere,
    select: { registration_id: true },
    distinct: ["registration_id"],
  });

  const candidateRegistrationIds = candidateRows.map((r) => r.registration_id);

  if (candidateRegistrationIds.length === 0) {
    // Return impossible condition if candidate set is empty
    return {
      AND: [
        baseWhere,
        { registration_id: { in: [] } },
      ],
    };
  }

  // Batch-load canonical accounting ONLY for candidate registrations
  const candidateAccountingMap = await getBatchRegistrationAccounting(
    candidateRegistrationIds
  );

  const qualifyingRegistrationIds: string[] = [];
  for (const [regId, acct] of candidateAccountingMap.entries()) {
    if (params.completeness === "COMPLETE" && acct.paymentComplete) {
      qualifyingRegistrationIds.push(regId);
    } else if (params.completeness === "INCOMPLETE" && !acct.paymentComplete) {
      qualifyingRegistrationIds.push(regId);
    }
  }

  return {
    AND: [
      baseWhere,
      { registration_id: { in: qualifyingRegistrationIds } },
    ],
  };
}

/**
 * Main query function for /admin/payments.
 *
 * Implements:
 * - Base filters & tokenized full-name search
 * - Completeness before pagination with narrowed candidate set
 * - Paginated payment retrieval
 * - Single-pass batched accounting lookup (No N+1)
 * - Clean early return on empty candidate or qualifying sets
 * - Legacy payment demarcation
 */
export async function getAdminPaymentsList(
  params: AdminPaymentsQueryParams
): Promise<AdminPaymentsResult> {
  const page = Math.max(1, params.page || 1);
  const pageSize = Math.max(1, Math.min(100, params.pageSize || 20));
  const skip = (page - 1) * pageSize;

  // 1. Build normal/base payment WHERE conditions first
  const baseWhere = buildBasePaymentsWhereClause(params);

  let finalWhere = baseWhere;
  let preloadedAccountingMap: Map<string, CanonicalRegistrationAccounting> | null = null;

  // 2. If completeness IS requested:
  if (params.completeness) {
    // Step A: Use base payment filters to obtain DISTINCT registration IDs represented by matching payments
    const candidateRows = await prisma.payments.findMany({
      where: baseWhere,
      select: { registration_id: true },
      distinct: ["registration_id"],
    });

    const candidateRegistrationIds = candidateRows.map((r) => r.registration_id);

    // Step B: Clean early return if zero candidate registration IDs
    if (candidateRegistrationIds.length === 0) {
      return {
        items: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      };
    }

    // Step C & D: Batch-load canonical accounting inputs ONLY for those candidate registration IDs (ONE batched query)
    preloadedAccountingMap = await getBatchRegistrationAccounting(
      candidateRegistrationIds
    );

    // Step E & F: Evaluate COMPLETE / INCOMPLETE for each candidate registration
    const qualifyingRegistrationIds: string[] = [];
    for (const [regId, acct] of preloadedAccountingMap.entries()) {
      if (params.completeness === "COMPLETE" && acct.paymentComplete) {
        qualifyingRegistrationIds.push(regId);
      } else if (params.completeness === "INCOMPLETE" && !acct.paymentComplete) {
        qualifyingRegistrationIds.push(regId);
      }
    }

    // Clean early return if zero qualifying registration IDs
    if (qualifyingRegistrationIds.length === 0) {
      return {
        items: [],
        totalCount: 0,
        page,
        pageSize,
        totalPages: 0,
        hasPreviousPage: false,
        hasNextPage: false,
      };
    }

    // Step G: Add qualifying registration IDs to FINAL payment WHERE condition
    finalWhere = {
      AND: [
        baseWhere,
        { registration_id: { in: qualifyingRegistrationIds } },
      ],
    };
  }

  // Execute count and paginated query
  const [totalCount, rawPayments] = await Promise.all([
    prisma.payments.count({ where: finalWhere }),
    prisma.payments.findMany({
      where: finalWhere,
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

  // Reuse preloaded accounting from candidate step or batch-load canonical accounting ONCE
  const accountingMap =
    preloadedAccountingMap ?? (await getBatchRegistrationAccounting(uniqueRegIds));

  const items: AdminPaymentListItem[] = rawPayments.map((p) => {
    const isLegacy = p.registration_player_id === null;
    const reg = p.registrations;
    const category =
      reg.league_categories_registrations_league_category_idToleague_categories;
    const accounting = accountingMap.get(p.registration_id);

    let fullName =
      p.status === "VERIFIED"
        ? "Legacy Unallocated Payment"
        : p.status === "PENDING"
        ? "Unassigned Pending Payment"
        : p.status === "REJECTED"
        ? "Unassigned Rejected Payment"
        : "Unassigned Payment";
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

      isLegacyUnallocated: isLegacy && p.status === "VERIFIED",

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
