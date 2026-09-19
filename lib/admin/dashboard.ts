import { prisma } from "@/lib/prisma";

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
  registrationStatus: string;
  paymentStatus: string;
  paymentAmount: number;
  playerCount: number;
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
 * Retrieves the latest registrations (default 5) with joined team, category, and payment relations.
 * Strictly read-only, selecting only necessary fields.
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
          team_name: true,
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
          payment_method: true,
        },
      },
      _count: {
        select: {
          registration_players: true,
        },
      },
    },
  });

  return records.map((reg) => {
    const payment = reg.payments[0];
    return {
      id: reg.id,
      registrationCode: reg.registration_code || `REG-${reg.id.slice(0, 8).toUpperCase()}`,
      teamName: reg.teams.team_name,
      categoryName:
        reg.league_categories_registrations_league_category_idToleague_categories?.name ||
        "Unassigned",
      registrationStatus: reg.status,
      paymentStatus: payment?.status || "NO_PAYMENT",
      paymentAmount: payment ? Number(payment.amount) : 0,
      playerCount: reg._count.registration_players,
      createdAt: reg.created_at,
    };
  });
}
