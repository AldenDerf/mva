import { prisma } from "@/lib/prisma";
import { AdminContext } from "@/lib/auth/admin";
import { Prisma, roster_status } from "@prisma/client";

export type PaymentAllocationErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "INVALID_PAYMENT_STATUS"
  | "NOT_LEGACY_PAYMENT"
  | "CROSS_REGISTRATION_MISMATCH"
  | "DUPLICATE_ACTIVE_ALLOCATION"
  | "PLAYER_OVER_CREDIT"
  | "PAYMENT_OVER_ALLOCATION"
  | "INVALID_AMOUNT"
  | "VALIDATION_ERROR"
  | "ALREADY_REVERSED"
  | "TRANSACTION_ERROR";

export interface AllocationTargetInput {
  registrationPlayerId: string;
  amount: number;
}

export interface AllocateLegacyPaymentParams {
  paymentId: string;
  allocations: AllocationTargetInput[];
  reconciliationNote: string;
}

export interface AllocationItemSummary {
  id: string;
  paymentId: string;
  registrationPlayerId: string;
  playerId: string;
  playerName: string;
  jerseyNumber: number | null;
  position: string | null;
  rosterStatus: roster_status;
  amount: number;
  reconciliationNote: string;
  allocatedByProfileId: string;
  allocatedByDisplayName: string | null;
  createdAt: Date;
  reversedAt: Date | null;
  reversedByProfileId: string | null;
  reversedByDisplayName: string | null;
  reversalReason: string | null;
}

export interface LegacyPaymentAllocationSummary {
  paymentId: string;
  registrationId: string;
  registrationCode: string;
  teamName: string;
  originalAmount: number;
  allocatedAmount: number;
  remainingUnallocated: number;
  isFullyAllocated: boolean;
  activeAllocations: AllocationItemSummary[];
  reversedAllocations: AllocationItemSummary[];
}

export interface AllocatePaymentSuccessResult {
  success: true;
  paymentId: string;
  allocatedTotal: number;
  remainingUnallocated: number;
  allocationIds: string[];
}

export interface AllocatePaymentFailureResult {
  success: false;
  error: PaymentAllocationErrorCode;
  message: string;
}

export type AllocatePaymentResult =
  | AllocatePaymentSuccessResult
  | AllocatePaymentFailureResult;

export interface ReverseAllocationParams {
  allocationId: string;
  reversalReason: string;
}

export interface ReverseAllocationSuccessResult {
  success: true;
  allocationId: string;
  reversedAmount: number;
  newRemainingUnallocated: number;
  auditLogId: string;
}

export interface ReverseAllocationFailureResult {
  success: false;
  error: PaymentAllocationErrorCode;
  message: string;
}

export type ReverseAllocationResult =
  | ReverseAllocationSuccessResult
  | ReverseAllocationFailureResult;

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
 * Returns a full summary of historical allocations for a specific legacy payment.
 */
export async function getLegacyPaymentAllocationSummary(
  paymentId: string
): Promise<LegacyPaymentAllocationSummary | null> {
  const payment = await prisma.payments.findUnique({
    where: { id: paymentId },
    include: {
      registrations: {
        include: {
          teams: { select: { team_name: true } },
        },
      },
      payment_allocations: {
        include: {
          registration_players: {
            include: {
              players: true,
            },
          },
          allocated_by_profile: {
            select: { display_name: true, email: true },
          },
          reversed_by_profile: {
            select: { display_name: true, email: true },
          },
        },
        orderBy: { created_at: "asc" },
      },
    },
  });

  if (!payment) return null;

  const originalAmount = Number(payment.amount);
  let allocatedAmount = 0;

  const activeAllocations: AllocationItemSummary[] = [];
  const reversedAllocations: AllocationItemSummary[] = [];

  for (const alloc of payment.payment_allocations) {
    const amt = Number(alloc.amount);
    const rp = alloc.registration_players;
    const p = rp.players;
    const playerName = formatFullName(
      p.first_name,
      p.middle_name,
      p.last_name,
      p.suffix
    );

    const item: AllocationItemSummary = {
      id: alloc.id,
      paymentId: alloc.payment_id,
      registrationPlayerId: alloc.registration_player_id,
      playerId: p.id,
      playerName,
      jerseyNumber: rp.jersey_number,
      position: rp.position,
      rosterStatus: rp.status,
      amount: amt,
      reconciliationNote: alloc.reconciliation_note,
      allocatedByProfileId: alloc.allocated_by_profile_id,
      allocatedByDisplayName:
        alloc.allocated_by_profile.display_name || alloc.allocated_by_profile.email,
      createdAt: alloc.created_at,
      reversedAt: alloc.reversed_at,
      reversedByProfileId: alloc.reversed_by_profile_id,
      reversedByDisplayName:
        alloc.reversed_by_profile?.display_name ||
        alloc.reversed_by_profile?.email ||
        null,
      reversalReason: alloc.reversal_reason,
    };

    if (alloc.reversed_at === null) {
      allocatedAmount += amt;
      activeAllocations.push(item);
    } else {
      reversedAllocations.push(item);
    }
  }

  const remainingUnallocated = Math.max(0, originalAmount - allocatedAmount);

  return {
    paymentId: payment.id,
    registrationId: payment.registration_id,
    registrationCode:
      payment.registrations.registration_code ||
      `REG-${payment.registration_id.slice(0, 8).toUpperCase()}`,
    teamName: payment.registrations.teams.team_name,
    originalAmount,
    allocatedAmount,
    remainingUnallocated,
    isFullyAllocated: remainingUnallocated <= 0,
    activeAllocations,
    reversedAllocations,
  };
}

