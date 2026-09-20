import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { AdminContext } from "@/lib/auth/admin";

export interface AddPlayerToRosterInput {
  registrationId: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  jerseyNumber?: number | null;
  position?: string | null;
  isCaptain?: boolean;
}

export type AddPlayerErrorCode =
  | "UNAUTHORIZED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INVALID_REGISTRATION_STATUS"
  | "DUPLICATE_ROSTER_PLAYER"
  | "STALE_STATE"
  | "TRANSACTION_ERROR";

export interface AddPlayerSuccess {
  success: true;
  registrationPlayerId: string;
  playerId: string;
  paymentId: string;
  playerName: string;
  registrationCode: string;
  auditLogId: string;
}

export interface AddPlayerFailure {
  success: false;
  error: AddPlayerErrorCode;
  message: string;
}

export type AddPlayerResult = AddPlayerSuccess | AddPlayerFailure;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PLAYER_REGISTRATION_FEE = 300.0;

function normalizeName(str?: string | null): string {
  return (str || "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function formatFullName(
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
 * Compares two player identities for duplicate detection.
 * Considers case and harmless whitespace differences.
 * If middle name is provided for both and differs, they are considered different people.
 * If middle name matches, or either is omitted/empty, and first, last, suffix match: duplicate.
 */
export function isSamePlayerIdentity(
  a: { firstName: string; middleName?: string | null; lastName: string; suffix?: string | null },
  b: { firstName: string; middleName?: string | null; lastName: string; suffix?: string | null }
): boolean {
  const fA = normalizeName(a.firstName);
  const fB = normalizeName(b.firstName);
  const lA = normalizeName(a.lastName);
  const lB = normalizeName(b.lastName);
  const sA = normalizeName(a.suffix);
  const sB = normalizeName(b.suffix);
  const mA = normalizeName(a.middleName);
  const mB = normalizeName(b.middleName);

  if (fA !== fB || lA !== lB || sA !== sB) {
    return false;
  }

  // If both have non-empty middle names and they differ, they are different people
  if (mA && mB && mA !== mB) {
    return false;
  }

  // Otherwise, match!
  return true;
}

/**
 * Checks if a player is already a member of the existing roster.
 */
export function isDuplicateRosterMember(
  existingRoster: Array<{
    players: {
      first_name: string;
      middle_name: string | null;
      last_name: string;
      suffix: string | null;
    };
  }>,
  newPlayer: {
    firstName: string;
    middleName?: string | null;
    lastName: string;
    suffix?: string | null;
  }
): boolean {
  return existingRoster.some((member) =>
    isSamePlayerIdentity(
      {
        firstName: member.players.first_name,
        middleName: member.players.middle_name,
        lastName: member.players.last_name,
        suffix: member.players.suffix,
      },
      newPlayer
    )
  );
}

/**
 * Transactionally adds an individual player to an official VERIFIED team registration roster.
 * 
 * Invariants enforced:
 * 1. Admin authorization: caller must have active ADMIN role.
 * 2. Registration eligibility: target registration must exist and have status === "VERIFIED".
 * 3. Input validation: first_name and last_name are strictly required; normalized whitespace.
 * 4. Duplicate protection: duplicate names on the SAME roster are rejected.
 * 5. No maximum roster limit: official rosters can expand beyond 12 members.
 * 6. Payment assessment: player is initialized with a ₱300.00 PENDING payment record.
 * 7. Audit trail: immutable audit log record created in admin_audit_logs.
 * 8. Concurrency guard: serializable transaction isolation & unique constraint error handling.
 */
export async function addPlayerToRoster(
  admin: AdminContext,
  params: AddPlayerToRosterInput
): Promise<AddPlayerResult> {
  // 1. Validate Admin Context
  if (!admin || !admin.profileId || admin.role !== "ADMIN") {
    return {
      success: false,
      error: "UNAUTHORIZED",
      message: "You must have active administrator access to add players to a roster.",
    };
  }

  // 2. Validate input parameters
  const {
    registrationId,
    firstName,
    middleName,
    lastName,
    suffix,
    jerseyNumber,
    position,
    isCaptain,
  } = params;

  if (!registrationId || !UUID_REGEX.test(registrationId)) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Invalid registration record ID format.",
    };
  }

  const trimmedFirstName = firstName?.trim();
  if (!trimmedFirstName) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "First name is required.",
    };
  }

  const trimmedLastName = lastName?.trim();
  if (!trimmedLastName) {
    return {
      success: false,
      error: "VALIDATION_ERROR",
      message: "Last name is required.",
    };
  }

  const cleanMiddleName = middleName?.trim() || null;
  const cleanSuffix = suffix?.trim() || null;
  const cleanPosition = position?.trim() || null;

  let cleanJerseyNumber: number | null = null;
  if (jerseyNumber !== undefined && jerseyNumber !== null && String(jerseyNumber).trim() !== "") {
    const parsed = Number(jerseyNumber);
    if (isNaN(parsed) || !Number.isInteger(parsed) || parsed < 0 || parsed > 99) {
      return {
        success: false,
        error: "VALIDATION_ERROR",
        message: "Jersey number must be a valid whole number between 0 and 99.",
      };
    }
    cleanJerseyNumber = parsed;
  }

  const fullName = formatFullName(
    trimmedFirstName,
    cleanMiddleName,
    trimmedLastName,
    cleanSuffix
  );

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // A. Re-read target registration with its current roster
        const reg = await tx.registrations.findUnique({
          where: { id: registrationId },
          include: {
            teams: {
              select: {
                id: true,
                team_name: true,
              },
            },
            registration_players: {
              include: {
                players: {
                  select: {
                    id: true,
                    first_name: true,
                    middle_name: true,
                    last_name: true,
                    suffix: true,
                  },
                },
              },
            },
          },
        });

        if (!reg) {
          throw new Error("NOT_FOUND");
        }

        // B. Eligibility check: status must strictly be VERIFIED
        if (reg.status !== "VERIFIED") {
          throw new Error(`INVALID_REGISTRATION_STATUS:${reg.status}`);
        }

        // C. Duplicate check against current registration roster
        const isDuplicate = isDuplicateRosterMember(reg.registration_players, {
          firstName: trimmedFirstName,
          middleName: cleanMiddleName,
          lastName: trimmedLastName,
          suffix: cleanSuffix,
        });

        if (isDuplicate) {
          throw new Error("DUPLICATE_ROSTER_PLAYER");
        }

        // D. Resolve or create player identity record
        // Search candidates with matching first and last name (case-insensitive)
        const candidates = await tx.players.findMany({
          where: {
            first_name: { equals: trimmedFirstName, mode: "insensitive" },
            last_name: { equals: trimmedLastName, mode: "insensitive" },
          },
        });

        const matchedCandidate = candidates.find((c) => {
          const cMiddle = normalizeName(c.middle_name);
          const nMiddle = normalizeName(cleanMiddleName);
          const cSuffix = normalizeName(c.suffix);
          const nSuffix = normalizeName(cleanSuffix);
          return cMiddle === nMiddle && cSuffix === nSuffix;
        });

        let targetPlayerId: string;
        if (matchedCandidate) {
          targetPlayerId = matchedCandidate.id;
        } else {
          const createdPlayer = await tx.players.create({
            data: {
              first_name: trimmedFirstName,
              middle_name: cleanMiddleName,
              last_name: trimmedLastName,
              suffix: cleanSuffix,
            },
          });
          targetPlayerId = createdPlayer.id;
        }

        // E. Prevent duplicate roster membership for same player_id (database constraint uq_registration_player)
        const existingRosterMembership = await tx.registration_players.findUnique({
          where: {
            registration_id_player_id: {
              registration_id: reg.id,
              player_id: targetPlayerId,
            },
          },
        });

        if (existingRosterMembership) {
          throw new Error("DUPLICATE_ROSTER_PLAYER");
        }

        // F. Create registration_players entry (official roster membership)
        const rp = await tx.registration_players.create({
          data: {
            registration_id: reg.id,
            player_id: targetPlayerId,
            jersey_number: cleanJerseyNumber,
            position: cleanPosition,
            is_captain: Boolean(isCaptain),
          },
        });

        // G. Create initial player payment assessment: ₱300.00 PENDING
        const payment = await tx.payments.create({
          data: {
            registration_id: reg.id,
            registration_player_id: rp.id,
            payment_method: "OTHER",
            amount: PLAYER_REGISTRATION_FEE,
            status: "PENDING",
            notes: "Player registration fee assessment",
          },
        });

        // H. Create immutable admin audit log
        const auditLog = await tx.admin_audit_logs.create({
          data: {
            admin_profile_id: admin.profileId,
            action: "PLAYER_ADDED_TO_ROSTER",
            entity_type: "REGISTRATION_PLAYER",
            entity_id: rp.id,
            metadata: {
              registration_player_id: rp.id,
              registration_id: reg.id,
              registration_code: reg.registration_code,
              team_id: reg.teams.id,
              team_name: reg.teams.team_name,
              player_id: targetPlayerId,
              player_name: fullName,
              jersey_number: cleanJerseyNumber,
              position: cleanPosition,
              is_captain: Boolean(isCaptain),
              initial_payment_status: "PENDING",
              initial_payment_amount: PLAYER_REGISTRATION_FEE,
              actor_profile_id: admin.profileId,
              actor_name: admin.displayName,
              actor_email: admin.email,
            },
          },
        });

        return {
          registrationPlayerId: rp.id,
          playerId: targetPlayerId,
          paymentId: payment.id,
          playerName: fullName,
          registrationCode:
            reg.registration_code || `REG-${reg.id.slice(0, 8).toUpperCase()}`,
          auditLogId: auditLog.id,
        };
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      }
    );

    return {
      success: true,
      ...result,
    };
  } catch (err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return {
          success: false,
          error: "DUPLICATE_ROSTER_PLAYER",
          message: "This player is already on the roster of this team registration.",
        };
      }
      if (err.code === "P2034") {
        return {
          success: false,
          error: "STALE_STATE",
          message:
            "A concurrent modification conflict occurred while adding this player. Please try again.",
        };
      }
    }

    const errMsg = err instanceof Error ? err.message : String(err);

    if (errMsg === "NOT_FOUND") {
      return {
        success: false,
        error: "NOT_FOUND",
        message: "Registration record not found.",
      };
    }

    if (errMsg.startsWith("INVALID_REGISTRATION_STATUS")) {
      const currentStatus = errMsg.split(":")[1] || "UNKNOWN";
      return {
        success: false,
        error: "INVALID_REGISTRATION_STATUS",
        message: `Players can only be added to registrations with VERIFIED status (currently ${currentStatus}).`,
      };
    }

    if (errMsg === "DUPLICATE_ROSTER_PLAYER") {
      return {
        success: false,
        error: "DUPLICATE_ROSTER_PLAYER",
        message: "A player with this name is already registered on this team roster.",
      };
    }

    if (
      errMsg.includes("could not serialize") ||
      errMsg.includes("write conflict") ||
      errMsg.includes("deadlock")
    ) {
      return {
        success: false,
        error: "STALE_STATE",
        message:
          "A concurrent modification conflict occurred while adding this player. Please try again.",
      };
    }

    return {
      success: false,
      error: "TRANSACTION_ERROR",
      message: "An unexpected error occurred while adding the player to the roster.",
    };
  }
}
