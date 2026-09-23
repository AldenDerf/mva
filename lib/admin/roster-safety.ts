import { prisma } from "@/lib/prisma";
import { AdminContext } from "@/lib/auth/admin";
import { Prisma, registration_status, roster_status } from "@prisma/client";

export type RosterDeletionPolicy =
  | "BLOCKED_VERIFIED_PAYMENT"
  | "UNVERIFIED_HARD_DELETE_ALLOWED"
  | "NOT_FOUND";

export interface RosterMemberDeletionEligibility {
  eligible: boolean;
  policy: RosterDeletionPolicy;
  reason: string;
  registrationPlayerId: string;
  registrationId: string | null;
  playerId: string | null;
  currentStatus: roster_status | null;
  verifiedPaymentCount: number;
  pendingPaymentCount: number;
  pendingPaymentIds: string[];
  hasOtherRegistrations: boolean;
}

export type RegistrationDeletionPolicy =
  | "BLOCKED_NOT_CANCELLED"
  | "CANCELLED_DELETE_ALLOWED"
  | "NOT_FOUND";

export interface RegistrationDeletionEligibility {
  eligible: boolean;
  policy: RegistrationDeletionPolicy;
  reason: string;
  registrationId: string;
  registrationStatus: registration_status | null;
  verifiedPaymentCount: number;
  totalPaymentCount: number;
}

export interface UnverifiedRosterMemberDeleteResult {
  success: boolean;
  error?: string;
  message: string;
  deletedRegistrationPlayerId?: string;
  purgedPendingPaymentIds?: string[];
  preservedPlayerId?: string;
  auditLogId?: string;
}

export interface RosterMemberSoftRemoveResult {
  success: boolean;
  error?: string;
  message: string;
  registrationPlayerId?: string;
  previousStatus?: roster_status;
  newStatus?: roster_status;
  auditLogId?: string;
}

/**
 * Evaluates whether an individual roster membership is eligible for hard deletion.
 * 
 * AUTHORITATIVE BUSINESS RULES (Phase 05.7D.3):
 * 1. Financial boundary: VERIFIED payment.
 *    - IF roster member has any VERIFIED payments: HARD DELETE = STRICTLY BLOCKED.
 *    - IF roster member has NO VERIFIED payments: HARD DELETE MAY BE ALLOWED after validation.
 * 2. PENDING payment placeholders do not represent collected money and may be purged inside
 *    the same explicit transaction, but NEVER via automatic generic FK cascade.
 * 3. Global player identity (players table) is preserved independently of roster membership.
 */
export async function evaluateRosterMemberDeletionEligibility(
  registrationPlayerId: string
): Promise<RosterMemberDeletionEligibility> {
  const rp = await prisma.registration_players.findUnique({
    where: { id: registrationPlayerId },
    select: {
      id: true,
      registration_id: true,
      player_id: true,
      status: true,
      payments: {
        select: {
          id: true,
          status: true,
          amount: true,
        },
      },
      players: {
        select: {
          id: true,
          _count: {
            select: {
              registration_players: true,
            },
          },
        },
      },
    },
  });

  if (!rp) {
    return {
      eligible: false,
      policy: "NOT_FOUND",
      reason: "Roster member record not found.",
      registrationPlayerId,
      registrationId: null,
      playerId: null,
      currentStatus: null,
      verifiedPaymentCount: 0,
      pendingPaymentCount: 0,
      pendingPaymentIds: [],
      hasOtherRegistrations: false,
    };
  }

  const verifiedPayments = rp.payments.filter((p) => p.status === "VERIFIED");
  const pendingPayments = rp.payments.filter((p) => p.status === "PENDING" || p.status === "REJECTED");

  if (verifiedPayments.length > 0) {
    return {
      eligible: false,
      policy: "BLOCKED_VERIFIED_PAYMENT",
      reason: `Roster member has ${verifiedPayments.length} verified payment record(s). Financial anchors and history cannot be deleted. Must use guarded roster removal lifecycle.`,
      registrationPlayerId: rp.id,
      registrationId: rp.registration_id,
      playerId: rp.player_id,
      currentStatus: rp.status,
      verifiedPaymentCount: verifiedPayments.length,
      pendingPaymentCount: pendingPayments.length,
      pendingPaymentIds: pendingPayments.map((p) => p.id),
      hasOtherRegistrations: (rp.players._count.registration_players ?? 1) > 1,
    };
  }

  return {
    eligible: true,
    policy: "UNVERIFIED_HARD_DELETE_ALLOWED",
    reason: "Roster member has no verified payments and is eligible for guarded administrative hard deletion.",
    registrationPlayerId: rp.id,
    registrationId: rp.registration_id,
    playerId: rp.player_id,
    currentStatus: rp.status,
    verifiedPaymentCount: 0,
    pendingPaymentCount: pendingPayments.length,
    pendingPaymentIds: pendingPayments.map((p) => p.id),
    hasOtherRegistrations: (rp.players._count.registration_players ?? 1) > 1,
  };
}