/**
 * Authoritatively allocates a verified legacy payment across one or more roster members.
 *
 * SAFETY INVARIANTS:
 * 1. Admin authorization check.
 * 2. Payment eligibility: status === 'VERIFIED' AND registration_player_id === null.
 * 3. Amount > 0 for all allocation items.
 * 4. Same registration: all target roster members must belong to payment.registration_id.
 * 5. Player over-credit protection: target member's verified credit (direct + active allocations)
 *    cannot exceed category registration fee.
 * 6. Payment over-allocation protection: sum of existing active allocations + new allocations
 *    cannot exceed payment.amount.
 * 7. Active allocation uniqueness: duplicate active allocation for same player on same payment is rejected.
 * 8. Concurrency safety: executed inside interactive transaction with row locking.
 * 9. Non-destructive: creates new allocation rows, leaving payments table intact.
 * 10. Audit logging: writes structured PAYMENT_ALLOCATED log for each attribution.
 */
export async function allocateLegacyPayment(
  admin: AdminContext,
  params: AllocateLegacyPaymentParams
): Promise<AllocatePaymentResult> {
  // 1. Authorization guard
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "Active administrator credentials required.",
    };
  }

  // 2. Validate payload
  const trimmedNote = (params.reconciliationNote || "").trim();
  if (trimmedNote.length < 5) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A meaningful reconciliation note (minimum 5 characters) is required.",
    };
  }

  if (!Array.isArray(params.allocations) || params.allocations.length === 0) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "At least one player allocation must be selected.",
    };
  }

  for (const item of params.allocations) {
    if (typeof item.amount !== "number" || isNaN(item.amount) || item.amount <= 0) {
      return {
        success: false,
        error: "INVALID_AMOUNT",
        message: `Allocation amount must be greater than zero. Received: ${item.amount}`,
      };
    }
  }

  try {
    return await prisma.$transaction(
      async (tx) => {
        // Concurrency protection: Lock the parent payment row for update
        const lockedRows = await tx.$queryRaw<Array<{ id: string; status: string; registration_player_id: string | null; amount: string; registration_id: string }>>`
          SELECT id, status, registration_player_id, amount::text, registration_id
          FROM payments
          WHERE id = ${params.paymentId}::uuid
          FOR UPDATE;
        `;

        if (lockedRows.length === 0) {
          return {
            success: false,
            error: "NOT_FOUND",
            message: "Payment record not found.",
          };
        }

        const paymentRow = lockedRows[0];
        const paymentAmount = parseFloat(paymentRow.amount);

        // 3. Payment Eligibility: Must be VERIFIED and registration_player_id === null
        if (paymentRow.status !== "VERIFIED") {
          return {
            success: false,
            error: "INVALID_PAYMENT_STATUS",
            message: `Only VERIFIED payments are eligible for legacy reconciliation. Current payment status is "${paymentRow.status}".`,
          };
        }

        if (paymentRow.registration_player_id !== null) {
          return {
            success: false,
            error: "NOT_LEGACY_PAYMENT",
            message: "This payment is already directly linked to a specific player and cannot be allocated as a legacy payment.",
          };
        }

        // Get registration details including category registration fee
        const registration = await tx.registrations.findUniqueOrThrow({
          where: { id: paymentRow.registration_id },
          include: {
            teams: { select: { team_name: true } },
            league_categories_registrations_league_category_idToleague_categories: {
              select: { registration_fee: true },
            },
          },
        });

        const categoryFee = Number(
          registration.league_categories_registrations_league_category_idToleague_categories
            ?.registration_fee ?? 300
        );

        // Fetch existing active allocations for this payment
        const existingPaymentAllocations = await tx.payment_allocations.findMany({
          where: {
            payment_id: paymentRow.id,
            reversed_at: null,
          },
        });

        const currentAllocatedSum = existingPaymentAllocations.reduce(
          (sum, a) => sum + Number(a.amount),
          0
        );

        const newAllocationsSum = params.allocations.reduce(
          (sum, a) => sum + a.amount,
          0
        );

        // 4. Over-allocation Guard
        if (currentAllocatedSum + newAllocationsSum > paymentAmount + 0.001) {
          const maxRemaining = Math.max(0, paymentAmount - currentAllocatedSum);
          return {
            success: false,
            error: "PAYMENT_OVER_ALLOCATION",
            message: `Allocations exceed remaining payment amount. Remaining unallocated is ₱${maxRemaining.toFixed(
              2
            )}, but attempted to allocate ₱${newAllocationsSum.toFixed(2)}.`,
          };
        }

        // 5. Validate each target roster member
        const targetRpIds = params.allocations.map((a) => a.registrationPlayerId);

        // Check for duplicates within the submitted payload
        const uniqueTargetRpIds = new Set(targetRpIds);
        if (uniqueTargetRpIds.size !== targetRpIds.length) {
          return {
            success: false,
            error: "VALIDATION_ERROR",
            message: "Cannot specify duplicate allocations for the same player in a single request.",
          };
        }

        const targetRosterMembers = await tx.registration_players.findMany({
          where: { id: { in: targetRpIds } },
          include: {
            players: true,
            payments: {
              where: { status: "VERIFIED" },
            },
            payment_allocations: {
              where: {
                reversed_at: null,
                payments: { status: "VERIFIED" },
              },
            },
          },
        });

        if (targetRosterMembers.length !== targetRpIds.length) {
          return {
            success: false,
            error: "NOT_FOUND",
            message: "One or more selected roster members could not be found.",
          };
        }

        const createdAllocationIds: string[] = [];

        for (const item of params.allocations) {
          const rp = targetRosterMembers.find(
            (m) => m.id === item.registrationPlayerId
          )!;

          // Same registration check
          if (rp.registration_id !== paymentRow.registration_id) {
            return {
              success: false,
              error: "CROSS_REGISTRATION_MISMATCH",
              message: `Player "${formatFullName(
                rp.players.first_name,
                rp.players.middle_name,
                rp.players.last_name,
                rp.players.suffix
              )}" does not belong to this registration. Cross-team allocation is strictly prohibited.`,
            };
          }

          // Duplicate active allocation check on same payment
          const hasExistingActiveOnThisPayment = existingPaymentAllocations.some(
            (a) => a.registration_player_id === rp.id
          );
          if (hasExistingActiveOnThisPayment) {
            return {
              success: false,
              error: "DUPLICATE_ACTIVE_ALLOCATION",
              message: `Player "${formatFullName(
                rp.players.first_name,
                rp.players.middle_name,
                rp.players.last_name,
                rp.players.suffix
              )}" already has an active allocation from this payment. Reverse the existing allocation first if you need to adjust it.`,
            };
          }

          // Calculate existing verified credit for this player
          const directVerifiedCredit = rp.payments.reduce(
            (sum, p) => sum + Number(p.amount),
            0
          );
          const legacyAllocatedCredit = rp.payment_allocations.reduce(
            (sum, a) => sum + Number(a.amount),
            0
          );
          const totalExistingCredit = directVerifiedCredit + legacyAllocatedCredit;

          // Player Over-Credit Guard
          if (totalExistingCredit >= categoryFee - 0.001) {
            return {
              success: false,
              error: "PLAYER_OVER_CREDIT",
              message: `This player is already fully credited for this registration. (${formatFullName(
                rp.players.first_name,
                rp.players.middle_name,
                rp.players.last_name,
                rp.players.suffix
              )})`,
            };
          }

          if (totalExistingCredit + item.amount > categoryFee + 0.001) {
            const maxAllowed = Math.max(0, categoryFee - totalExistingCredit);
            return {
              success: false,
              error: "PLAYER_OVER_CREDIT",
              message: `Allocation of ₱${item.amount.toFixed(
                2
              )} exceeds remaining fee obligation for ${formatFullName(
                rp.players.first_name,
                rp.players.middle_name,
                rp.players.last_name,
                rp.players.suffix
              )}. Maximum additional credit allowed: ₱${maxAllowed.toFixed(2)}.`,
            };
          }

          // Create allocation record
          const createdAlloc = await tx.payment_allocations.create({
            data: {
              payment_id: paymentRow.id,
              registration_player_id: rp.id,
              amount: new Prisma.Decimal(item.amount),
              allocated_by_profile_id: admin.profileId,
              reconciliation_note: trimmedNote,
            },
          });

          createdAllocationIds.push(createdAlloc.id);

          // Write audit log
          await tx.admin_audit_logs.create({
            data: {
              admin_profile_id: admin.profileId,
              action: "PAYMENT_ALLOCATED",
              entity_type: "PAYMENT_ALLOCATION",
              entity_id: createdAlloc.id,
              metadata: {
                allocation_id: createdAlloc.id,
                payment_id: paymentRow.id,
                registration_id: paymentRow.registration_id,
                registration_player_id: rp.id,
                player_id: rp.player_id,
                player_name: formatFullName(
                  rp.players.first_name,
                  rp.players.middle_name,
                  rp.players.last_name,
                  rp.players.suffix
                ),
                roster_status: rp.status,
                amount: item.amount,
                payment_status: paymentRow.status,
                reconciliation_note: trimmedNote,
              },
            },
          });
        }

        const updatedAllocatedSum = currentAllocatedSum + newAllocationsSum;
        const remaining = Math.max(0, paymentAmount - updatedAllocatedSum);

        return {
          success: true,
          paymentId: paymentRow.id,
          allocatedTotal: updatedAllocatedSum,
          remainingUnallocated: remaining,
          allocationIds: createdAllocationIds,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        timeout: 15000,
      }
    );
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    if (errorMsg.includes("uq_payment_allocations_active_player")) {
      return {
        success: false,
        error: "DUPLICATE_ACTIVE_ALLOCATION",
        message: "An active allocation already exists for this player on this payment.",
      };
    }
    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: `Failed to allocate payment: ${errorMsg}`,
    };
  }
}

