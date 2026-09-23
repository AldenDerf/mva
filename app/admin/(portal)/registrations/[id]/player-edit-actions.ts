"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  correctPlayerAndRosterDetails,
  PlayerCorrectionResult,
} from "@/lib/admin/player-corrections";

export interface UpdatePlayerDetailsActionInput {
  registrationId: string;
  registrationPlayerId: string;
  playerId: string;
  teamSlug?: string;

  // Personal Information
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  contactNumber?: string | null;
  dateOfBirth?: string | null;

  // Roster Information
  jerseyNumber?: number | null;
  position?: string | null;
  isCaptain?: boolean;
}

/**
 * Server Action for safe administrative player personal and roster corrections.
 *
 * Enforces:
 * 1. Admin authorization check via requireAdmin().
 * 2. Domain mutation service execution within interactive transaction with audit logs.
 * 3. Scoped Next.js cache revalidation across admin views and public team views.
 */
export async function updatePlayerDetailsAction(
  input: UpdatePlayerDetailsActionInput
): Promise<PlayerCorrectionResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid correction request payload.",
    };
  }

  const result = await correctPlayerAndRosterDetails(admin, {
    registrationId: input.registrationId,
    registrationPlayerId: input.registrationPlayerId,
    playerId: input.playerId,
    firstName: input.firstName,
    middleName: input.middleName,
    lastName: input.lastName,
    suffix: input.suffix,
    contactNumber: input.contactNumber,
    dateOfBirth: input.dateOfBirth,
    jerseyNumber: input.jerseyNumber,
    position: input.position,
    isCaptain: input.isCaptain,
  });

  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath(`/admin/registrations/${input.registrationId}`);
    revalidatePath("/teams");
    if (input.teamSlug) {
      revalidatePath(`/teams/${input.teamSlug}`);
    }
  }

  return result;
}
