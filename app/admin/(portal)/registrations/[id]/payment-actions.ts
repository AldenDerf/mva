"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  mutatePlayerPaymentStatus,
  AdminPlayerPaymentAction,
  PlayerPaymentMutationResult,
} from "@/lib/admin/player-payment-mutations";
import { payment_status, payment_method } from "@prisma/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_ACTIONS: AdminPlayerPaymentAction[] = ["VERIFY", "REJECT", "REFUND"];
const VALID_PAYMENT_METHODS: payment_method[] = [
  "CASH",
  "GCASH",
  "BANK_TRANSFER",
  "OTHER",
];

export interface UpdatePlayerPaymentInput {
  registrationId: string;
  registrationPlayerId: string;
  paymentId?: string;
  action: AdminPlayerPaymentAction;
  expectedStatus?: payment_status;
  paymentMethod?: payment_method;
  referenceNumber?: string | null;
  reason?: string | null;
  notes?: string | null;
}

/**
 * Server Action for per-player payment status transitions.
 * 
 * Enforces:
 * 1. Strict server-side authorization check via requireAdmin().
 * 2. Strict input validation (UUID format, action whitelist, payment method whitelist).
 * 3. Domain mutation service execution with transactional audit logging.
 * 4. Next.js cache revalidation for dashboard, list, and detail views.
 */
export async function updatePlayerPaymentAction(
  input: UpdatePlayerPaymentInput
): Promise<PlayerPaymentMutationResult> {
  // 1. Enforce admin authorization boundary
  const admin = await requireAdmin();

  // 2. Validate input parameters
  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid request payload.",
    };
  }

  const {
    registrationId,
    registrationPlayerId,
    paymentId,
    action,
    expectedStatus,
    paymentMethod,
    referenceNumber,
    reason,
    notes,
  } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID format.",
    };
  }

  if (!registrationPlayerId || !UUID_REGEX.test(registrationPlayerId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration player ID format.",
    };
  }

  if (paymentId && !UUID_REGEX.test(paymentId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid payment record ID format.",
    };
  }

  if (!VALID_ACTIONS.includes(action)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid player payment mutation action.",
    };
  }

  if (paymentMethod && !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid payment method specified.",
    };
  }

  // Sanitize reason and notes (max 1000 characters)
  const sanitizedReason = typeof reason === "string" ? reason.trim().slice(0, 1000) : null;
  const sanitizedNotes = typeof notes === "string" ? notes.trim().slice(0, 1000) : null;

  if (
    (action === "REJECT" || action === "REFUND") &&
    (!sanitizedReason || sanitizedReason.length === 0)
  ) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `A reason is strictly required when performing payment ${action.toLowerCase()}.`,
    };
  }

  // 3. Execute domain mutation service
  const result = await mutatePlayerPaymentStatus(admin, {
    registrationPlayerId,
    paymentId,
    action,
    expectedStatus,
    paymentMethod,
    referenceNumber: referenceNumber ? referenceNumber.trim().slice(0, 100) : null,
    reason: sanitizedReason,
    notes: sanitizedNotes,
  });

  // 4. Revalidate cache on success
  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath(`/admin/registrations/${registrationId}`);
  }

  return result;
}
