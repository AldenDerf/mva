import { prisma } from "@/lib/prisma";
import { registration_status, Prisma } from "@prisma/client";
import { AdminContext } from "@/lib/auth/admin";

export type AdminRegistrationAction = "VERIFY" | "REJECT" | "CANCEL";

export type MutationErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_TRANSITION"
  | "STALE_STATE"
  | "VALIDATION_ERROR"
  | "TRANSACTION_ERROR";

export interface MutationSuccess {
  success: true;
  newStatus: registration_status;
  registrationCode: string;
  auditLogId: string;
}

export interface MutationFailure {
  success: false;
  error: MutationErrorCode;
  message: string;
  currentStatus?: registration_status;
}

export type MutationResult = MutationSuccess | MutationFailure;

export interface MutateRegistrationStatusParams {
  registrationId: string;
  action: AdminRegistrationAction;
  expectedStatus?: registration_status;
  reason?: string | null;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates allowed state transitions based on approved MVA domain rules:
 * - PENDING_PAYMENT -> VERIFIED, REJECTED, CANCELLED
 * - VERIFIED -> CANCELLED
 * - REJECTED: terminal
 * - CANCELLED: terminal
 */
export function getTargetStatusForAction(
  action: AdminRegistrationAction
): registration_status {
  switch (action) {
    case "VERIFY":
      return "VERIFIED";
    case "REJECT":
      return "REJECTED";
    case "CANCEL":
      return "CANCELLED";
  }
}

export function isAllowedTransition(
  currentStatus: registration_status,
  targetStatus: registration_status
): boolean {
  if (currentStatus === "PENDING_PAYMENT") {
    return (
      targetStatus === "VERIFIED" ||
      targetStatus === "REJECTED" ||
      targetStatus === "CANCELLED"
    );
  }

  if (currentStatus === "VERIFIED") {
    return targetStatus === "CANCELLED";
  }

  // REJECTED and CANCELLED are terminal states
  return false;
}

export function getAuditActionName(action: AdminRegistrationAction): string {
  switch (action) {
    case "VERIFY":
      return "REGISTRATION_VERIFIED";
    case "REJECT":
      return "REGISTRATION_REJECTED";
    case "CANCEL":
      return "REGISTRATION_CANCELLED";
  }
}

class StaleStateError extends Error {
  currentStatus: registration_status;
  constructor(message: string, currentStatus: registration_status) {
    super(message);
    this.name = "StaleStateError";
    this.currentStatus = currentStatus;
  }
}

/**
 * Executes an atomic registration status transition and writes an immutable audit log record.
 * 
 * Guarantees:
 * 1. Admin identity is derived strictly from verified AdminContext.
 * 2. State transition strictly follows the approved MVA state machine.
 * 3. Atomic conditional update guards against stale browser state and race conditions.
 * 4. Audit logging and status mutation are bound in a single Prisma interactive transaction.
 * 5. Payment records and registrations.notes remain completely untouched.
 */
export async function mutateRegistrationStatus(
  admin: AdminContext,
  params: MutateRegistrationStatusParams
): Promise<MutationResult> {
  const { registrationId, action, expectedStatus, reason } = params;

  // 1. Validate Admin Context
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "You must have active administrator access to perform this action.",
    };
  }

  // 2. Validate Registration ID format
  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID.",
    };
  }

  // 3. Validate Reason requirement based on action
  const trimmedReason = reason?.trim() || null;
  if ((action === "REJECT" || action === "CANCEL") && !trimmedReason) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `A non-empty reason is strictly required to ${action.toLowerCase()} a registration.`,
    };
  }

  const targetStatus = getTargetStatusForAction(action);
  const auditAction = getAuditActionName(action);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // A. Read current registration state with locking/isolation context
        const currentReg = await tx.registrations.findUnique({
          where: { id: registrationId },
          select: {
            id: true,
            status: true,
            verified_at: true,
            registration_code: true,
            teams: {
              select: {
                team_name: true,
              },
            },
          },
        });

        if (!currentReg) {
          throw new Error("NOT_FOUND");
        }

        // B. Check for same-state / idempotent request
        if (currentReg.status === targetStatus) {
          throw new StaleStateError(
            `Registration is already ${targetStatus}. No changes were made.`,
            currentReg.status
          );
        }

        // C. Check for stale expected status
        if (expectedStatus && currentReg.status !== expectedStatus) {
          throw new StaleStateError(
            `This registration status has changed (currently ${currentReg.status}). Please refresh the page and try again.`,
            currentReg.status
          );
        }

        // D. Validate state machine transition rules
        if (!isAllowedTransition(currentReg.status, targetStatus)) {
          throw new Error(`INVALID_TRANSITION:${currentReg.status}`);
        }

        // E. Determine verified_at handling:
        // - PENDING_PAYMENT -> VERIFIED: set verified_at to current timestamp
        // - PENDING_PAYMENT -> REJECTED: verified_at remains null
        // - PENDING_PAYMENT -> CANCELLED: verified_at remains null
        // - VERIFIED -> CANCELLED: KEEP existing verified_at timestamp
        const updateData: Prisma.registrationsUpdateInput = {
          status: targetStatus,
        };

        if (targetStatus === "VERIFIED") {
          updateData.verified_at = new Date();
        } else if (currentReg.status === "PENDING_PAYMENT") {
          updateData.verified_at = null;
        }
        // When VERIFIED -> CANCELLED, we deliberately omit verified_at so it remains untouched

        // F. Atomic conditional update (concurrency guard)
        const updateResult = await tx.registrations.updateMany({
          where: {
            id: registrationId,
            status: currentReg.status, // Enforce expected current state at database level
          },
          data: updateData,
        });

        if (updateResult.count === 0) {
          throw new StaleStateError(
            "Concurrent modification detected. Another administrator may have updated this registration.",
            currentReg.status
          );
        }

        // G. Insert immutable Audit Log record
        const auditLog = await tx.admin_audit_logs.create({
          data: {
            admin_profile_id: admin.profileId,
            action: auditAction,
            entity_type: "REGISTRATION",
            entity_id: registrationId,
            metadata: {
              previous_status: currentReg.status,
              new_status: targetStatus,
              registration_code: currentReg.registration_code,
              team_name: currentReg.teams.team_name,
              reason: trimmedReason,
              actor_name: admin.displayName,
              actor_email: admin.email,
            },
          },
        });

        return {
          newStatus: targetStatus,
          registrationCode:
            currentReg.registration_code || `REG-${registrationId.slice(0, 8).toUpperCase()}`,
          auditLogId: auditLog.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    return {
      success: true,
      newStatus: result.newStatus,
      registrationCode: result.registrationCode,
      auditLogId: result.auditLogId,
    };
  } catch (err: unknown) {
    if (err instanceof StaleStateError) {
      return {
        success: false,
        error: "STALE_STATE",
        message: err.message,
        currentStatus: err.currentStatus,
      };
    }

    // Translate PostgreSQL / Prisma serialization failures and write conflicts into safe STALE_STATE
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034") {
      return {
        success: false,
        error: "STALE_STATE",
        message:
          "Concurrent modification detected. Another administrator may have updated this registration.",
      };
    }

    const errCode = (err as { code?: string })?.code;
    const errMsg = (err as { message?: string })?.message || "";
    if (
      errCode === "P2034" ||
      errCode === "40001" ||
      errMsg.includes("could not serialize") ||
      errMsg.includes("write conflict")
    ) {
      return {
        success: false,
        error: "STALE_STATE",
        message:
          "Concurrent modification detected. Another administrator may have updated this registration.",
      };
    }

    if (err instanceof Error) {
      if (err.message === "NOT_FOUND") {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "Registration not found.",
        };
      }

      if (err.message.startsWith("INVALID_TRANSITION:")) {
        const fromStatus = err.message.split(":")[1];
        return {
          success: false,
          error: "INVALID_TRANSITION",
          message: `Cannot transition registration from ${fromStatus} to ${targetStatus}.`,
          currentStatus: fromStatus as registration_status,
        };
      }
    }

    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while updating registration status.",
    };
  }
}
