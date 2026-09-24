import { prisma } from "@/lib/prisma";
import { AdminContext } from "@/lib/auth/admin";
import { Prisma, registration_status, roster_status } from "@prisma/client";

export type RosterDeletionPolicy =
  | "BLOCKED_VERIFIED_REGISTRATION"
  | "BLOCKED_VERIFIED_PAYMENT"
  | "BLOCKED_CAPTAIN"
  | "UNVERIFIED_HARD_DELETE_ALLOWED"
  | "NOT_FOUND";

export interface RosterMemberDeletionEligibility {
  eligible: boolean;
  policy: RosterDeletionPolicy;
  reason: string;
  registrationPlayerId: string;
  registrationId: string | null;
  registrationStatus: registration_status | null;
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
 * FINAL AUTHORITATIVE BUSINESS RULES (Phase 05.7D.4 — VERIFICATION BOUNDARY):
 * 1. Historical boundary: REGISTRATION VERIFICATION IS THE ABSOLUTE BOUNDARY.
 *    - Once registration.status === 'VERIFIED', the registration and its roster become
 *      historical/accountable records.
 *    - A player belonging to a VERIFIED registration can NEVER be hard-deleted,
 *      regardless of payment status, roster status, or future refund status.
 * 2. Pre-Verification Correction:
 *    - For registrations that have NOT been VERIFIED (e.g. PENDING_PAYMENT, REJECTED, CANCELLED):
 *      guarded administrative hard deletion is available subject to captain protection,
 *      absence of verified payments, and transaction validation.
 * 3. PENDING payment placeholders do not represent collected money and may be purged inside
 *    the explicit transaction, but NEVER via automatic generic FK cascade.
 * 4. Global player identity (players table) is preserved independently of roster membership.
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
      is_captain: true,
      registrations: {
        select: {
          id: true,
          status: true,
        },
      },
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
      registrationStatus: null,
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

  // Rule 1: Registration Verification is the Historical Boundary.
  // Once verified, players can NEVER be hard-deleted.
  if (rp.registrations.status === "VERIFIED") {
    return {
      eligible: false,
      policy: "BLOCKED_VERIFIED_REGISTRATION",
      reason: "This registration is already verified. Players can no longer be permanently deleted. Use roster management actions instead.",
      registrationPlayerId: rp.id,
      registrationId: rp.registration_id,
      registrationStatus: rp.registrations.status,
      playerId: rp.player_id,
      currentStatus: rp.status,
      verifiedPaymentCount: verifiedPayments.length,
      pendingPaymentCount: pendingPayments.length,
      pendingPaymentIds: pendingPayments.map((p) => p.id),
      hasOtherRegistrations: (rp.players._count.registration_players ?? 1) > 1,
    };
  }

  // Rule 2: Captain Guard in pre-verification stage.
  if (rp.is_captain) {
    return {
      eligible: false,
      policy: "BLOCKED_CAPTAIN",
      reason: "Reassign the team captain before removing this player.",
      registrationPlayerId: rp.id,
      registrationId: rp.registration_id,
      registrationStatus: rp.registrations.status,
      playerId: rp.player_id,
      currentStatus: rp.status,
      verifiedPaymentCount: verifiedPayments.length,
      pendingPaymentCount: pendingPayments.length,
      pendingPaymentIds: pendingPayments.map((p) => p.id),
      hasOtherRegistrations: (rp.players._count.registration_players ?? 1) > 1,
    };
  }

  // Rule 3: Any verified payment prevents hard deletion.
  if (verifiedPayments.length > 0) {
    return {
      eligible: false,
      policy: "BLOCKED_VERIFIED_PAYMENT",
      reason: "This player has verified payment records and cannot be hard deleted. Use roster management actions instead.",
      registrationPlayerId: rp.id,
      registrationId: rp.registration_id,
      registrationStatus: rp.registrations.status,
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
    reason: "Roster member belongs to an unverified registration with no verified payments and is eligible for administrative deletion.",
    registrationPlayerId: rp.id,
    registrationId: rp.registration_id,
    registrationStatus: rp.registrations.status,
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
export interface RosterMemberRestoreResult {
  success: boolean;
  error?: string;
  message: string;
  registrationPlayerId?: string;
  previousStatus?: roster_status;
  newStatus?: roster_status;
  auditLogId?: string;
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
 * Executes a safe, atomic hard deletion of an UNVERIFIED roster member.
 *
 * SAFETY INVARIANTS:
 * 1. Admin authorization check.
 * 2. Captain guard: Blocks if member is active captain; requires captain reassignment first.
 * 3. Re-checks payment state inside transaction: refuses if any VERIFIED payment exists.
 * 4. Explicitly purges eligible unverified PENDING/REJECTED payment placeholders inside transaction.
 * 5. Deletes registration_players record (blocked at DB level if any verified payment exists via ON DELETE RESTRICT).
 * 6. Strictly preserves the global players table record (does not delete person identity).
 * 7. Writes immutable admin_audit_log entry ROSTER_MEMBER_DELETED with reason and actor details.
 */
export async function executeUnverifiedRosterMemberHardDelete(
  admin: AdminContext,
  params: {
    registrationPlayerId: string;
    registrationId: string;
    reason?: string;
  }
): Promise<UnverifiedRosterMemberDeleteResult> {
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "Active administrator credentials required.",
    };
  }

  const trimmedReason = typeof params.reason === "string" ? params.reason.trim() : "Administrative unverified player deletion";
  if (params.reason !== undefined && !trimmedReason) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A reason is strictly required to delete a player from the roster.",
    };
  }
  if (trimmedReason.length > 500) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Reason must not exceed 500 characters.",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // 1. Fetch under transaction with relations
      const rp = await tx.registration_players.findUnique({
        where: { id: params.registrationPlayerId },
        include: {
          payments: true,
          players: true,
          registrations: {
            include: {
              teams: {
                select: {
                  id: true,
                  team_name: true,
                },
              },
            },
          },
        },
      });