/**
 * Reverses an active legacy payment allocation.
 *
 * SAFETY INVARIANTS:
 * 1. Admin authorization check.
 * 2. Immutable history: does NOT delete the allocation row; sets reversed_at and reason.
 * 3. Idempotency: aborts if already reversed.
 * 4. Concurrency safety: interactive transaction with row lock.
 * 5. Audit logging: writes PAYMENT_ALLOCATION_REVERSED with reason and actor details.
 */
export async function reverseLegacyPaymentAllocation(
  admin: AdminContext,
  params: ReverseAllocationParams
): Promise<ReverseAllocationResult> {
  // 1. Authorization guard
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "Active administrator credentials required.",
    };
  }

  const trimmedReason = (params.reversalReason || "").trim();
  if (trimmedReason.length < 5) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A meaningful reversal reason (minimum 5 characters) is required.",
    };
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Find and lock the allocation
      const alloc = await tx.payment_allocations.findUnique({
        where: { id: params.allocationId },
        include: {
          payments: true,
          registration_players: {
            include: { players: true },
          },
        },
      });

      if (!alloc) {
        return {
          success: false,
          error: "NOT_FOUND",
          message: "Payment allocation record not found.",
        };
      }

      if (alloc.reversed_at !== null) {
        return {
          success: false,
          error: "ALREADY_REVERSED",
          message: "This allocation has already been reversed.",
        };
      }

      // Mark allocation as reversed
      const updatedAlloc = await tx.payment_allocations.update({
        where: { id: alloc.id },
        data: {
          reversed_at: new Date(),
          reversed_by_profile_id: admin.profileId,
          reversal_reason: trimmedReason,
        },
      });

      const playerName = formatFullName(
        alloc.registration_players.players.first_name,
        alloc.registration_players.players.middle_name,
        alloc.registration_players.players.last_name,
        alloc.registration_players.players.suffix
      );

      // Write audit log
      const auditLog = await tx.admin_audit_logs.create({
        data: {
          admin_profile_id: admin.profileId,
          action: "PAYMENT_ALLOCATION_REVERSED",
          entity_type: "PAYMENT_ALLOCATION",
          entity_id: alloc.id,
          metadata: {
            allocation_id: alloc.id,
            payment_id: alloc.payment_id,
            registration_id: alloc.payments.registration_id,
            registration_player_id: alloc.registration_player_id,
            player_id: alloc.registration_players.player_id,
            player_name: playerName,
            amount: Number(alloc.amount),
            reversal_reason: trimmedReason,
            original_reconciliation_note: alloc.reconciliation_note,
          },
        },
      });

      // Calculate new remaining unallocated on parent payment
      const activeAllocations = await tx.payment_allocations.findMany({
        where: {
          payment_id: alloc.payment_id,
          reversed_at: null,
        },
      });

      const activeSum = activeAllocations.reduce(
        (sum, a) => sum + Number(a.amount),
        0
      );
      const newRemaining = Math.max(0, Number(alloc.payments.amount) - activeSum);

      return {
        success: true,
        allocationId: updatedAlloc.id,
        reversedAmount: Number(alloc.amount),
        newRemainingUnallocated: newRemaining,
        auditLogId: auditLog.id,
      };
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: `Failed to reverse allocation: ${errorMsg}`,
    };
  }
}
