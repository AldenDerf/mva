"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  correctPaymentDetails,
  PaymentCorrectionResult,
} from "@/lib/admin/payment-corrections";
import { payment_method } from "@prisma/client";

export interface CorrectPaymentDetailsActionInput {
  paymentId: string;
  paymentMethod: payment_method;
  referenceNumber?: string | null;
  expectedPaymentMethod: payment_method;
  expectedReferenceNumber?: string | null;
  reason: string;
  registrationId?: string;
}

/**
 * Server Action for administrative payment details correction.
 *
 * Enforces:
 * 1. Admin identity strictly from requireAdmin().
 * 2. Server-side validation and execution via correctPaymentDetails().
 * 3. Cache revalidation across /admin/payments, /admin/registrations, and the relevant registration detail.
 * 4. Structured return states (SUCCESS, VALIDATION_ERROR, NOT_FOUND, STALE_STATE, NO_CHANGE).
 */
export async function correctPaymentDetailsAction(
  input: CorrectPaymentDetailsActionInput
): Promise<PaymentCorrectionResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid correction request payload.",
    };
  }

  const result = await correctPaymentDetails(admin, {
    paymentId: input.paymentId,
    paymentMethod: input.paymentMethod,
    referenceNumber: input.referenceNumber,
    expectedPaymentMethod: input.expectedPaymentMethod,
    expectedReferenceNumber: input.expectedReferenceNumber,
    reason: input.reason,
  });

  if (result.success) {
    revalidatePath("/admin/payments");
    revalidatePath("/admin/registrations");
    revalidatePath("/admin");
    if (input.registrationId) {
      revalidatePath(`/admin/registrations/${input.registrationId}`);
    }
  }

  return result;
}
