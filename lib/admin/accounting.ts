import { prisma } from "@/lib/prisma";
import {
  registration_status,
  payment_status,
  payment_method,
  league_status,
  roster_status,
} from "@prisma/client";
import { getActivePublicLeague } from "@/lib/public/teams";

/**
 * PHASE 05.7A: CANONICAL SERVER-SIDE ADMIN ACCOUNTING MODEL
 *
 * Single source of truth for:
 * - Expected registration fees (based on ACTUAL official roster count, NO 12-player cap)
 * - Per-player payment reconciliation (qualifying active VERIFIED per-player payments)
 * - Separation of registration status (VERIFIED/PENDING/etc) vs payment completeness (COMPLETE/INCOMPLETE)
 * - Safe handling of legacy unallocated payments (registration_player_id = null)
 * - Financial anomaly detection (overpayments, unallocated funds)
 * - Tournament and league-level accounting aggregate totals
 */

export const DEFAULT_PLAYER_REGISTRATION_FEE = 300.0;
export const PLAYER_REGISTRATION_FEE = DEFAULT_PLAYER_REGISTRATION_FEE;

export type PaymentCompletionStatus = "COMPLETE" | "INCOMPLETE";

export interface ActivePlayerPaymentDetail {
  id: string;
  amount: number;
  status: payment_status;
  paymentMethod: payment_method;
  referenceNumber: string | null;
  verifiedAt: Date | null;
}

export interface RegistrationPlayerPaymentSummary {
  registrationPlayerId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  position: string | null;
  isCaptain: boolean;
  isPaid: boolean;
  activePayment: ActivePlayerPaymentDetail | null;
}

export interface LegacyUnallocatedPaymentSummary {
  id: string;
  amount: number;
  status: payment_status;
  paymentMethod: payment_method;
  referenceNumber: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
  notes: string | null;
}

export interface CanonicalRegistrationAccounting {
  registrationId: string;
  registrationCode: string;
  teamId: string;
  teamName: string;
  teamSlug?: string;
  leagueId: string;
  leagueName: string;
  leagueStatus?: league_status;
  categoryId: string;
  categoryName: string;
  feePerPlayer: number;
  registrationStatus: registration_status;

  // Roster & Core Calculations
  rosterCount: number;
  expectedAmount: number;
  verifiedPaidAmount: number;
  balance: number;
  paidPlayerCount: number;
  unpaidPlayerCount: number;

  // Payment Completeness
  paymentComplete: boolean;
  paymentCompletionStatus: PaymentCompletionStatus;

  // Player Breakdowns
  rosterPayments: RegistrationPlayerPaymentSummary[];

  // Historical / Removed Roster Accounting
  historicalRemovedVerifiedAmount: number;
  removedRosterCount: number;

  // Legacy / Unallocated Payments (registration_player_id = null)
  unallocatedVerifiedAmount: number;
  unallocatedPendingAmount: number;
  legacyPayments: LegacyUnallocatedPaymentSummary[];
  hasLegacyPayments: boolean;

  // Total Verified Cash Collected across all records (active per-player + removed per-player + legacy)
  totalVerifiedCollected: number;

  // Financial Anomaly Guard
  hasFinancialAnomaly: boolean;
  anomalyNotes: string[];
}

export interface TournamentAccountingSummary {
  leagueId: string | null;
  leagueName: string | null;
  totalRegistrations: number;
  verifiedTeams: number;
  pendingTeams: number;
  cancelledOrRejectedTeams: number;

  // Financial Totals
  totalExpectedAmount: number;
  totalVerifiedPaidAmount: number;
  totalOutstandingBalance: number;

  // Player Totals
  totalRosterPlayers: number;
  totalPaidPlayers: number;
  totalUnpaidPlayers: number;

  // Verified Teams Breakdown
  verifiedPaymentCompleteTeams: number;
  verifiedPaymentIncompleteTeams: number;

  // Unallocated / Legacy / Historical
  totalUnallocatedVerifiedAmount: number;
  totalHistoricalRemovedVerifiedAmount: number;
  totalCombinedVerifiedAmount: number;
}

