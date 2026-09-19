"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  mutateRegistrationStatus,
  AdminRegistrationAction,
  MutationResult,
} from "@/lib/admin/registration-mutations";
import { registration_status } from "@prisma/client";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const VALID_ACTIONS: AdminRegistrationAction[] = ["VERIFY", "REJECT", "CANCEL"];
const VALID_STATUSES: registration_status[] = [
  "PENDING_PAYMENT",
  "VERIFIED",
  "REJECTED",
  "CANCELLED",
];

export interface UpdateRegistrationStatusInput {
  registrationId: string;
  action: AdminRegistrationAction;
  expectedStatus?: registration_status;
  reason?: string | null;
}

/**
 * Server Action for administrative registration status transitions.
 * 
 * Enforces:
 * 1. Strict server-side authorization check via requireAdmin().
 * 2. Strict input validation (UUID format, action whitelist, status whitelist, reason sanitization).
 * 3. Domain mutation service execution with transactional audit logging.
 * 4. Next.js cache revalidation for dashboard, list, and detail views.
 */
export async function updateRegistrationStatusAction(
  input: UpdateRegistrationStatusInput
): Promise<MutationResult> {
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

  const { registrationId, action, expectedStatus, reason } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID format.",
    };
  }

  if (!VALID_ACTIONS.includes(action)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration mutation action.",
    };
  }

  if (expectedStatus && !VALID_STATUSES.includes(expectedStatus)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid expected registration status.",
    };
  }

  // Sanitize reason (max 1000 characters)
  let sanitizedReason: string | null = null;
  if (typeof reason === "string") {
    sanitizedReason = reason.trim().slice(0, 1000);
  }

  if ((action === "REJECT" || action === "CANCEL") && (!sanitizedReason || sanitizedReason.length === 0)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: `A reason is strictly required when performing ${action.toLowerCase()}.`,
    };
  }

  // 3. Execute domain mutation service
  const result = await mutateRegistrationStatus(admin, {
    registrationId,
    action,
    expectedStatus,
    reason: sanitizedReason,
  });

  // 4. Revalidate cache on success
  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath(`/admin/registrations/${registrationId}`);
  }

  return result;
}
