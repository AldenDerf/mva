"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  allocateLegacyPayment,
  reverseLegacyPaymentAllocation,
  AllocatePaymentResult,
  ReverseAllocationResult,
  AllocationTargetInput,
} from "@/lib/admin/payment-allocations";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AllocateLegacyPaymentActionInput {
  registrationId: string;
  paymentId: string;
  allocations: AllocationTargetInput[];
  reconciliationNote: string;
}

export interface ReverseLegacyPaymentAllocationActionInput {
  registrationId: string;
  allocationId: string;
  reversalReason: string;
}

/**
 * Server Action for allocating a verified legacy payment across one or more roster members.
 */
export async function allocateLegacyPaymentAction(
  input: AllocateLegacyPaymentActionInput
): Promise<AllocatePaymentResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid request payload.",
    };
  }

  const { registrationId, paymentId, allocations, reconciliationNote } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID format.",
    };
  }

  if (!paymentId || !UUID_REGEX.test(paymentId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid payment record ID format.",
    };
  }

  if (!allocations || !Array.isArray(allocations) || allocations.length === 0) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "At least one player allocation must be specified.",
    };
  }

  for (const alloc of allocations) {
    if (!alloc.registrationPlayerId || !UUID_REGEX.test(alloc.registrationPlayerId)) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Invalid registration player ID specified in allocations.",
      };
    }
    if (typeof alloc.amount !== "number" || isNaN(alloc.amount) || alloc.amount <= 0) {
      return {
        success: false,
        error: "INVALID_AMOUNT",
        message: "Allocation amount must be greater than zero.",
      };
    }
  }

  if (!reconciliationNote || !reconciliationNote.trim()) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A reconciliation note explaining the historical attribution is required.",
    };
  }

  const result = await allocateLegacyPayment(admin, {
    paymentId,
    allocations,
    reconciliationNote: reconciliationNote.trim(),
  });

  if (result.success) {
    revalidatePath(`/admin/registrations/${registrationId}`);
    revalidatePath("/admin/registrations");
    revalidatePath("/admin/payments");
    revalidatePath("/admin/dashboard");
  }

  return result;
}

/**
 * Server Action for reversing an active legacy payment allocation.
 */
export async function reverseLegacyPaymentAllocationAction(
  input: ReverseLegacyPaymentAllocationActionInput
): Promise<ReverseAllocationResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid request payload.",
    };
  }

  const { registrationId, allocationId, reversalReason } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID format.",
    };
  }

  if (!allocationId || !UUID_REGEX.test(allocationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid allocation record ID format.",
    };
  }

  if (!reversalReason || !reversalReason.trim()) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A reason for reversing this allocation is required.",
    };
  }

  const result = await reverseLegacyPaymentAllocation(admin, {
    allocationId,
    reversalReason: reversalReason.trim(),
  });

  if (result.success) {
    revalidatePath(`/admin/registrations/${registrationId}`);
    revalidatePath("/admin/registrations");
    revalidatePath("/admin/payments");
    revalidatePath("/admin/dashboard");
  }

  return result;
}
