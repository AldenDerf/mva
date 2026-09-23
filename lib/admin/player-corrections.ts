import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AdminContext } from "@/lib/auth/admin";

export type PlayerCorrectionErrorCode =
  | "UNAUTHORIZED"
  | "NOT_FOUND"
  | "VALIDATION_ERROR"
  | "NO_CHANGE"
  | "STALE_STATE"
  | "TRANSACTION_ERROR";

export interface CorrectPlayerAndRosterParams {
  registrationId: string;
  registrationPlayerId: string;
  playerId: string;

  // Personal Information (players table)
  firstName?: string;
  middleName?: string | null;
  lastName?: string;
  suffix?: string | null;
  contactNumber?: string | null;
  dateOfBirth?: Date | string | null;

  // Tournament Roster Information (registration_players table)
  jerseyNumber?: number | null;
  position?: string | null;
  isCaptain?: boolean;
}

export interface PlayerCorrectionSuccess {
  success: true;
  playerId: string;
  registrationPlayerId: string;
  fullName: string;
  changedPersonalFields: string[];
  changedRosterFields: string[];
  playerAuditLogId?: string;
  rosterAuditLogId?: string;
}

export interface PlayerCorrectionFailure {
  success: false;
  error: PlayerCorrectionErrorCode;
  message: string;
}

export type PlayerCorrectionResult =
  | PlayerCorrectionSuccess
  | PlayerCorrectionFailure;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
 * PHASE 05.7D.2: SAFE PLAYER & ROSTER METADATA CORRECTION SERVICE
 *
 * Atomically updates player personal information (players) and/or tournament roster
 * metadata (registration_players) within a single interactive transaction.
 *
 * Guarantees & Invariants:
 * 1. Admin identity strictly validated via AdminContext.
 * 2. Strict ID preservation: never changes players.id, registration_players.id, or registration_id.
 * 3. Never touches payment records, fee calculations, payment statuses, or team balances.
 * 4. Accounting invariants mathematically preserved (roster count, balances, paid counts untouched).
 * 5. Re-reads current state inside transaction; guards against stale or mismatched records.
 * 6. Captaincy transfer: atomically unsets previous captain on the same roster if newly designated.
 * 7. Writes comprehensive immutable audit logs for personal and/or roster changes in the SAME transaction.
 * 8. Never merges or deduplicates player profiles based on name similarity.
 * 9. Partial updates supported: undefined fields are preserved without mutation or clearing.
 */
