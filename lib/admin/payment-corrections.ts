import { prisma } from "@/lib/prisma";
import { payment_method } from "@prisma/client";
import { AdminContext } from "@/lib/auth/admin";

export type PaymentCorrectionErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "STALE_STATE"
  | "NO_CHANGE"
  | "VALIDATION_ERROR"
  | "TRANSACTION_ERROR";

export interface CorrectPaymentDetailsParams {
  paymentId: string;
  paymentMethod: payment_method;
  referenceNumber?: string | null;
  expectedPaymentMethod: payment_method;
  expectedReferenceNumber?: string | null;
  reason: string;
}

export interface PaymentCorrectionSuccess {
  success: true;
  paymentId: string;
  paymentMethod: payment_method;
  referenceNumber: string | null;
  auditLogId: string;
}

export interface PaymentCorrectionFailure {
  success: false;
  error: PaymentCorrectionErrorCode;
  message: string;
}

export type PaymentCorrectionResult =
  | PaymentCorrectionSuccess
  | PaymentCorrectionFailure;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_PAYMENT_METHODS: payment_method[] = [
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "OTHER",
];

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
 * PHASE 05.7B: DEDICATED PAYMENT CORRECTION SERVICE
 *
 * Atomically corrects the payment method and/or reference number of an existing payment record.
 *
 * Invariants & Guarantees:
 * 1. Derives admin identity strictly from verified AdminContext.
 * 2. Updates the EXISTING payment record; NEVER creates a new payment row.
 * 3. Restricts mutable business fields strictly to: payment_method and reference_number.
 * 4. Strictly protects immutable fields: id, registration_id, registration_player_id, amount,
 *    status, created_at, verified_at, verified_by_profile_id, and team registration status.
 * 5. Enforces concurrency / stale-state protection: aborts without mutation or audit log if
 *    current database state differs from expectedPaymentMethod or expectedReferenceNumber.
 * 6. Enforces no-op protection: if normalized values are identical to current database values,
 *    aborts with NO_CHANGE without updating or writing an audit log.
 * 7. Enforces non-empty reason policy (minimum 5 meaningful characters) across ALL payment statuses.
 * 8. Writes exactly one immutable admin_audit_logs entry with action = "PAYMENT_DETAILS_CORRECTED".
 */
export async function correctPaymentDetails(
  admin: AdminContext,
  params: CorrectPaymentDetailsParams
): Promise<PaymentCorrectionResult> {
  // 1. Authorization Guard
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "You must have active administrator access to correct payment details.",
    };
  }

  const {
    paymentId,
    paymentMethod,
    referenceNumber,
    expectedPaymentMethod,
    expectedReferenceNumber,
    reason,
  } = params;

  // 2. Validate Payment ID format
  if (!paymentId || !UUID_REGEX.test(paymentId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid payment record ID format.",
    };
  }

  // 3. Validate Payment Methods
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `Invalid payment method "${paymentMethod}". Allowed: ${VALID_PAYMENT_METHODS.join(", ")}.`,
    };
  }

  if (!VALID_PAYMENT_METHODS.includes(expectedPaymentMethod)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `Invalid expected payment method "${expectedPaymentMethod}".`,
    };
  }

  // 4. Normalize & Validate Reference Number
  const normalizedNewRef = referenceNumber?.trim() || null;
  if (normalizedNewRef && normalizedNewRef.length > 100) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Reference number cannot exceed 100 characters.",
    };
  }

  // 5. Validate Reason (Required for ALL statuses, trimmed, min 5 chars)
  const trimmedReason = reason?.trim() || "";
  if (trimmedReason.length < 5) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A meaningful correction reason (minimum 5 characters) is required.",
    };
  }

  // Normalize expected reference number
  const normalizedExpectedRef = expectedReferenceNumber?.trim() || null;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step A: Re-read the payment record with joined registration and player details
      const currentPayment = await tx.payments.findUnique({
        where: { id: paymentId },
        include: {
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
          registration_players: {
            include: {
              players: true,
            },
          },
        },
      });

      if (!currentPayment) {
        throw new Error("NOT_FOUND: Payment record does not exist.");
      }

      // Step B: Concurrency / Stale-State Check
      const currentDbRef = currentPayment.reference_number?.trim() || null;
      if (
        currentPayment.payment_method !== expectedPaymentMethod ||
        currentDbRef !== normalizedExpectedRef
      ) {
        throw new Error(
          "STALE_STATE: This payment was updated by another administrator. Refresh and review the latest details before trying again."
        );
      }

      // Step C: No-Op Check (values identical to current database values)
      if (
        currentPayment.payment_method === paymentMethod &&
        currentDbRef === normalizedNewRef
      ) {
        throw new Error(
          "NO_CHANGE: No changes detected in payment method or reference number."
        );
      }

      // Step D: Execute narrow update on EXISTING payment (NEVER create new row)
      const updatedPayment = await tx.payments.update({
        where: { id: paymentId },
        data: {
          payment_method: paymentMethod,
          reference_number: normalizedNewRef,
        },
      });

      // Step E: Construct audit log metadata
      let playerName = "Legacy / Unallocated Payment";
      let playerId: string | null = null;

      if (currentPayment.registration_players?.players) {
        const p = currentPayment.registration_players.players;
        playerId = p.id;
        playerName = formatFullName(
          p.first_name,
          p.middle_name,
          p.last_name,
          p.suffix
        );
      }

      const auditLog = await tx.admin_audit_logs.create({
        data: {
          admin_profile_id: admin.profileId,
          action: "PAYMENT_DETAILS_CORRECTED",
          entity_type: "PAYMENT",
          entity_id: currentPayment.id,
          metadata: {
            payment_id: currentPayment.id,
            registration_id: currentPayment.registration_id,
            registration_code: currentPayment.registrations.registration_code,
            registration_player_id: currentPayment.registration_player_id,
            player_id: playerId,
            player_name: playerName,
            team_id: currentPayment.registrations.teams.id,
            team_name: currentPayment.registrations.teams.team_name,
            amount: Number(currentPayment.amount),
            payment_status: currentPayment.status,
            before: {
              payment_method: currentPayment.payment_method,
              reference_number: currentPayment.reference_number,
            },
            after: {
              payment_method: updatedPayment.payment_method,
              reference_number: updatedPayment.reference_number,
            },
            reason: trimmedReason,
            actor_name: admin.displayName,
            actor_email: admin.email,
          },
        },
      });

      return {
        paymentId: updatedPayment.id,
        paymentMethod: updatedPayment.payment_method,
        referenceNumber: updatedPayment.reference_number,
        auditLogId: auditLog.id,
      };
    });

    return {
      success: true,
      ...result,
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      if (error.message.startsWith("NOT_FOUND")) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "The requested payment record was not found.",
        };
      }

      if (error.message.startsWith("STALE_STATE")) {
        return {
          success: false,
          error: "STALE_STATE",
          message:
            "This payment was updated by another administrator. Refresh and review the latest details before trying again.",
        };
      }

      if (error.message.startsWith("NO_CHANGE")) {
        return {
          success: false,
          error: "NO_CHANGE",
          message:
            "No changes detected in payment method or reference number.",
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
      message: "An unexpected error occurred while updating payment details.",
    };
  }
}
