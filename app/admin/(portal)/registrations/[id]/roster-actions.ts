"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  addPlayerToRoster,
  AddPlayerResult,
} from "@/lib/admin/roster-mutations";
import {
  executeUnverifiedRosterMemberHardDelete,
  executeRosterMemberSoftRemoval,
  executeRosterMemberRestore,
  UnverifiedRosterMemberDeleteResult,
  RosterMemberSoftRemoveResult,
  RosterMemberRestoreResult,
} from "@/lib/admin/roster-safety";

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
    revalidatePath("/teams");
  }

  return result;
}

function revalidateRosterPaths(registrationId: string, teamSlug?: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/registrations");
  revalidatePath(`/admin/registrations/${registrationId}`);
  revalidatePath("/teams");
  if (teamSlug && typeof teamSlug === "string" && teamSlug.trim()) {
    revalidatePath(`/teams/${teamSlug.trim()}`);
  }
}

export interface DeleteRosterMemberActionInput {
  registrationId: string;
  registrationPlayerId: string;
  reason: string;
  teamSlug?: string;
}

/**
 * Server action to hard-delete an unverified player from a registration roster.
 * Strictly blocked if any verified payment exists.
 */
export async function deleteRosterMemberAction(
  input: DeleteRosterMemberActionInput
): Promise<UnverifiedRosterMemberDeleteResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid delete request payload.",
    };
  }

  const { registrationId, registrationPlayerId, reason, teamSlug } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID.",
    };
  }

  if (!registrationPlayerId || !UUID_REGEX.test(registrationPlayerId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid roster player ID.",
    };
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A reason is strictly required to delete a player from the roster.",
    };
  }

  const result = await executeUnverifiedRosterMemberHardDelete(admin, {
    registrationId,
    registrationPlayerId,
    reason: trimmedReason,
  });

  if (result.success) {
    revalidateRosterPaths(registrationId, teamSlug);
  }

  return result;
}

export interface RemoveRosterMemberActionInput {
  registrationId: string;
  registrationPlayerId: string;
  reason: string;
  teamSlug?: string;
}

/**
 * Server action to transition a verified player to REMOVED status.
 * Preserves payment and audit history while hiding the player from active roster.
 */
export async function removeRosterMemberAction(
  input: RemoveRosterMemberActionInput
): Promise<RosterMemberSoftRemoveResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid remove request payload.",
    };
  }

  const { registrationId, registrationPlayerId, reason, teamSlug } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID.",
    };
  }

  if (!registrationPlayerId || !UUID_REGEX.test(registrationPlayerId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid roster player ID.",
    };
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  if (!trimmedReason) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "A reason is strictly required to remove a player from the roster.",
    };
  }

  const result = await executeRosterMemberSoftRemoval(admin, {
    registrationId,
    registrationPlayerId,
    reason: trimmedReason,
  });

  if (result.success) {
    revalidateRosterPaths(registrationId, teamSlug);
  }

  return result;
}

export interface RestoreRosterMemberActionInput {
  registrationId: string;
  registrationPlayerId: string;
  reason?: string;
  teamSlug?: string;
}

/**
 * Server action to restore a REMOVED player back to ACTIVE status.
 * Re-incorporates existing verified payments into canonical accounting.
 */
export async function restoreRosterMemberAction(
  input: RestoreRosterMemberActionInput
): Promise<RosterMemberRestoreResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid restore request payload.",
    };
  }

  const { registrationId, registrationPlayerId, reason, teamSlug } = input;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID.",
    };
  }

  if (!registrationPlayerId || !UUID_REGEX.test(registrationPlayerId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid roster player ID.",
    };
  }

  const result = await executeRosterMemberRestore(admin, {
    registrationId,
    registrationPlayerId,
    reason: typeof reason === "string" ? reason.trim() : undefined,
  });

  if (result.success) {
    revalidateRosterPaths(registrationId, teamSlug);
  }

  return result;
}