export async function correctPlayerAndRosterDetails(
  admin: AdminContext,
  params: CorrectPlayerAndRosterParams
): Promise<PlayerCorrectionResult> {
  // 1. Authorization Guard
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "You must have active administrator access to update player details.",
    };
  }

  const {
    registrationId,
    registrationPlayerId,
    playerId,
    firstName,
    middleName,
    lastName,
    suffix,
    contactNumber,
    dateOfBirth,
    jerseyNumber,
    position,
    isCaptain,
  } = params;

  // 2. Validate IDs
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
      message: "Invalid roster player ID format.",
    };
  }

  if (!playerId || !UUID_REGEX.test(playerId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid player ID format.",
    };
  }

  // 3. Validate Personal Fields if provided
  let trimmedFirst: string | undefined;
  if (firstName !== undefined) {
    trimmedFirst = typeof firstName === "string" ? firstName.trim() : "";
    if (!trimmedFirst) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "First name cannot be empty.",
      };
    }
    if (trimmedFirst.length > 100) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "First name cannot exceed 100 characters.",
      };
    }
  }

  let trimmedLast: string | undefined;
  if (lastName !== undefined) {
    trimmedLast = typeof lastName === "string" ? lastName.trim() : "";
    if (!trimmedLast) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Last name cannot be empty.",
      };
    }
    if (trimmedLast.length > 100) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Last name cannot exceed 100 characters.",
      };
    }
  }

  const trimmedMiddle =
    middleName !== undefined
      ? typeof middleName === "string" && middleName.trim() !== ""
        ? middleName.trim().slice(0, 100)
        : null
      : undefined;

  const trimmedSuffix =
    suffix !== undefined
      ? typeof suffix === "string" && suffix.trim() !== ""
        ? suffix.trim().slice(0, 20)
        : null
      : undefined;

  const trimmedContact =
    contactNumber !== undefined
      ? typeof contactNumber === "string" && contactNumber.trim() !== ""
        ? contactNumber.trim().slice(0, 30)
        : null
      : undefined;

  let parsedDob: Date | null | undefined;
  if (dateOfBirth !== undefined) {
    if (dateOfBirth === null || String(dateOfBirth).trim() === "") {
      parsedDob = null;
    } else {
      let resolvedDate: Date | null = null;
      if (typeof dateOfBirth === "string") {
        const str = dateOfBirth.trim();
        const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) {
          resolvedDate = new Date(
            Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
          );
        } else {
          const d = new Date(str);
          if (!isNaN(d.getTime())) {
            resolvedDate = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
            );
          }
        }
      } else if (dateOfBirth instanceof Date && !isNaN(dateOfBirth.getTime())) {
        resolvedDate = new Date(
          Date.UTC(
            dateOfBirth.getUTCFullYear(),
            dateOfBirth.getUTCMonth(),
            dateOfBirth.getUTCDate()
          )
        );
      }

      if (!resolvedDate || isNaN(resolvedDate.getTime())) {
        return {
          success: false,
          error: "VALIDATION_ERROR",
          message: "Invalid date of birth provided.",
        };
      }
      if (resolvedDate > new Date()) {
        return {
          success: false,
          error: "VALIDATION_ERROR",
          message: "Date of birth cannot be in the future.",
        };
      }
      parsedDob = resolvedDate;
    }
  }

  // 4. Validate Roster Fields if provided
  let parsedJersey: number | null | undefined;
  if (jerseyNumber !== undefined) {
    if (jerseyNumber === null || String(jerseyNumber).trim() === "") {
      parsedJersey = null;
    } else {
      const num = Number(jerseyNumber);
      if (!Number.isInteger(num) || num < 0 || num > 99) {
        return {
          success: false,
          error: "VALIDATION_ERROR",
          message: "Jersey number must be a whole number between 0 and 99.",
        };
      }
      parsedJersey = num;
    }
  }

  const trimmedPosition =
    position !== undefined
      ? typeof position === "string" && position.trim() !== ""
        ? position.trim().slice(0, 50)
        : null
      : undefined;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Step A: Re-read the registration_player record with player and registration relations
      const currentRp = await tx.registration_players.findUnique({
        where: { id: registrationPlayerId },
        include: {
          players: true,
          registrations: {
            include: {
              teams: {
                select: {
                  id: true,
                  team_name: true,
                },
              },
            },
          },
        },
      });

      if (!currentRp) {
        throw new Error("NOT_FOUND: Roster player record does not exist.");
      }

      if (currentRp.registration_id !== registrationId) {
        throw new Error(
          "STALE_STATE: Roster player does not belong to the specified registration."
        );
      }

      if (currentRp.player_id !== playerId) {
        throw new Error(
          "STALE_STATE: Player profile mismatch on roster record."
        );
      }

      const currentPlayer = currentRp.players;
      if (!currentPlayer) {
        throw new Error("NOT_FOUND: Linked player profile does not exist.");
      }

      // Step B: Determine Personal Field Changes
      const changedPersonalFields: string[] = [];
      const beforePersonal: Record<string, string | number | boolean | null> = {};
      const afterPersonal: Record<string, string | number | boolean | null> = {};
      const playerUpdateData: Prisma.playersUpdateInput = {};

      if (trimmedFirst !== undefined && currentPlayer.first_name !== trimmedFirst) {
        changedPersonalFields.push("first_name");
        beforePersonal.first_name = currentPlayer.first_name;
        afterPersonal.first_name = trimmedFirst;
        playerUpdateData.first_name = trimmedFirst;
      }

      if (
        trimmedMiddle !== undefined &&
        (currentPlayer.middle_name || null) !== trimmedMiddle
      ) {
        changedPersonalFields.push("middle_name");
        beforePersonal.middle_name = currentPlayer.middle_name;
        afterPersonal.middle_name = trimmedMiddle;
        playerUpdateData.middle_name = trimmedMiddle;
      }

      if (trimmedLast !== undefined && currentPlayer.last_name !== trimmedLast) {
        changedPersonalFields.push("last_name");
        beforePersonal.last_name = currentPlayer.last_name;
        afterPersonal.last_name = trimmedLast;
        playerUpdateData.last_name = trimmedLast;
      }

      if (
        trimmedSuffix !== undefined &&
        (currentPlayer.suffix || null) !== trimmedSuffix
      ) {
        changedPersonalFields.push("suffix");
        beforePersonal.suffix = currentPlayer.suffix;
        afterPersonal.suffix = trimmedSuffix;
        playerUpdateData.suffix = trimmedSuffix;
      }

      if (
        trimmedContact !== undefined &&
        (currentPlayer.contact_number || null) !== trimmedContact
      ) {
        changedPersonalFields.push("contact_number");
        beforePersonal.contact_number = currentPlayer.contact_number;
        afterPersonal.contact_number = trimmedContact;
        playerUpdateData.contact_number = trimmedContact;
      }

      if (parsedDob !== undefined) {
        const currentDobIso = currentPlayer.date_of_birth
          ? currentPlayer.date_of_birth.toISOString().split("T")[0]
          : null;
        const newDobIso = parsedDob
          ? parsedDob.toISOString().split("T")[0]
          : null;

        if (currentDobIso !== newDobIso) {
          changedPersonalFields.push("date_of_birth");
          beforePersonal.date_of_birth = currentDobIso;
          afterPersonal.date_of_birth = newDobIso;
          playerUpdateData.date_of_birth = parsedDob;
        }
      }

      // Step C: Determine Roster Field Changes
      const changedRosterFields: string[] = [];
      const beforeRoster: Record<string, string | number | boolean | null> = {};
      const afterRoster: Record<string, string | number | boolean | null> = {};
      const rosterUpdateData: Prisma.registration_playersUpdateInput = {};

      if (parsedJersey !== undefined && currentRp.jersey_number !== parsedJersey) {
        changedRosterFields.push("jersey_number");
        beforeRoster.jersey_number = currentRp.jersey_number;
        afterRoster.jersey_number = parsedJersey;
        rosterUpdateData.jersey_number = parsedJersey;
      }

      if (
        trimmedPosition !== undefined &&
        (currentRp.position || null) !== trimmedPosition
      ) {
        changedRosterFields.push("position");
        beforeRoster.position = currentRp.position;
        afterRoster.position = trimmedPosition;
        rosterUpdateData.position = trimmedPosition;
      }

      if (isCaptain !== undefined) {
        const targetIsCaptain = Boolean(isCaptain);
        if (currentRp.is_captain !== targetIsCaptain) {
          changedRosterFields.push("is_captain");
          beforeRoster.is_captain = currentRp.is_captain;
          afterRoster.is_captain = targetIsCaptain;
          rosterUpdateData.is_captain = targetIsCaptain;
        }
      }

      // Step D: No-Op Guard
      if (
        changedPersonalFields.length === 0 &&
        changedRosterFields.length === 0
      ) {
        throw new Error("NO_CHANGE: No changes detected in player or roster details.");
      }

      let playerAuditLogId: string | undefined;
      let rosterAuditLogId: string | undefined;

      const finalFirst =
        trimmedFirst !== undefined ? trimmedFirst : currentPlayer.first_name;
      const finalMiddle =
        trimmedMiddle !== undefined ? trimmedMiddle : currentPlayer.middle_name;
      const finalLast =
        trimmedLast !== undefined ? trimmedLast : currentPlayer.last_name;
      const finalSuffix =
        trimmedSuffix !== undefined ? trimmedSuffix : currentPlayer.suffix;

      const updatedFullName = formatFullName(
        finalFirst,
        finalMiddle,
        finalLast,
        finalSuffix
      );

      // Step E: Apply Personal Field Updates if any
      if (changedPersonalFields.length > 0) {
        await tx.players.update({
          where: { id: playerId },
          data: playerUpdateData,
        });

        const playerLog = await tx.admin_audit_logs.create({
          data: {
            admin_profile_id: admin.profileId,
            action: "PLAYER_PROFILE_UPDATED",
            entity_type: "PLAYER",
            entity_id: playerId,
            metadata: {
              registration_id: registrationId,
              player_id: playerId,
              player_name: updatedFullName,
              changed_fields: changedPersonalFields,
              before: beforePersonal as Prisma.InputJsonObject,
              after: afterPersonal as Prisma.InputJsonObject,
              actor_name: admin.displayName,
              actor_email: admin.email,
            },
          },
        });
        playerAuditLogId = playerLog.id;
      }

      // Step F: Apply Roster Field Updates if any
      if (changedRosterFields.length > 0) {
        // If promoting to captain, atomically unset captain on other members of this registration
        if (rosterUpdateData.is_captain === true && !currentRp.is_captain) {
          await tx.registration_players.updateMany({
            where: {
              registration_id: registrationId,
              is_captain: true,
              NOT: { id: registrationPlayerId },
            },
            data: {
              is_captain: false,
            },
          });
        }

        await tx.registration_players.update({
          where: { id: registrationPlayerId },
          data: rosterUpdateData,
        });

        const rosterLog = await tx.admin_audit_logs.create({
          data: {
            admin_profile_id: admin.profileId,
            action: "ROSTER_MEMBER_UPDATED",
            entity_type: "REGISTRATION_PLAYER",
            entity_id: registrationPlayerId,
            metadata: {
              registration_id: registrationId,
              registration_player_id: registrationPlayerId,
              player_id: playerId,
              player_name: updatedFullName,
              team_name: currentRp.registrations.teams.team_name,
              changed_fields: changedRosterFields,
              before: beforeRoster as Prisma.InputJsonObject,
              after: afterRoster as Prisma.InputJsonObject,
              actor_name: admin.displayName,
              actor_email: admin.email,
            },
          },
        });
        rosterAuditLogId = rosterLog.id;
      }

      return {
        playerId,
        registrationPlayerId,
        fullName: updatedFullName,
        changedPersonalFields,
        changedRosterFields,
        playerAuditLogId,
        rosterAuditLogId,
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

      return {
        success: false,
        error: "TRANSACTION_ERROR",
        message: error.message,
      };
    }

    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while updating player details.",
    };
  }
}
