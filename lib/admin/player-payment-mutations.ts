import { prisma } from "@/lib/prisma";
import { payment_status, payment_method, Prisma } from "@prisma/client";
import { AdminContext } from "@/lib/auth/admin";

export type AdminPlayerPaymentAction = "VERIFY" | "REJECT" | "REFUND";

export type PlayerPaymentErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "STALE_STATE"
  | "VALIDATION_ERROR"
  | "TRANSACTION_ERROR";

export interface PlayerPaymentMutationSuccess {
  success: true;
  paymentId: string;
  newStatus: payment_status;
  amount: number;
  playerName: string;
  auditLogId: string;
}

export interface PlayerPaymentMutationFailure {
  success: false;
  error: PlayerPaymentErrorCode;
  message: string;
  currentStatus?: payment_status;
}

export type PlayerPaymentMutationResult =
  | PlayerPaymentMutationSuccess
  | PlayerPaymentMutationFailure;

export interface MutatePlayerPaymentParams {
  registrationPlayerId: string;
  paymentId?: string;
  action: AdminPlayerPaymentAction;
  expectedStatus?: payment_status;
  paymentMethod?: payment_method;
  referenceNumber?: string | null;
  notes?: string | null;
  reason?: string | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PLAYER_PAYMENT_FEE = 300.0;

/**
 * Validates allowed player payment state machine transitions:
 * - PENDING -> VERIFIED, REJECTED
 * - VERIFIED -> REFUNDED
 * - REJECTED -> PENDING
 * - REFUNDED: terminal
 */
export function getTargetPaymentStatusForAction(
  action: AdminPlayerPaymentAction
): payment_status {
  switch (action) {
    case "VERIFY":
      return "VERIFIED";
    case "REJECT":
      return "REJECTED";
    case "REFUND":
      return "REFUNDED";
  }
}

export function isAllowedPlayerPaymentTransition(
  currentStatus: payment_status,
  targetStatus: payment_status
): boolean {
  if (currentStatus === "PENDING") {
    return targetStatus === "VERIFIED" || targetStatus === "REJECTED";
  }

  if (currentStatus === "VERIFIED") {
    return targetStatus === "REFUNDED";
  }

  if (currentStatus === "REJECTED") {
    return targetStatus === "PENDING" || targetStatus === "VERIFIED";
  }

  // REFUNDED is a terminal state
  return false;
}

export function getPlayerPaymentAuditAction(
  action: AdminPlayerPaymentAction
): string {
  switch (action) {
    case "VERIFY":
      return "PLAYER_PAYMENT_VERIFIED";
    case "REJECT":
      return "PLAYER_PAYMENT_REJECTED";
    case "REFUND":
      return "PLAYER_PAYMENT_REFUNDED";
  }
}

export class StalePlayerPaymentStateError extends Error {
  currentStatus: payment_status;
  constructor(message: string, currentStatus: payment_status) {
    super(message);
    this.name = "StalePlayerPaymentStateError";
    this.currentStatus = currentStatus;
  }
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
 * Executes an atomic player payment status transition and writes an immutable audit log record.
 * 
 * Guarantees:
 * 1. Admin identity is derived strictly from verified AdminContext.
 * 2. State transition strictly follows the approved per-player state machine.
 * 3. Atomic conditional update & PostgreSQL partial unique index guard against race conditions.
 * 4. Audit logging and payment update are bound in a single Prisma interactive transaction.
 * 5. Team registration status and roster membership remain completely independent and untouched.
 */
export async function mutatePlayerPaymentStatus(
  admin: AdminContext,
  params: MutatePlayerPaymentParams
): Promise<PlayerPaymentMutationResult> {
  const {
    registrationPlayerId,
    paymentId,
    action,
    expectedStatus,
    paymentMethod = "CASH",
    referenceNumber,
    notes,
    reason,
  } = params;

  // 1. Validate Admin Context
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "You must have active administrator access to manage player payments.",
    };
  }

  // 2. Validate IDs
  if (!registrationPlayerId || !UUID_REGEX.test(registrationPlayerId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration player ID.",
    };
  }

  if (paymentId && !UUID_REGEX.test(paymentId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid payment record ID.",
    };
  }

