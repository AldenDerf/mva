import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminContext } from "@/lib/auth/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type DeleteRegistrationResult =
  | { success: true; auditLogId: string }
  | { success: false; error: "UNAUTHORIZED" | "VALIDATION_ERROR" | "NOT_FOUND" | "INELIGIBLE" | "STALE_STATE" | "TRANSACTION_ERROR"; message: string };

class DeletionBlocked extends Error {
  constructor(public code: "NOT_FOUND" | "INELIGIBLE" | "STALE_STATE", message: string) {
    super(message);
  }
}

/** Removes only a registration and its unpaid assessments; retains reusable identities. */
export async function deleteUnverifiedRegistration(
  admin: AdminContext,
  input: { registrationId: string; expectedStatus: string; confirmationCode: string; reason: string }
): Promise<DeleteRegistrationResult> {
  if (!admin?.profileId || admin.role !== "ADMIN" || !admin.authUserId) {
    return { success: false, error: "UNAUTHORIZED", message: "Active administrator access is required." };
  }
  if (!input || !UUID.test(input.registrationId) || !input.reason?.trim() ||
      input.reason.trim().length < 10 || input.reason.length > 1000 || !input.confirmationCode?.trim()) {
    return { success: false, error: "VALIDATION_ERROR", message: "Enter a deletion reason of at least 10 characters and confirm the registration code." };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const access = await tx.admin_access.findFirst({
        where: { profile_id: admin.profileId, is_active: true, role: "ADMIN", profiles: { auth_user_id: admin.authUserId } },
        select: { id: true },
      });
      if (!access) throw new DeletionBlocked("INELIGIBLE", "Administrator access is no longer active.");

      const registration = await tx.registrations.findUnique({
        where: { id: input.registrationId },
        include: {
          teams: { select: { team_name: true } },
          leagues: { select: { name: true } },
          league_categories_registrations_league_category_idToleague_categories: { select: { name: true } },
          payments: { select: { id: true, status: true, verified_at: true, verified_by_profile_id: true } },
          registration_players: { select: { id: true } },
        },
      });
      if (!registration) throw new DeletionBlocked("NOT_FOUND", "Registration not found.");
      if (registration.status !== input.expectedStatus) throw new DeletionBlocked("STALE_STATE", "Registration status changed. Refresh and try again.");
      if (registration.registration_code !== input.confirmationCode.trim()) throw new DeletionBlocked("INELIGIBLE", "Registration code does not match.");

      const history = await tx.admin_audit_logs.findFirst({
        where: { entity_type: "REGISTRATION", entity_id: registration.id, action: "REGISTRATION_VERIFIED" },
        select: { id: true },
      });
      if (registration.status === "VERIFIED" || registration.verified_at || history) {
        throw new DeletionBlocked("INELIGIBLE", "A historically verified registration cannot be deleted.");
      }

      const payments = registration.payments;
      if (payments.some((payment) => payment.status === "VERIFIED" || payment.status === "REFUNDED" || payment.verified_at || payment.verified_by_profile_id)) {
        throw new DeletionBlocked("INELIGIBLE", "Verified or refunded payment history prevents deletion.");
      }
      if (payments.some((payment) => payment.status !== "PENDING" && payment.status !== "REJECTED")) {
        throw new DeletionBlocked("INELIGIBLE", "Only unpaid assessments can be deleted.");
      }

      const paymentIds = payments.map((payment) => payment.id);
      const rosterIds = registration.registration_players.map((player) => player.id);
      const allocation = await tx.payment_allocations.findFirst({
        where: { OR: [
          { payment_id: { in: paymentIds } },
          { registration_player_id: { in: rosterIds } },
        ] },
        select: { id: true },
      });
      if (allocation) throw new DeletionBlocked("INELIGIBLE", "Payment allocation history prevents deletion.");

      const removedPayments = await tx.payments.deleteMany({ where: { registration_id: registration.id, status: { in: ["PENDING", "REJECTED"] }, verified_at: null, verified_by_profile_id: null } });
      if (removedPayments.count !== payments.length) throw new DeletionBlocked("STALE_STATE", "Payment records changed. Refresh and try again.");
      await tx.registration_players.deleteMany({ where: { registration_id: registration.id } });
      const removed = await tx.registrations.deleteMany({ where: { id: registration.id, status: registration.status, verified_at: null } });
      if (removed.count !== 1) throw new DeletionBlocked("STALE_STATE", "Registration changed. Refresh and try again.");

      const audit = await tx.admin_audit_logs.create({ data: {
        admin_profile_id: admin.profileId,
        action: "REGISTRATION_DELETED", entity_type: "REGISTRATION", entity_id: registration.id,
        metadata: {
          registration_id: registration.id, registration_code: registration.registration_code,
          team_id: registration.team_id, team_name: registration.teams.team_name,
          league_id: registration.league_id, league_name: registration.leagues.name,
          category_id: registration.league_category_id,
          category_name: registration.league_categories_registrations_league_category_idToleague_categories.name,
          previous_status: registration.status, submitted_at: registration.submitted_at.toISOString(),
          player_count: rosterIds.length, deleted_payment_count: removedPayments.count,
          deleted_pending_payment_count: payments.filter((p) => p.status === "PENDING").length,
          deleted_rejected_payment_count: payments.filter((p) => p.status === "REJECTED").length,
          verified_payment_count: 0, verified_financial_amount: 0,
          reason: input.reason.trim(), actor_profile_id: admin.profileId,
          actor_name: admin.displayName, actor_email: admin.email,
        },
      } });
      return { auditLogId: audit.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return { success: true, ...result };
  } catch (error) {
    if (error instanceof DeletionBlocked) return { success: false, error: error.code, message: error.message };
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2003"].includes(error.code)) {
      return { success: false, error: "STALE_STATE", message: "Related records changed. Refresh and try again." };
    }
    return { success: false, error: "TRANSACTION_ERROR", message: "Registration deletion failed. No changes were saved." };
  }
}
