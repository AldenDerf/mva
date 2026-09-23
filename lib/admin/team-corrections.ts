import { prisma } from "@/lib/prisma";
import { AdminContext } from "@/lib/auth/admin";

export type TeamCorrectionErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "DUPLICATE_NAME"
  | "NO_CHANGE"
  | "STALE_STATE"
  | "TRANSACTION_ERROR";

export interface CorrectTeamNameParams {
  teamId: string;
  teamName: string;
  expectedTeamName?: string;
  registrationId?: string;
}

export interface TeamCorrectionSuccess {
  success: true;
  teamId: string;
  teamName: string;
  slug: string;
  auditLogId: string;
}

export interface TeamCorrectionFailure {
  success: false;
  error: TeamCorrectionErrorCode;
  message: string;
}

export type TeamCorrectionResult =
  | TeamCorrectionSuccess
  | TeamCorrectionFailure;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * PHASE 05.7D.2: SAFE TEAM NAME CORRECTION SERVICE
 *
 * Atomically updates the display name of a team record.
 *
 * Guarantees & Invariants:
 * 1. Admin identity strictly validated via AdminContext.
 * 2. Target team by immutable UUID.
 * 3. STRICT SLUG PRESERVATION: Never modifies `teams.slug`, ensuring canonical public URLs (/teams/[slug])
 *    never break or change unexpectedly.
 * 4. Respects unique constraints on team_name (case-insensitive duplicate check).
 * 5. Re-reads current state inside transaction and detects stale state.
 * 6. Safely aborts with NO_CHANGE if the name is identical to the current database state.
 * 7. Writes an immutable audit log record (TEAM_PROFILE_UPDATED) in the SAME transaction.
 * 8. Never changes tournament/league registrations or financial state.
 */
export async function correctTeamName(
  admin: AdminContext,
  params: CorrectTeamNameParams
): Promise<TeamCorrectionResult> {
  // 1. Authorization Guard
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "You must have active administrator access to update team information.",
    };
  }

  const { teamId, teamName, expectedTeamName, registrationId } = params;

  // 2. Validate Team ID
  if (!teamId || !UUID_REGEX.test(teamId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid team record ID format.",
    };
  }

  // 3. Validate Team Name
  const trimmedName = typeof teamName === "string" ? teamName.trim() : "";
  if (!trimmedName) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Team name cannot be empty.",
    };
  }

  if (trimmedName.length > 150) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Team name cannot exceed 150 characters.",
    };
  }

  const normalizedExpected = expectedTeamName?.trim();

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step A: Re-read team record
      const currentTeam = await tx.teams.findUnique({
        where: { id: teamId },
      });

      if (!currentTeam) {
        throw new Error("NOT_FOUND: Team record does not exist.");
      }

      // Step B: Stale-State Check
      if (normalizedExpected && currentTeam.team_name.trim() !== normalizedExpected) {
        throw new Error(
          "STALE_STATE: This team name was updated by another administrator. Please refresh and review before trying again."
        );
      }

      // Step C: No-Op Check
      if (currentTeam.team_name.trim() === trimmedName) {
        throw new Error("NO_CHANGE: No changes detected in team name.");
      }

      // Step D: Uniqueness check against other teams (case-insensitive)
      const duplicateTeam = await tx.teams.findFirst({
        where: {
          team_name: {
            equals: trimmedName,
            mode: "insensitive",
          },
          NOT: {
            id: teamId,
          },
        },
        select: {
          id: true,
          team_name: true,
        },
      });

      if (duplicateTeam) {
        throw new Error(
          `DUPLICATE_NAME: A team named "${duplicateTeam.team_name}" already exists.`
        );
      }

      // Step E: Update team display name strictly preserving slug and ID
      const updatedTeam = await tx.teams.update({
        where: { id: teamId },
        data: {
          team_name: trimmedName,
          // CRITICAL: team.slug is deliberately preserved!
        },
      });

      // Step F: Write immutable audit log
      const auditLog = await tx.admin_audit_logs.create({
        data: {
          admin_profile_id: admin.profileId,
          action: "TEAM_PROFILE_UPDATED",
          entity_type: "TEAM",
          entity_id: teamId,
          metadata: {
            team_id: teamId,
            registration_id: registrationId || null,
            before: {
              team_name: currentTeam.team_name,
            },
            after: {
              team_name: updatedTeam.team_name,
            },
            actor_name: admin.displayName,
            actor_email: admin.email,
          },
        },
      });

      return {
        teamId: updatedTeam.id,
        teamName: updatedTeam.team_name,
        slug: updatedTeam.slug,
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
          message: error.message.replace(/^NOT_FOUND:\s*/, ""),
        };
      }

      if (error.message.startsWith("STALE_STATE")) {
        return {
          success: false,
          error: "STALE_STATE",
          message: error.message.replace(/^STALE_STATE:\s*/, ""),
        };
      }

      if (error.message.startsWith("NO_CHANGE")) {
        return {
          success: false,
          error: "NO_CHANGE",
          message: error.message.replace(/^NO_CHANGE:\s*/, ""),
        };
      }

      if (error.message.startsWith("DUPLICATE_NAME")) {
        return {
          success: false,
          error: "DUPLICATE_NAME",
          message: error.message.replace(/^DUPLICATE_NAME:\s*/, ""),
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
      message: "An unexpected error occurred while updating team name.",
    };
  }
}
