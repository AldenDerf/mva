import { prisma } from "@/lib/prisma";
import {
  PaymentCompletionStatus,
  TournamentAccountingSummary,
  calculateRegistrationAccounting,
  getTournamentAccountingSummary,
} from "@/lib/admin/accounting";

export interface DashboardSummaryCounts {
  pendingRegistrations: number;
  verifiedRegistrations: number;
  pendingPayments: number;
  totalRegistrations: number;
}

export interface RecentRegistrationItem {
  id: string;
  registrationCode: string;
  teamName: string;
  categoryName: string;
  leagueName: string;
  registrationStatus: string;
  playerCount: number;

  // Canonical accounting figures
  expectedAmount: number;
  verifiedPaidAmount: number;
  balance: number;
  paidPlayerCount: number;
  unpaidPlayerCount: number;
  paymentComplete: boolean;
  paymentCompletionStatus: PaymentCompletionStatus;
  hasLegacyPayments: boolean;

  // Compatibility fields
  paymentStatus: string;
  paymentAmount: number;
  createdAt: Date;
}

/**
 * Retrieves aggregate summary metrics for the Admin Dashboard.
 * All queries are executed in parallel server-side with database-level count queries.
 */
export async function getDashboardSummaryCounts(): Promise<DashboardSummaryCounts> {
  const [
    pendingRegistrations,
    verifiedRegistrations,
    pendingPayments,
    totalRegistrations,
  ] = await Promise.all([
    prisma.registrations.count({
      where: { status: "PENDING_PAYMENT" },
    }),
    prisma.registrations.count({
      where: { status: "VERIFIED" },
    }),
    prisma.payments.count({
      where: { status: "PENDING" },
    }),
    prisma.registrations.count(),
  ]);

  return {
    pendingRegistrations,
    verifiedRegistrations,
    pendingPayments,
    totalRegistrations,
  };
}

/**
 * Retrieves tournament-level canonical accounting summary metrics.
 * Reuses the single source of truth from lib/admin/accounting.ts.
 */
export async function getDashboardAccountingTotals(
  leagueId?: string
): Promise<TournamentAccountingSummary> {
  return getTournamentAccountingSummary(leagueId);
}

/**
 * Retrieves the latest registrations (default 5) with joined team, category, and canonical accounting.
 * Strictly read-only, selecting only necessary fields in a single query (zero N+1 queries).
 */
export async function getRecentRegistrations(
  limit: number = 5
): Promise<RecentRegistrationItem[]> {
  const records = await prisma.registrations.findMany({
    take: limit,
    orderBy: { created_at: "desc" },
    select: {
      id: true,
      registration_code: true,
      status: true,
      created_at: true,
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
        },
      },
    },
  });

  return records.map((reg) => {
    const acct = calculateRegistrationAccounting(reg);
    const legacyPayment = reg.payments[0];

    return {
      id: reg.id,
      registrationCode: acct.registrationCode,
      teamName: reg.teams.team_name,
      categoryName:
        reg.league_categories_registrations_league_category_idToleague_categories?.name ||
        "Unassigned",
      leagueName: reg.leagues.name,
      registrationStatus: reg.status,
      playerCount: acct.rosterCount,

      // Canonical accounting metrics
      expectedAmount: acct.expectedAmount,
      verifiedPaidAmount: acct.verifiedPaidAmount,
      balance: acct.balance,
      paidPlayerCount: acct.paidPlayerCount,
      unpaidPlayerCount: acct.unpaidPlayerCount,
      paymentComplete: acct.paymentComplete,
      paymentCompletionStatus: acct.paymentCompletionStatus,
      hasLegacyPayments: acct.hasLegacyPayments,

      // Historical compatibility
      paymentStatus:
        acct.paidPlayerCount === acct.rosterCount && acct.rosterCount > 0
          ? "VERIFIED"
          : legacyPayment?.status || (acct.paidPlayerCount > 0 ? "PENDING" : "NO_PAYMENT"),
      paymentAmount:
        acct.verifiedPaidAmount > 0
          ? acct.verifiedPaidAmount
          : legacyPayment
          ? Number(legacyPayment.amount)
          : 0,
      createdAt: reg.created_at,
    };
  });
}