  // 3. Reason requirement for REJECT and REFUND
  const effectiveReason = (reason || notes)?.trim() || null;
  if ((action === "REJECT" || action === "REFUND") && !effectiveReason) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `A non-empty reason is strictly required to ${action.toLowerCase()} a payment.`,
    };
  }

  const targetStatus = getTargetPaymentStatusForAction(action);
  const auditAction = getPlayerPaymentAuditAction(action);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // A. Read registration_player with joined player and registration details
        const rp = await tx.registration_players.findUnique({
          where: { id: registrationPlayerId },
          include: {
            players: true,
            registrations: {
              include: {
                teams: true,
              },
            },
            payments: {
              orderBy: { created_at: "desc" },
            },
          },
        });

        if (!rp) {
          throw new Error("NOT_FOUND:ROSTER_PLAYER");
        }

        const playerName = formatFullName(
          rp.players.first_name,
          rp.players.middle_name,
          rp.players.last_name,
          rp.players.suffix
        );

        // B. Identify target payment record
        const targetPayment = paymentId
          ? rp.payments.find((p) => p.id === paymentId)
          : rp.payments[0];

        // If action is VERIFY and no payment record exists, we create one directly as VERIFIED
        if (!targetPayment && action === "VERIFY") {
          const newPayment = await tx.payments.create({
            data: {
              registration_id: rp.registration_id,
              registration_player_id: rp.id,
              payment_method: paymentMethod,
              amount: PLAYER_PAYMENT_FEE,
              reference_number: referenceNumber?.trim() || null,
              status: "VERIFIED",
              verified_at: new Date(),
              verified_by_profile_id: admin.profileId,
              notes: effectiveReason,
            },
          });

          // Insert audit log
          const auditLog = await tx.admin_audit_logs.create({
            data: {
              admin_profile_id: admin.profileId,
              action: auditAction,
              entity_type: "PAYMENT",
              entity_id: newPayment.id,
              metadata: {
                payment_id: newPayment.id,
                registration_id: rp.registration_id,
                registration_code: rp.registrations.registration_code,
                registration_player_id: rp.id,
                player_id: rp.players.id,
                player_name: playerName,
                team_name: rp.registrations.teams.team_name,
                amount: PLAYER_PAYMENT_FEE,
                payment_method: paymentMethod,
                reference_number: referenceNumber?.trim() || null,
                previous_status: "NO_PAYMENT",
                new_status: "VERIFIED",
                reason: effectiveReason,
                actor_name: admin.displayName,
                actor_email: admin.email,
              },
            },
          });

          return {
            paymentId: newPayment.id,
            newStatus: "VERIFIED" as const,
            amount: Number(newPayment.amount),
            playerName,
            auditLogId: auditLog.id,
          };
        }

        if (!targetPayment) {
          throw new Error("NOT_FOUND:PAYMENT_RECORD");
        }

        // C. Check for same-state / idempotent request
        if (targetPayment.status === targetStatus) {
          throw new StalePlayerPaymentStateError(
            `Payment is already ${targetStatus}. No changes were made.`,
            targetPayment.status
          );
        }

        // D. Check for stale expected status
        if (expectedStatus && targetPayment.status !== expectedStatus) {
          throw new StalePlayerPaymentStateError(
            `Payment status has changed (currently ${targetPayment.status}). Please refresh and try again.`,
            targetPayment.status
          );
        }

        // E. State machine validation
        if (!isAllowedPlayerPaymentTransition(targetPayment.status, targetStatus)) {
          throw new Error(`INVALID_TRANSITION:${targetPayment.status}`);
        }

        // F. Prepare update payload
        const updateData: Prisma.paymentsUpdateInput = {
          status: targetStatus,
          updated_at: new Date(),
        };

        if (targetStatus === "VERIFIED") {
          updateData.verified_at = new Date();
          updateData.verified_by_profile = { connect: { id: admin.profileId } };
          updateData.payment_method = paymentMethod;
          if (referenceNumber !== undefined) {
            updateData.reference_number = referenceNumber?.trim() || null;
          }
          if (effectiveReason) {
            updateData.notes = effectiveReason;
          }
        } else if (targetStatus === "REJECTED") {
          updateData.verified_at = null;
          updateData.verified_by_profile = { disconnect: true };
          updateData.notes = effectiveReason;
        } else if (targetStatus === "REFUNDED") {
          updateData.notes = effectiveReason;
        }

        // G. Update target payment record
        await tx.payments.update({
          where: {
            id: targetPayment.id,
          },
          data: updateData,
        });

        // H. Create immutable audit log
        const auditLog = await tx.admin_audit_logs.create({
          data: {
            admin_profile_id: admin.profileId,
            action: auditAction,
            entity_type: "PAYMENT",
            entity_id: targetPayment.id,
            metadata: {
              payment_id: targetPayment.id,
              registration_id: rp.registration_id,
              registration_code: rp.registrations.registration_code,
              registration_player_id: rp.id,
              player_id: rp.players.id,
              player_name: playerName,
              team_name: rp.registrations.teams.team_name,
              amount: Number(targetPayment.amount),
              payment_method: paymentMethod,
              reference_number: referenceNumber?.trim() ?? targetPayment.reference_number,
              previous_status: targetPayment.status,
              new_status: targetStatus,
              reason: effectiveReason,
              actor_name: admin.displayName,
              actor_email: admin.email,
            },
          },
        });

        return {
          paymentId: targetPayment.id,
          newStatus: targetStatus,
          amount: Number(targetPayment.amount),
          playerName,
          auditLogId: auditLog.id,
        };
      }
    );

    return {
      success: true,
      ...result,
    };
  } catch (error: unknown) {
    if (error instanceof StalePlayerPaymentStateError) {
      return {
        success: false,
        error: "STALE_STATE",
        message: error.message,
        currentStatus: error.currentStatus,
      };
    }

    if (error instanceof Error) {
      if (error.message.startsWith("NOT_FOUND")) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "The requested player roster or payment record was not found.",
        };
      }

      if (error.message.startsWith("INVALID_TRANSITION")) {
        const parts = error.message.split(":");
        const current = (parts[1] as payment_status) || "UNKNOWN";
        return {
          success: false,
          error: "INVALID_TRANSITION",
          message: `Cannot transition payment from ${current} to ${targetStatus}.`,
          currentStatus: current,
        };
      }

      // Check PostgreSQL unique violation code 23505 (duplicate partial unique index)
      if (
        error.message.includes("uq_payments_active_verified_player") ||
        error.message.includes("Unique constraint failed")
      ) {
        return {
          success: false,
          error: "STALE_STATE",
          message: "This player already has an active verified payment.",
        };
      }

      return {
        success: false,
        error: "TRANSACTION_ERROR",
        message: error.message,
      };
    }

    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while updating player payment.",
    };
  }
}
