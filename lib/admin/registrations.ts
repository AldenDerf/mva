import { prisma } from "@/lib/prisma";
import {
  registration_status,
  payment_status,
  payment_method,
  Prisma,
} from "@prisma/client";

export interface AdminRegistrationListItem {
  id: string;
  registrationCode: string;
  teamName: string;
  leagueName: string;
  categoryName: string;
  registrantName: string;
  playerCount: number;
  status: registration_status;
  paymentStatus: payment_status | "NO_PAYMENT";
  paymentAmount: number;
  submittedAt: Date;
  createdAt: Date;
}

export interface AdminRegistrationListResult {
  items: AdminRegistrationListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RegistrationListFilterParams {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: registration_status;
  paymentStatus?: payment_status;
  categoryId?: string;
}

export interface FilterCategoryOption {
  id: string;
  name: string;
  leagueName: string;
}

export interface AdminPlayerPaymentInfo {
  id: string;
  amount: number;
  paymentMethod: payment_method;
  referenceNumber: string | null;
  status: payment_status;
  verifiedAt: Date | null;
  verifiedByProfileId: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface AdminRegistrationDetailPlayer {
  id: string;
  playerId: string;
  fullName: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  jerseyNumber: number | null;
  position: string | null;
  isCaptain: boolean;
  payment: AdminPlayerPaymentInfo | null;
}

export interface AdminRegistrationDetailPayment {
  id: string;
  registrationPlayerId: string | null;
  paymentMethod: payment_method;
  amount: number;
  referenceNumber: string | null;
  receiptUrl: string | null;
  status: payment_status;
  verifiedAt: Date | null;
  verifiedByProfileId: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface AdminRegistrationAuditEntry {
  id: string;
  action: string;
  adminName: string;
  adminEmail: string;
  reason: string | null;
  previousStatus: string | null;
  newStatus: string | null;
  createdAt: Date;
}

export interface AdminRegistrationDetail {
  id: string;
  registrationCode: string;
  registrationNumber: string;
  status: registration_status;
  notes: string | null;
  submittedAt: Date;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  league: {
    id: string;
    name: string;
    year: number | null;
    status: string;
  };
  category: {
    id: string;
    name: string;
    registrationFee: number;
    minPlayers: number;
    maxPlayers: number;
  };
  team: {
    id: string;
    name: string;
    slug: string;
    logoUrl: string | null;
  };
  registrant: {
    fullName: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    suffix: string | null;
    contactNumber: string;
    email: string | null;
  };
  roster: AdminRegistrationDetailPlayer[];
  payments: AdminRegistrationDetailPayment[];
  auditHistory: AdminRegistrationAuditEntry[];
  playerCount: number;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatFullName(
  first: string,
  middle: string | null | undefined,
  last: string,
  suffix: string | null | undefined
): string {
  const parts: string[] = [first.trim()];
  if (middle && middle.trim()) {
    parts.push(middle.trim());
  }
  parts.push(last.trim());
  if (suffix && suffix.trim()) {
    parts.push(suffix.trim());
  }
  return parts.join(" ");
}

/**
 * Retrieves dynamic category options for filter dropdowns.
 */
export async function getFilterCategories(): Promise<FilterCategoryOption[]> {
  const categories = await prisma.league_categories.findMany({
    select: {
      id: true,
      name: true,
      leagues: {
        select: {
          name: true,
        },
      },
    },
    orderBy: [{ leagues: { name: "asc" } }, { name: "asc" }],
  });

  return categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
    leagueName: cat.leagues.name,
  }));
}

/**
 * Retrieves paginated, filtered, and searchable registration list.
 * Database-level sorting (created_at DESC), filtering, and pagination.
 */
export async function getAdminRegistrations(
  params: RegistrationListFilterParams = {}
): Promise<AdminRegistrationListResult> {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 20));
  const skip = (page - 1) * pageSize;

  const where: Prisma.registrationsWhereInput = {};

  // Search by registration_code, team_name, or registrant name
  if (params.q && params.q.trim()) {
    const term = params.q.trim();
    where.OR = [
      { registration_code: { contains: term, mode: "insensitive" } },
      { teams: { team_name: { contains: term, mode: "insensitive" } } },
      { registrant_first_name: { contains: term, mode: "insensitive" } },
      { registrant_last_name: { contains: term, mode: "insensitive" } },
    ];
  }

  // Filter: Registration Status
  if (params.status) {
    where.status = params.status;
  }

  // Filter: Category / Division
  if (params.categoryId && UUID_REGEX.test(params.categoryId)) {
    where.league_category_id = params.categoryId;
  }

  // Filter: Payment Status
  if (params.paymentStatus) {
    where.payments = {
      some: {
        status: params.paymentStatus,
      },
    };
  }

  const [totalCount, records] = await Promise.all([
    prisma.registrations.count({ where }),
    prisma.registrations.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { created_at: "desc" },
      select: {
        id: true,
        registration_code: true,
        status: true,
        submitted_at: true,
        created_at: true,
        registrant_first_name: true,
        registrant_middle_name: true,
        registrant_last_name: true,
        registrant_suffix: true,
        teams: {
          select: {
            team_name: true,
          },
        },
        leagues: {
          select: {
            name: true,
          },
        },
        league_categories_registrations_league_category_idToleague_categories: {
          select: {
            name: true,
          },
        },
        payments: {
          take: 1,
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            status: true,
            amount: true,
          },
        },
        _count: {
          select: {
            registration_players: true,
          },
        },
      },
    }),
  ]);

  const items: AdminRegistrationListItem[] = records.map((reg) => {
    const payment = reg.payments[0];
    const registrantName = formatFullName(
      reg.registrant_first_name,
      reg.registrant_middle_name,
      reg.registrant_last_name,
      reg.registrant_suffix
    );

    return {
      id: reg.id,
      registrationCode:
        reg.registration_code || `REG-${reg.id.slice(0, 8).toUpperCase()}`,
      teamName: reg.teams.team_name,
      leagueName: reg.leagues.name,
      categoryName:
        reg.league_categories_registrations_league_category_idToleague_categories
          ?.name || "Unassigned",
      registrantName,
      playerCount: reg._count.registration_players,
      status: reg.status,
      paymentStatus: payment?.status || "NO_PAYMENT",
      paymentAmount: payment ? Number(payment.amount) : 0,
      submittedAt: reg.submitted_at,
      createdAt: reg.created_at,
    };
  });

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return {
    items,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Retrieves a single registration by ID with full operational details.
 * Strictly read-only; returns null if not found or if the ID is invalid.
 */
export async function getAdminRegistrationById(
  id: string
): Promise<AdminRegistrationDetail | null> {
  if (!id || !UUID_REGEX.test(id)) {
    return null;
  }

  const [record, auditLogs] = await Promise.all([
    prisma.registrations.findUnique({
      where: { id },
      select: {
        id: true,
        registration_code: true,
        registration_number: true,
        status: true,
        notes: true,
        submitted_at: true,
        verified_at: true,
        created_at: true,
        updated_at: true,
        registrant_first_name: true,
        registrant_middle_name: true,
        registrant_last_name: true,
        registrant_suffix: true,
        registrant_contact: true,
        registrant_email: true,
        leagues: {
          select: {
            id: true,
            name: true,
            year: true,
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
        teams: {
          select: {
            id: true,
            team_name: true,
            slug: true,
            logo_url: true,
          },
        },
        registration_players: {
          orderBy: [{ is_captain: "desc" }, { created_at: "asc" }],
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
              orderBy: { created_at: "desc" },
              take: 1,
              select: {
                id: true,
                amount: true,
                payment_method: true,
                reference_number: true,
                status: true,
                verified_at: true,
                verified_by_profile_id: true,
                notes: true,
                created_at: true,
              },
            },
          },
        },
        payments: {
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            registration_player_id: true,
            payment_method: true,
            amount: true,
            reference_number: true,
            receipt_url: true,
            status: true,
            verified_at: true,
            verified_by_profile_id: true,
            notes: true,
            created_at: true,
          },
        },
      },
    }),
    prisma.admin_audit_logs.findMany({
      where: {
        OR: [
          { entity_type: "REGISTRATION", entity_id: id },
          { entity_type: "PAYMENT", metadata: { path: ["registration_id"], equals: id } },
        ],
      },
      orderBy: { created_at: "desc" },
      include: {
        profiles: {
          select: {
            display_name: true,
            email: true,
          },
        },
      },
    }),
  ]);

  if (!record) {
    return null;
  }

  const registrantName = formatFullName(
    record.registrant_first_name,
    record.registrant_middle_name,
    record.registrant_last_name,
    record.registrant_suffix
  );

  const roster: AdminRegistrationDetailPlayer[] =
    record.registration_players.map((rp) => {
      const playerPay = rp.payments[0];
      return {
        id: rp.id,
        playerId: rp.players.id,
        fullName: formatFullName(
          rp.players.first_name,
          rp.players.middle_name,
          rp.players.last_name,
          rp.players.suffix
        ),
        firstName: rp.players.first_name,
        middleName: rp.players.middle_name,
        lastName: rp.players.last_name,
        suffix: rp.players.suffix,
        jerseyNumber: rp.jersey_number,
        position: rp.position,
        isCaptain: rp.is_captain,
        payment: playerPay
          ? {
              id: playerPay.id,
              amount: Number(playerPay.amount),
              paymentMethod: playerPay.payment_method,
              referenceNumber: playerPay.reference_number,
              status: playerPay.status,
              verifiedAt: playerPay.verified_at,
              verifiedByProfileId: playerPay.verified_by_profile_id,
              notes: playerPay.notes,
              createdAt: playerPay.created_at,
            }
          : null,
      };
    });

  const payments: AdminRegistrationDetailPayment[] = record.payments.map(
    (p) => ({
      id: p.id,
      registrationPlayerId: p.registration_player_id,
      paymentMethod: p.payment_method,
      amount: Number(p.amount),
      referenceNumber: p.reference_number,
      receiptUrl: p.receipt_url,
      status: p.status,
      verifiedAt: p.verified_at,
      verifiedByProfileId: p.verified_by_profile_id,
      notes: p.notes,
      createdAt: p.created_at,
    })
  );

  const auditHistory: AdminRegistrationAuditEntry[] = auditLogs.map((log) => {
    const meta =
      log.metadata && typeof log.metadata === "object"
        ? (log.metadata as Record<string, unknown>)
        : {};

    return {
      id: log.id,
      action: log.action,
      adminName:
        (meta.actor_name as string) ||
        log.profiles.display_name ||
        log.profiles.email ||
        "Administrator",
      adminEmail: (meta.actor_email as string) || log.profiles.email || "",
      reason: (meta.reason as string) || null,
      previousStatus: (meta.previous_status as string) || null,
      newStatus: (meta.new_status as string) || null,
      createdAt: log.created_at,
    };
  });

  const category =
    record.league_categories_registrations_league_category_idToleague_categories;

  return {
    id: record.id,
    registrationCode:
      record.registration_code || `REG-${record.id.slice(0, 8).toUpperCase()}`,
    registrationNumber: record.registration_number.toString(),
    status: record.status,
    notes: record.notes,
    submittedAt: record.submitted_at,
    verifiedAt: record.verified_at,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    league: {
      id: record.leagues.id,
      name: record.leagues.name,
      year: record.leagues.year,
      status: record.leagues.status,
    },
    category: {
      id: category.id,
      name: category.name,
      registrationFee: Number(category.registration_fee),
      minPlayers: category.min_players,
      maxPlayers: category.max_players,
    },
    team: {
      id: record.teams.id,
      name: record.teams.team_name,
      slug: record.teams.slug,
      logoUrl: record.teams.logo_url,
    },
    registrant: {
      fullName: registrantName,
      firstName: record.registrant_first_name,
      middleName: record.registrant_middle_name,
      lastName: record.registrant_last_name,
      suffix: record.registrant_suffix,
      contactNumber: record.registrant_contact,
      email: record.registrant_email,
    },
    roster,
    payments,
    auditHistory,
    playerCount: roster.length,
  };
}
