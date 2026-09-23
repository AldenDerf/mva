"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import {
  correctTeamName,
  TeamCorrectionResult,
} from "@/lib/admin/team-corrections";

export interface UpdateTeamNameActionInput {
  teamId: string;
  teamName: string;
  expectedTeamName?: string;
  registrationId?: string;
}

/**
 * Server Action for safe administrative team display name corrections.
 *
 * Enforces:
 * 1. Admin authorization check via requireAdmin().
 * 2. Domain mutation service execution within interactive transaction with audit logs.
 * 3. Scoped Next.js cache revalidation across admin and public views.
 */
export async function updateTeamNameAction(
  input: UpdateTeamNameActionInput
): Promise<TeamCorrectionResult> {
  const admin = await requireAdmin();

  if (!input || typeof input !== "object") {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid team correction request payload.",
    };
  }

  const result = await correctTeamName(admin, {
    teamId: input.teamId,
    teamName: input.teamName,
    expectedTeamName: input.expectedTeamName,
    registrationId: input.registrationId,
  });

  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath("/admin/payments");
    if (input.registrationId) {
      revalidatePath(`/admin/registrations/${input.registrationId}`);
    }
    revalidatePath("/teams");
    if (result.slug) {
      revalidatePath(`/teams/${result.slug}`);
    }
  }

  return result;
}
