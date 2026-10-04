"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { getEligibleTransferDestinations, movePlayerBetweenTeams, type PlayerTransferInput } from "@/lib/admin/player-transfer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function getMovePlayerDestinationsAction(sourceRegistrationId: string, playerId: string) {
  await requireAdmin();
  if (!UUID.test(sourceRegistrationId) || !UUID.test(playerId)) return [];
  return getEligibleTransferDestinations(sourceRegistrationId, playerId);
}

export async function movePlayerAction(input: PlayerTransferInput) {
  const admin = await requireAdmin();
  if (!input || !UUID.test(input.registrationPlayerId) || !UUID.test(input.sourceRegistrationId) || !UUID.test(input.destinationRegistrationId)) {
    return { success: false as const, message: "Invalid roster or registration ID." };
  }
  const result = await movePlayerBetweenTeams(admin, input);
  if (result.success) {
    revalidatePath("/admin");
    revalidatePath("/admin/registrations");
    revalidatePath(`/admin/registrations/${input.sourceRegistrationId}`);
    revalidatePath(`/admin/registrations/${input.destinationRegistrationId}`);
    revalidatePath("/admin/payments");
    revalidatePath("/teams");
  }
  return result;
}