export interface RawRegistrationAccountingInput {
  id: string;
  registration_code: string | null;
  status: registration_status;
  teams: {
    id: string;
    team_name: string;
    slug?: string;
  };
  leagues: {
    id: string;
    name: string;
    status?: league_status;
  };
  league_categories_registrations_league_category_idToleague_categories?: {
    id: string;
    name: string;
    registration_fee: unknown; // Prisma Decimal or number
    min_players?: number;
    max_players?: number;
  } | null;
  registration_players: Array<{
    id: string;
    jersey_number?: number | null;
    position?: string | null;
    is_captain?: boolean;
    status?: roster_status;
    players?: {
      id: string;
      first_name: string;
      middle_name?: string | null;
      last_name: string;
      suffix?: string | null;
    };
    payments: Array<{
      id: string;
      amount: unknown;
      status: payment_status;
      payment_method: payment_method;
      reference_number?: string | null;
      verified_at?: Date | null;
      created_at?: Date;
    }>;
  }>;
  payments?: Array<{
    id: string;
    registration_player_id: string | null;
    amount: unknown;
    status: payment_status;
    payment_method: payment_method;
    reference_number?: string | null;
    verified_at?: Date | null;
    created_at?: Date;
    notes?: string | null;
  }>;
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
 * Pure calculation engine converting raw registration and payment data into
 * the canonical server-side accounting model.
 *
 * Invariants:
 * 1. expectedAmount = rosterCount * feePerPlayer (based on actual roster; NO 12-player cap).
 * 2. Paid Player: member has a per-player payment with status = "VERIFIED".
 * 3. PENDING, REJECTED, REFUNDED do not satisfy a player payment.
 * 4. registration_player_id = null payments are treated as legacy/unallocated;
 *    they do NOT make individual players paid or mark the team complete.
 * 5. paymentComplete is true iff rosterCount > 0 and paidPlayerCount === rosterCount.
 * 6. balance = expectedAmount - verifiedPaidAmount.
 * 7. Abnormalities (overpayment, unallocated payments) trigger anomaly flags without data clamping.
 */
export function calculateRegistrationAccounting(
  input: RawRegistrationAccountingInput
): CanonicalRegistrationAccounting {
  const regId = input.id;
  const regCode = input.registration_code || `REG-${regId.slice(0, 8).toUpperCase()}`;

  const category = input.league_categories_registrations_league_category_idToleague_categories;
  const rawFee = category ? Number(category.registration_fee) : 0;
  const feePerPlayer = rawFee > 0 ? rawFee : DEFAULT_PLAYER_REGISTRATION_FEE;

  // Separate ACTIVE roster members from REMOVED historical members
  // Backward compatibility: if status is omitted/undefined, treat as ACTIVE
  const activeRosterPlayers = input.registration_players.filter(
    (rp) => rp.status === undefined || rp.status === "ACTIVE"
  );
  const removedRosterPlayers = input.registration_players.filter(
    (rp) => rp.status === "REMOVED"
  );

  const rosterCount = activeRosterPlayers.length;
  const removedRosterCount = removedRosterPlayers.length;
  const expectedAmount = rosterCount * feePerPlayer;

  let verifiedPaidAmount = 0;
  let paidPlayerCount = 0;

  const rosterPayments: RegistrationPlayerPaymentSummary[] = [];

  for (const rp of activeRosterPlayers) {
    const playerName = rp.players
      ? formatFullName(
          rp.players.first_name,
          rp.players.middle_name,
          rp.players.last_name,
          rp.players.suffix
        )
      : "Roster Player";

    // Active VERIFIED payment for this player
    // Database unique index uq_payments_active_verified_player guarantees at most 1 active VERIFIED per player
    const verifiedPayment = rp.payments.find((p) => p.status === "VERIFIED");

    let isPaid = false;
    let activePayment: ActivePlayerPaymentDetail | null = null;

    if (verifiedPayment) {
      isPaid = true;
      paidPlayerCount += 1;
      const payAmt = Number(verifiedPayment.amount);
      verifiedPaidAmount += payAmt;

      activePayment = {
        id: verifiedPayment.id,
        amount: payAmt,
        status: verifiedPayment.status,
        paymentMethod: verifiedPayment.payment_method,
        referenceNumber: verifiedPayment.reference_number || null,
        verifiedAt: verifiedPayment.verified_at || null,
      };
    } else {
      // Find latest non-verified payment if present for detail display
      const latestPay = rp.payments[0];
      if (latestPay) {
        activePayment = {
          id: latestPay.id,
          amount: Number(latestPay.amount),
          status: latestPay.status,
          paymentMethod: latestPay.payment_method,
          referenceNumber: latestPay.reference_number || null,
          verifiedAt: latestPay.verified_at || null,
        };
      }
    }

    rosterPayments.push({
      registrationPlayerId: rp.id,
      playerId: rp.players ? rp.players.id : rp.id,
      playerName,
      jerseyNumber: rp.jersey_number ?? null,
      position: rp.position ?? null,
      isCaptain: Boolean(rp.is_captain),
      isPaid,
      activePayment,
    });
  }

  // Calculate historical VERIFIED payments attached to REMOVED roster members
  let historicalRemovedVerifiedAmount = 0;
  for (const rp of removedRosterPlayers) {
    for (const p of rp.payments) {
      if (p.status === "VERIFIED") {
        historicalRemovedVerifiedAmount += Number(p.amount);
      }
    }
  }

  const unpaidPlayerCount = Math.max(0, rosterCount - paidPlayerCount);
  const balance = expectedAmount - verifiedPaidAmount;

  // Payment is complete if and only if there is at least 1 roster player and all players are verified paid
  const paymentComplete = rosterCount > 0 && paidPlayerCount === rosterCount;
  const paymentCompletionStatus: PaymentCompletionStatus = paymentComplete
    ? "COMPLETE"
    : "INCOMPLETE";

  // Reconcile legacy / unallocated payments (registration_player_id = null)
  let unallocatedVerifiedAmount = 0;
  let unallocatedPendingAmount = 0;
  const legacyPayments: LegacyUnallocatedPaymentSummary[] = [];

  if (input.payments && input.payments.length > 0) {
    for (const p of input.payments) {
      if (p.registration_player_id === null) {
        const amt = Number(p.amount);
        if (p.status === "VERIFIED") {
          unallocatedVerifiedAmount += amt;
        } else if (p.status === "PENDING") {
          unallocatedPendingAmount += amt;
        }

        legacyPayments.push({
          id: p.id,
          amount: amt,
          status: p.status,
          paymentMethod: p.payment_method,
          referenceNumber: p.reference_number || null,
          verifiedAt: p.verified_at || null,
          createdAt: p.created_at || new Date(),
          notes: p.notes || null,
        });
      }
    }
  }

  const hasLegacyPayments = legacyPayments.length > 0;
  const totalVerifiedCollected =
    verifiedPaidAmount + historicalRemovedVerifiedAmount + unallocatedVerifiedAmount;

  // Financial Anomaly Detection
  const anomalyNotes: string[] = [];
  let hasFinancialAnomaly = false;

  if (verifiedPaidAmount > expectedAmount) {
    hasFinancialAnomaly = true;
    anomalyNotes.push(
      `Verified active per-player payments (₱${verifiedPaidAmount.toFixed(
        2
      )}) exceed expected fees (₱${expectedAmount.toFixed(2)}) by ₱${(
        verifiedPaidAmount - expectedAmount
      ).toFixed(2)}.`
    );
  }

  if (unallocatedVerifiedAmount > 0) {
    hasFinancialAnomaly = true;
    anomalyNotes.push(
      `Contains ₱${unallocatedVerifiedAmount.toFixed(
        2
      )} in legacy/unallocated verified payments requiring administrative reconciliation.`
    );
  }

  if (historicalRemovedVerifiedAmount > 0) {
    hasFinancialAnomaly = true;
    anomalyNotes.push(
      `Contains ₱${historicalRemovedVerifiedAmount.toFixed(
        2
      )} in verified payment(s) associated with removed roster members requiring administrative review.`
    );
  }

  return {
    registrationId: regId,
    registrationCode: regCode,
    teamId: input.teams.id,
    teamName: input.teams.team_name,
    teamSlug: input.teams.slug,
    leagueId: input.leagues.id,
    leagueName: input.leagues.name,
    leagueStatus: input.leagues.status,
    categoryId: category ? category.id : "",
    categoryName: category ? category.name : "Unassigned",
    feePerPlayer,
    registrationStatus: input.status,

    rosterCount,
    expectedAmount,
    verifiedPaidAmount,
    balance,
    paidPlayerCount,
    unpaidPlayerCount,

    paymentComplete,
    paymentCompletionStatus,

    rosterPayments,

    historicalRemovedVerifiedAmount,
    removedRosterCount,

    unallocatedVerifiedAmount,
    unallocatedPendingAmount,
    legacyPayments,
    hasLegacyPayments,

    totalVerifiedCollected,

    hasFinancialAnomaly,
    anomalyNotes,
  };
}

/**
 * Retrieves aggregate tournament accounting metrics scoped by league context.
 *
 * Scope Resolution:
 * 1. If explicit leagueId is provided, aggregates for that league.
 * 2. If leagueId is omitted, resolves active tournament context via getActivePublicLeague().
 * 3. If no active tournament exists, falls back to all registrations across the platform.
 *
 * Performance:
 * Single batched Prisma query with targeted relation selects. Eliminates N+1 queries.
 */
export async function getTournamentAccountingSummary(
  targetLeagueId?: string
): Promise<TournamentAccountingSummary> {
  let effectiveLeagueId = targetLeagueId;
  let leagueName: string | null = null;

  if (!effectiveLeagueId) {
    const activeLeague = await getActivePublicLeague();
    if (activeLeague) {
      effectiveLeagueId = activeLeague.id;
      leagueName = activeLeague.name;
    }
  }

  const whereClause = effectiveLeagueId ? { league_id: effectiveLeagueId } : {};

  const registrations = await prisma.registrations.findMany({
    where: whereClause,
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
        },
      },
    },
  });

  if (registrations.length > 0 && !leagueName && effectiveLeagueId) {
    leagueName = registrations[0].leagues.name;
  }

  let totalExpectedAmount = 0;
  let totalVerifiedPaidAmount = 0;
  let totalOutstandingBalance = 0;

  let totalRosterPlayers = 0;
  let totalPaidPlayers = 0;
  let totalUnpaidPlayers = 0;

  let verifiedTeams = 0;
  let pendingTeams = 0;
  let cancelledOrRejectedTeams = 0;

  let verifiedPaymentCompleteTeams = 0;
  let verifiedPaymentIncompleteTeams = 0;

  let totalUnallocatedVerifiedAmount = 0;
  let totalHistoricalRemovedVerifiedAmount = 0;

  for (const reg of registrations) {
    const acct = calculateRegistrationAccounting(reg);

    totalExpectedAmount += acct.expectedAmount;
    totalVerifiedPaidAmount += acct.verifiedPaidAmount;
    totalOutstandingBalance += acct.balance;

    totalRosterPlayers += acct.rosterCount;
    totalPaidPlayers += acct.paidPlayerCount;
    totalUnpaidPlayers += acct.unpaidPlayerCount;

    totalUnallocatedVerifiedAmount += acct.unallocatedVerifiedAmount;
    totalHistoricalRemovedVerifiedAmount += acct.historicalRemovedVerifiedAmount;

    if (acct.registrationStatus === "VERIFIED") {
      verifiedTeams += 1;
      if (acct.paymentComplete) {
        verifiedPaymentCompleteTeams += 1;
      } else {
        verifiedPaymentIncompleteTeams += 1;
      }
    } else if (acct.registrationStatus === "PENDING_PAYMENT") {
      pendingTeams += 1;
    } else {
      cancelledOrRejectedTeams += 1;
    }
  }

  return {
    leagueId: effectiveLeagueId || null,
    leagueName,
    totalRegistrations: registrations.length,
    verifiedTeams,
    pendingTeams,
    cancelledOrRejectedTeams,

    totalExpectedAmount,
    totalVerifiedPaidAmount,
    totalOutstandingBalance,

    totalRosterPlayers,
    totalPaidPlayers,
    totalUnpaidPlayers,

    verifiedPaymentCompleteTeams,
    verifiedPaymentIncompleteTeams,

    totalUnallocatedVerifiedAmount,
    totalHistoricalRemovedVerifiedAmount,
    totalCombinedVerifiedAmount:
      totalVerifiedPaidAmount +
      totalUnallocatedVerifiedAmount +
      totalHistoricalRemovedVerifiedAmount,
  };
}

/**
 * Reusable helper to classify a list of canonical registrations into verified categories.
 */
export function classifyVerifiedTeams(
  registrations: CanonicalRegistrationAccounting[]
): {
  allVerified: CanonicalRegistrationAccounting[];
  verifiedPaymentComplete: CanonicalRegistrationAccounting[];
  verifiedPaymentIncomplete: CanonicalRegistrationAccounting[];
} {
  const allVerified = registrations.filter((r) => r.registrationStatus === "VERIFIED");
  const verifiedPaymentComplete = allVerified.filter((r) => r.paymentComplete);
  const verifiedPaymentIncomplete = allVerified.filter((r) => !r.paymentComplete);

  return {
    allVerified,
    verifiedPaymentComplete,
    verifiedPaymentIncomplete,
  };
}
