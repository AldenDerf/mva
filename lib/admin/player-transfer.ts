import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminContext } from "@/lib/auth/admin";

export interface PlayerTransferInput {
  registrationPlayerId: string;
  sourceRegistrationId: string;
  destinationRegistrationId: string;
  reason: string;
}

export type PlayerTransferResult =
  | { success: true; registrationPlayerId: string; paymentIdsMoved: string[]; auditLogId: string }
  | { success: false; message: string };

const fail = (message: string): PlayerTransferResult => ({ success: false, message });

export async function getEligibleTransferDestinations(sourceRegistrationId: string, playerId: string) {
  const source = await prisma.registrations.findUnique({ where: { id: sourceRegistrationId } });
  if (!source || source.status !== "VERIFIED") return [];
  const registrations = await prisma.registrations.findMany({
    where: {
      id: { not: source.id },
      league_id: source.league_id,
      league_category_id: source.league_category_id,
      status: "VERIFIED",
      registration_players: { none: { player_id: playerId } },
    },
    select: {
      id: true,
      teams: { select: { team_name: true } },
      registration_players: { where: { status: "ACTIVE" }, select: { id: true } },
    },
    orderBy: { teams: { team_name: "asc" } },
  });
  return registrations.map((r) => ({ id: r.id, teamName: r.teams.team_name, activePlayerCount: r.registration_players.length }));
}

export async function movePlayerBetweenTeams(admin: AdminContext, input: PlayerTransferInput): Promise<PlayerTransferResult> {
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (!reason || reason.length > 500) return fail("A transfer reason of at most 500 characters is required.");
  if (input.sourceRegistrationId === input.destinationRegistrationId) return fail("Player is already on this team.");

  try {
    return await prisma.$transaction((tx) => executePlayerTransferInTransaction(tx, admin, input),
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return fail("This player already exists on the destination roster.");
      if (error.code === "P2034") return fail("The roster changed during this transfer. Please try again.");
    }
    return fail("Unable to move this player. Please try again.");
  }
}

/** Exposed for rollback-based regression verification; production calls this inside Serializable. */
export async function executePlayerTransferInTransaction(
  tx: Prisma.TransactionClient, admin: AdminContext, input: PlayerTransferInput,
): Promise<PlayerTransferResult> {
      const reason = typeof input.reason === "string" ? input.reason.trim() : "";
      if (!reason || reason.length > 500) return fail("A transfer reason of at most 500 characters is required.");
      if (input.sourceRegistrationId === input.destinationRegistrationId) return fail("Player is already on this team.");
      const actor = await tx.admin_access.findUnique({ where: { profile_id: admin.profileId } });
      if (!actor?.is_active || actor.role !== "ADMIN") return fail("Administrator access is required.");

      const rp = await tx.registration_players.findUnique({
        where: { id: input.registrationPlayerId },
        include: { players: true },
      });
      if (!rp || rp.registration_id !== input.sourceRegistrationId) return fail("Roster member not found on the source registration.");
      if (rp.status !== "ACTIVE") return fail("Restore this player before moving teams.");
      if (rp.is_captain) return fail("Reassign the team captain before moving this player.");

      const source = await tx.registrations.findUnique({ where: { id: input.sourceRegistrationId }, include: { teams: true, leagues: true, league_categories_registrations_league_category_idToleague_categories: true } });
      const destination = await tx.registrations.findUnique({ where: { id: input.destinationRegistrationId }, include: { teams: true } });
      if (!source || !destination) return fail("Source or destination registration was not found.");
      if (source.status !== "VERIFIED" || destination.status !== "VERIFIED") return fail("Both team registrations must be verified.");
      if (source.league_id !== destination.league_id || source.league_category_id !== destination.league_category_id) {
        return fail("Teams must belong to the same tournament and division.");
      }
      const duplicate = await tx.registration_players.findUnique({
        where: { registration_id_player_id: { registration_id: destination.id, player_id: rp.player_id } },
      });
      if (duplicate) return fail("This player already exists on the destination roster.");

      // Active legacy allocations retain ownership of a team payment. Their accounting
      // cannot be transferred safely without a separate reconciliation decision.
      const activeAllocation = await tx.payment_allocations.findFirst({
        where: { registration_player_id: rp.id, reversed_at: null }, select: { id: true },
      });
      if (activeAllocation) return fail("This player has a legacy payment allocation that must be reviewed before transferring teams.");

      const payments = await tx.payments.findMany({ where: { registration_player_id: rp.id } });
      if (payments.some((payment) => payment.registration_id !== source.id)) {
        return fail("This player's payment ownership must be reviewed before transferring teams.");
      }
      const paymentIdsMoved = payments.map((payment) => payment.id);
      const allocatedPayment = paymentIdsMoved.length ? await tx.payment_allocations.findFirst({
        where: { payment_id: { in: paymentIdsMoved }, reversed_at: null }, select: { id: true },
      }) : null;
      if (allocatedPayment) return fail("This player's payment has an active legacy allocation that must be reviewed before transferring teams.");
      const verified = payments.filter((payment) => payment.status === "VERIFIED");
      await tx.registration_players.update({ where: { id: rp.id }, data: { registration_id: destination.id } });
      await tx.payments.updateMany({
        where: { registration_player_id: rp.id, registration_id: source.id },
        data: { registration_id: destination.id },
      });
      const playerName = [rp.players.first_name, rp.players.middle_name, rp.players.last_name, rp.players.suffix].filter(Boolean).join(" ");
      const audit = await tx.admin_audit_logs.create({ data: {
        admin_profile_id: admin.profileId,
        action: "PLAYER_MOVED_BETWEEN_TEAMS",
        entity_type: "REGISTRATION_PLAYER",
        entity_id: rp.id,
        metadata: {
          registration_player_id: rp.id, player_id: rp.player_id, player_name: playerName,
          source_registration_id: source.id, source_registration_code: source.registration_code,
          source_team_id: source.team_id, source_team_name: source.teams.team_name,
          destination_registration_id: destination.id, destination_registration_code: destination.registration_code,
          destination_team_id: destination.team_id, destination_team_name: destination.teams.team_name,
          league_id: source.league_id, league_name: source.leagues.name,
          league_category_id: source.league_category_id,
          division_name: source.league_categories_registrations_league_category_idToleague_categories.name,
          jersey_number: rp.jersey_number, position: rp.position,
          payment_ids_moved: paymentIdsMoved,
          verified_payment_count: verified.length,
          verified_payment_amount: verified.reduce((sum, payment) => sum + Number(payment.amount), 0),
          reason, actor_profile_id: admin.profileId, actor_name: admin.displayName, actor_email: admin.email,
        },
      } });
      return { success: true, registrationPlayerId: rp.id, paymentIdsMoved, auditLogId: audit.id };
}