      if (!rp || rp.registration_id !== params.registrationId) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "Roster member not found on this registration.",
        };
      }

      // 1. REGISTRATION VERIFICATION HISTORICAL BOUNDARY:
      // Once registration.status === 'VERIFIED', roster members can NEVER be hard-deleted.
      if (rp.registrations.status === "VERIFIED") {
        return {
          success: false,
          error: "BLOCKED_VERIFIED_REGISTRATION",
          message: "This registration is already verified. Players can no longer be permanently deleted. Use roster management actions instead.",
        };
      }

      // 2. Captain Guard: Do NOT allow deleting active captain
      if (rp.is_captain) {
        return {
          success: false,
          error: "CAPTAIN_REMOVAL_BLOCKED",
          message: "Reassign the team captain before removing this player.",
        };
      }

      // 3. Financial Boundary Check: ZERO verified payments allowed
      const verifiedPayments = rp.payments.filter((p) => p.status === "VERIFIED");
      if (verifiedPayments.length > 0) {
        return {
          success: false,
          error: "BLOCKED_VERIFIED_PAYMENT",
          message: "This player has verified payment records and cannot be hard deleted. Use roster management actions instead.",
        };
      }

      // 5. Purge unverified PENDING/REJECTED payment placeholders
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

      // 6. Delete the roster member (registration_players)
      await tx.registration_players.delete({
        where: { id: rp.id },
      });

      // 7. Note: Global players record is intentionally PRESERVED

      const fullName = formatFullName(
        rp.players.first_name,
        rp.players.middle_name,
        rp.players.last_name,
        rp.players.suffix
      );

      // 8. Record immutable audit log
      const auditLog = await tx.admin_audit_logs.create({
        data: {
          admin_profile_id: admin.profileId,
          action: "ROSTER_MEMBER_DELETED",
          entity_type: "REGISTRATION_PLAYER",
          entity_id: rp.id,
          metadata: {
            registration_id: rp.registration_id,
            registration_player_id: rp.id,
            player_id: rp.player_id,
            player_name: fullName,
            team_id: rp.registrations.team_id,
            team_name: rp.registrations.teams.team_name,
            jersey_number: rp.jersey_number,
            position: rp.position,
            is_captain: rp.is_captain,
            previous_roster_status: rp.status,
            reason: trimmedReason,
            payment_state_summary: "No verified payments; unverified placeholder payments purged",
            purged_pending_payment_ids: pendingPaymentIds,
            global_player_preserved: true,
            actor_profile_id: admin.profileId,
            actor_name: admin.displayName,
            actor_email: admin.email,
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
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    if (errMsg.includes("fk_payments_registration_player") || errMsg.includes("restrict_violation")) {
      return {
        success: false,
        error: "BLOCKED_VERIFIED_PAYMENT",
        message: "This player has payment records preventing hard deletion. Use roster management actions instead.",
      };
    }
    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while deleting the player from the roster.",
    };
  }
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

  const trimmedReason = typeof params.reason === "string" ? params.reason.trim() : "Administrative roster member removal";
  if (params.reason !== undefined && !trimmedReason) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A reason is strictly required to remove a player from the roster.",
    };
  }
  if (trimmedReason.length > 500) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Reason must not exceed 500 characters.",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const rp = await tx.registration_players.findUnique({
        where: { id: params.registrationPlayerId },
        include: {
          payments: true,
          players: true,
          registrations: {
            include: {
              teams: {
                select: {
                  id: true,
                  team_name: true,
                },
              },
            },
          },
        },
      });

      if (!rp || rp.registration_id !== params.registrationId) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "Roster member not found on this registration.",
        };
      }

      // Captain Guard: Do NOT allow removing active captain
      if (rp.is_captain) {
        return {
          success: false,
          error: "CAPTAIN_REMOVAL_BLOCKED",
          message: "Reassign the team captain before removing this player.",
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
          is_captain: false,
        },
      });

      const fullName = formatFullName(
        rp.players.first_name,
        rp.players.middle_name,
        rp.players.last_name,
        rp.players.suffix
      );

      const verifiedPayments = rp.payments.filter((p) => p.status === "VERIFIED");
      const verifiedTotal = verifiedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      const auditLog = await tx.admin_audit_logs.create({
        data: {
          admin_profile_id: admin.profileId,
          action: "ROSTER_MEMBER_REMOVED",
          entity_type: "REGISTRATION_PLAYER",
          entity_id: rp.id,
          metadata: {
            registration_id: rp.registration_id,
            registration_player_id: rp.id,
            player_id: rp.player_id,
            player_name: fullName,
            team_id: rp.registrations.team_id,
            team_name: rp.registrations.teams.team_name,
            previous_status: rp.status,
            new_status: "REMOVED",
            reason: trimmedReason,
            verified_payment_summary:
              verifiedPayments.length > 0
                ? `${verifiedPayments.length} verified payment(s) totaling ₱${verifiedTotal.toFixed(2)} preserved`
                : "No verified payments; player moved to removed roster",
            actor_profile_id: admin.profileId,
            actor_name: admin.displayName,
            actor_email: admin.email,
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
  } catch {
    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while removing the player from the roster.",
    };
  }
}

/**
 * Transitions a REMOVED roster member back to ACTIVE status (restore).
 * Re-incorporates any existing verified payment without creating or altering payments.
 */
export async function executeRosterMemberRestore(
  admin: AdminContext,
  params: {
    registrationPlayerId: string;
    registrationId: string;
    reason?: string;
  }
): Promise<RosterMemberRestoreResult> {
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "Active administrator credentials required.",
    };
  }

  const trimmedReason = typeof params.reason === "string" ? params.reason.trim() : "Administrative roster member restoration";
  if (trimmedReason.length > 500) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Reason must not exceed 500 characters.",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const rp = await tx.registration_players.findUnique({
        where: { id: params.registrationPlayerId },
        include: {
          payments: true,
          players: true,
          registrations: {
            include: {
              teams: {
                select: {
                  id: true,
                  team_name: true,
                },
              },
            },
          },
        },
      });

      if (!rp || rp.registration_id !== params.registrationId) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "Roster member not found on this registration.",
        };
      }

      if (rp.registrations.status === "CANCELLED") {
        return {
          success: false,
          error: "INVALID_REGISTRATION_STATUS",
          message: "Cannot restore players to a cancelled registration.",
        };
      }

      if (rp.status === "ACTIVE") {
        return {
          success: true,
          message: "Roster member is already active on this roster.",
          registrationPlayerId: rp.id,
          previousStatus: "ACTIVE",
          newStatus: "ACTIVE",
        };
      }

      // Guard: Ensure no duplicate active roster entry exists for this player on the same registration
      const conflictingActive = await tx.registration_players.findFirst({
        where: {
          registration_id: rp.registration_id,
          player_id: rp.player_id,
          status: "ACTIVE",
          id: { not: rp.id },
        },
      });

      if (conflictingActive) {
        return {
          success: false,
          error: "DUPLICATE_ACTIVE_MEMBER",
          message: "This player already has an active entry on this roster.",
        };
      }

      const updatedRp = await tx.registration_players.update({
        where: { id: rp.id },
        data: {
          status: "ACTIVE",
          removed_at: null,
          removed_by_profile_id: null,
        },
      });

      const fullName = formatFullName(
        rp.players.first_name,
        rp.players.middle_name,
        rp.players.last_name,
        rp.players.suffix
      );

      const verifiedPayments = rp.payments.filter((p) => p.status === "VERIFIED");
      const verifiedTotal = verifiedPayments.reduce((sum, p) => sum + Number(p.amount), 0);

      const auditLog = await tx.admin_audit_logs.create({
        data: {
          admin_profile_id: admin.profileId,
          action: "ROSTER_MEMBER_RESTORED",
          entity_type: "REGISTRATION_PLAYER",
          entity_id: rp.id,
          metadata: {
            registration_id: rp.registration_id,
            registration_player_id: rp.id,
            player_id: rp.player_id,
            player_name: fullName,
            team_id: rp.registrations.team_id,
            team_name: rp.registrations.teams.team_name,
            previous_status: "REMOVED",
            new_status: "ACTIVE",
            reason: trimmedReason,
            verified_payment_summary: `${verifiedPayments.length} verified payment(s) totaling ₱${verifiedTotal.toFixed(2)} reactivated`,
            actor_profile_id: admin.profileId,
            actor_name: admin.displayName,
            actor_email: admin.email,
          } as Prisma.InputJsonObject,
        },
      });

      return {
        success: true,
        message: "Roster member successfully restored to active roster.",
        registrationPlayerId: updatedRp.id,
        previousStatus: "REMOVED",
        newStatus: "ACTIVE",
        auditLogId: auditLog.id,
      };
    });
  } catch {
    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while restoring the player to the roster.",
    };
  }
}
