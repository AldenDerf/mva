"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { isPlayerSex, type PlayerSex } from "@/lib/player-sex";
import { createRegistration, type RegistrationPlayerInput } from "@/lib/registration";
import { adminRegistrantFromContext } from "@/lib/admin/registration-create";

export type AdminRegistrationFormState = { message?: string };

export async function createAdminRegistrationAction(
  _previous: AdminRegistrationFormState, form: FormData
): Promise<AdminRegistrationFormState> {
  const admin = await requireAdmin();
  const value = (key: string) => String(form.get(key) ?? "").trim();
  const teamName = value("team_name");
  const contact = value("registrant_contact");
  if (!teamName || !contact)
    return { message: "Team name and contact number are required." };
  if (teamName.length > 150 || contact.length > 30)
    return { message: "Team name or contact number is too long." };
  let parsed: unknown;
  try { parsed = JSON.parse(value("players")); }
  catch { return { message: "Enter a valid player roster." }; }
  if (!Array.isArray(parsed) || parsed.length < 1 || parsed.some(p => !p || typeof p !== "object"))
    return { message: "Add at least one player." };
  const players: RegistrationPlayerInput[] = [];
  for (const item of parsed) {
    const p = item as Record<string, unknown>;
    const playerFirst = typeof p.first_name === "string" ? p.first_name.trim() : "";
    const playerLast = typeof p.last_name === "string" ? p.last_name.trim() : "";
    if (!playerFirst || !playerLast || playerFirst.length > 100 || playerLast.length > 100)
      return { message: "Each player needs a first and last name (100 characters or fewer)." };
    if ((p.middle_name !== undefined && p.middle_name !== null && typeof p.middle_name !== "string") ||
        (p.suffix !== undefined && p.suffix !== null && typeof p.suffix !== "string") ||
        (typeof p.middle_name === "string" && p.middle_name.trim().length > 100) ||
        (typeof p.suffix === "string" && p.suffix.trim().length > 20))
      return { message: "Player middle names and suffixes must fit their allowed lengths." };
    if (p.sex !== undefined && p.sex !== null && !isPlayerSex(p.sex))
      return { message: "Player sex must be Male, Female, or not recorded." };
    players.push({ first_name: playerFirst,
      middle_name: typeof p.middle_name === "string" ? p.middle_name.trim() || null : null,
      last_name: playerLast, suffix: typeof p.suffix === "string" ? p.suffix.trim() || null : null,
      sex: (p.sex ?? null) as PlayerSex | null,
      is_captain: p.is_captain === true });
  }
  if (players.filter(p => p.is_captain).length !== 1)
    return { message: "Select exactly one captain." };
  let registrationId: string;
  try {
    const result = await createRegistration({ league_id: value("league_id"),
      league_category_id: value("league_category_id"), team_name: teamName,
      // Compatibility with required legacy name columns. The profile display name is
      // kept whole; audit actor identity remains admin.profileId, never form text.
      registrant: adminRegistrantFromContext(admin, contact), players }, admin);
    registrationId = result.registration_id;
  } catch (error) {
    console.error("Admin registration failed:", error);
    const message = error instanceof Error ? error.message : "";
    if (message.includes("different recorded sex")) return { message };
    if (message.includes("already registered")) return { message };
    if (message.includes("Division was not found") || message.includes("Choose a valid tournament")) return { message };
    if (message.includes("no longer accepting new team registrations")) return { message };
    return { message: "Unable to create registration. Review the form and try again." };
  }
  revalidatePath("/admin/registrations");
  revalidatePath("/admin");
  redirect(`/admin/registrations/${registrationId}`);
}