/**
 * Evaluates whether a team registration is eligible for hard deletion.
 * 
 * AUTHORITATIVE BUSINESS RULE:
 * Hard deletion of a TEAM/REGISTRATION is ONLY potentially allowed when:
 *   registration.status === 'CANCELLED'
 * Non-cancelled registrations must NOT be hard-deleted through normal admin operations.
 */
export async function evaluateRegistrationDeletionEligibility(
  registrationId: string
): Promise<RegistrationDeletionEligibility> {
  const reg = await prisma.registrations.findUnique({
    where: { id: registrationId },
    select: {
      id: true,
      status: true,
      payments: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!reg) {
    return {
      eligible: false,
      policy: "NOT_FOUND",
      reason: "Registration record not found.",
      registrationId,
      registrationStatus: null,
      verifiedPaymentCount: 0,
      totalPaymentCount: 0,
    };
  }

  const verifiedCount = reg.payments.filter((p) => p.status === "VERIFIED").length;

  if (reg.status !== "CANCELLED") {
    return {
      eligible: false,
      policy: "BLOCKED_NOT_CANCELLED",
      reason: `Hard deletion is strictly prohibited for non-cancelled registrations. Current status is "${reg.status}". Only CANCELLED registrations may be considered for deletion.`,
      registrationId: reg.id,
      registrationStatus: reg.status,
      verifiedPaymentCount: verifiedCount,
      totalPaymentCount: reg.payments.length,
    };
  }

  return {
    eligible: true,
    policy: "CANCELLED_DELETE_ALLOWED",
    reason: "Registration is CANCELLED and may be eligible for administrative deletion under financial and audit safeguards.",
    registrationId: reg.id,
    registrationStatus: reg.status,
    verifiedPaymentCount: verifiedCount,
    totalPaymentCount: reg.payments.length,
  };
}

/**
 * Executes a safe, atomic hard deletion of an UNVERIFIED roster member.
 * 
 * SAFETY INVARIANTS:
 * 1. Admin authorization check.
 * 2. Re-checks payment state inside transaction: refuses if any VERIFIED payment exists.
 * 3. Explicitly purges eligible unverified PENDING payment placeholders inside transaction.
 * 4. Deletes registration_players record (blocked at DB level if any verified payment exists via ON DELETE RESTRICT).
 * 5. Strictly preserves the global players table record (does not delete person identity).
 * 6. Writes immutable admin_audit_log entry ROSTER_MEMBER_DELETED.
 */
export async function executeUnverifiedRosterMemberHardDelete(
  admin: AdminContext,
  params: {
    registrationPlayerId: string;
    registrationId: string;
  }
): Promise<UnverifiedRosterMemberDeleteResult> {
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "Active administrator credentials required.",
    };
  }

  return await prisma.$transaction(async (tx) => {
    // 1. Fetch under transaction
    const rp = await tx.registration_players.findUnique({
      where: { id: params.registrationPlayerId },
      include: {
        payments: true,
        players: true,
      },
    });

    if (!rp || rp.registration_id !== params.registrationId) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Roster member not found on this registration.",
      };
    }

    // 2. Financial Boundary Check: ZERO verified payments allowed
    const verifiedPayments = rp.payments.filter((p) => p.status === "VERIFIED");
    if (verifiedPayments.length > 0) {
      throw new Error(
        `CRITICAL_FINANCIAL_INVARIANT_VIOLATION: Cannot delete roster member with verified payments (${verifiedPayments.length} verified payment(s) present).`
      );
    }

    // 3. Purge unverified PENDING/REJECTED payment placeholders
    const pendingPaymentIds = rp.payments
      .filter((p) => p.status === "PENDING" || p.status === "REJECTED")
      .map((p) => p.id);

    if (pendingPaymentIds.length > 0) {
      await tx.payments.deleteMany({
        where: {
          id: { in: pendingPaymentIds },
          registration_player_id: rp.id,
          status: { in: ["PENDING", "REJECTED"] },
        },
      });
    }

    // 4. Delete the roster member (registration_players)
    await tx.registration_players.delete({
      where: { id: rp.id },
    });

    // 5. Note: Global players record is intentionally PRESERVED (Section E)

    // 6. Record audit log
    const auditLog = await tx.admin_audit_logs.create({
      data: {
        admin_profile_id: admin.profileId,
        action: "ROSTER_MEMBER_DELETED",
        entity_type: "REGISTRATION_PLAYER",
        entity_id: rp.id,
        metadata: {
          registration_id: rp.registration_id,
          player_id: rp.player_id,
          jersey_number: rp.jersey_number,
          position: rp.position,
          is_captain: rp.is_captain,
          status: rp.status,
          purged_pending_payment_ids: pendingPaymentIds,
          global_player_preserved: true,
        } as Prisma.InputJsonObject,
      },
    });

    return {
      success: true,
      message: "Unverified roster member safely deleted from roster.",
      deletedRegistrationPlayerId: rp.id,
      purgedPendingPaymentIds: pendingPaymentIds,
      preservedPlayerId: rp.player_id,
      auditLogId: auditLog.id,
    };
  });
}

