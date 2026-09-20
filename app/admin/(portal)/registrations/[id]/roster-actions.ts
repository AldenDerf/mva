"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  addPlayerToRoster,
  AddPlayerResult,
} from "@/lib/admin/roster-mutations";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface AddPlayerActionInput {
  registrationId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  jerseyNumber?: number | null;
  position?: string | null;
  isCaptain?: boolean;
}

/**
 * Server Action for an administrator to add an individual player directly to a VERIFIED team roster.
 * 
 * Enforces:
 * 1. Strict server-side authorization check via requireAdmin().
 * 2. Strict input validation.
 * 3. Domain mutation service execution with transactional audit logging and ₱300 PENDING payment creation.
 * 4. Next.js cache revalidation for dashboard, list, and detail views.
 */
export async function addPlayerToRosterAction(
  input: AddPlayerActionInput
): Promise<AddPlayerResult> {
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
    firstName,
    middleName,
    lastName,
    suffix,
    jerseyNumber,
    position,
    isCaptain,
  } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID format.",
    };
  }

  const trimmedFirst = typeof firstName === "string" ? firstName.trim() : "";
  if (!trimmedFirst) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "First name is required.",
    };
  }

  const trimmedLast = typeof lastName === "string" ? lastName.trim() : "";
  if (!trimmedLast) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Last name is required.",
    };
  }

  let parsedJersey: number | null = null;
  if (
    jerseyNumber !== undefined &&
    jerseyNumber !== null &&
    String(jerseyNumber).trim() !== ""
  ) {
    const num = Number(jerseyNumber);
    if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 99) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Jersey number must be a whole number between 0 and 99.",
      };
    }
    parsedJersey = num;
  }

  // 3. Execute domain mutation service
  const result = await addPlayerToRoster(admin, {
    registrationId,
    firstName: trimmedFirst,
    middleName: typeof middleName === "string" ? middleName.trim() : null,
    lastName: trimmedLast,
    suffix: typeof suffix === "string" ? suffix.trim() : null,
    jerseyNumber: parsedJersey,
    position: typeof position === "string" ? position.trim() : null,
    isCaptain: Boolean(isCaptain),
  });

  // 4. Revalidate cache on success
  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath(`/admin/registrations/${registrationId}`);
  }

  return result;
}