/**
 * Transitions a roster member to REMOVED status (soft removal).
 * Required for VERIFIED players who cannot be hard deleted, preserving all payment history and anchors.
 */
export async function executeRosterMemberSoftRemoval(
  admin: AdminContext,
  params: {
    registrationPlayerId: string;
    registrationId: string;
    reason?: string;
  }
): Promise<RosterMemberSoftRemoveResult> {
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "Active administrator credentials required.",
    };
  }

  return await prisma.$transaction(async (tx) => {
    const rp = await tx.registration_players.findUnique({
      where: { id: params.registrationPlayerId },
      select: {
        id: true,
        registration_id: true,
        player_id: true,
        status: true,
        is_captain: true,
      },
    });

    if (!rp || rp.registration_id !== params.registrationId) {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Roster member not found on this registration.",
      };
    }

    if (rp.status === "REMOVED") {
      return {
        success: true,
        message: "Roster member is already marked as REMOVED.",
        registrationPlayerId: rp.id,
        previousStatus: "REMOVED",
        newStatus: "REMOVED",
      };
    }

    const updatedRp = await tx.registration_players.update({
      where: { id: rp.id },
      data: {
        status: "REMOVED",
        removed_at: new Date(),
        removed_by_profile_id: admin.profileId,
        is_captain: false, // Automatically relinquish captaincy on removal
      },
    });

    const auditLog = await tx.admin_audit_logs.create({
      data: {
        admin_profile_id: admin.profileId,
        action: "ROSTER_MEMBER_REMOVED",
        entity_type: "REGISTRATION_PLAYER",
        entity_id: rp.id,
        metadata: {
          registration_id: rp.registration_id,
          player_id: rp.player_id,
          previous_status: rp.status,
          new_status: "REMOVED",
          reason: params.reason ?? "Administrative roster member removal",
          relinquished_captaincy: rp.is_captain,
        } as Prisma.InputJsonObject,
      },
    });

    return {
      success: true,
      message: "Roster member status updated to REMOVED.",
      registrationPlayerId: updatedRp.id,
      previousStatus: rp.status,
      newStatus: "REMOVED",
      auditLogId: auditLog.id,
    };
  });
}
