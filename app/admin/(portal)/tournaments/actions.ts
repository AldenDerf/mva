"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { createTournament, updateTournament, validateTournament } from "@/lib/admin/tournaments";

export type FormState = { errors: Record<string, string>; message?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveTournament(_previous: FormState, form: FormData): Promise<FormState> {
  const admin = await requireAdmin();
  const id = String(form.get("id") ?? "");
  const mode = String(form.get("mode") ?? "");
  if (mode !== "create" && mode !== "edit") return { errors: {}, message: "Invalid form mode." };
  if ((mode === "edit") !== Boolean(id)) return { errors: {}, message: "Invalid tournament request." };
  if (id && !uuid.test(id)) return { errors: {}, message: "Invalid tournament ID." };
  const { input, errors } = validateTournament(form, id ? "edit" : "create");
  if (!input) return { errors, message: "Please correct the highlighted fields." };
  let destination: string;
  try {
    if (id) {
      const updated = await updateTournament(admin, id, input);
      if (!updated) return { errors: {}, message: "Tournament was not found." };
      destination = `/admin/tournaments/${id}`;
    } else {
      const createdId = await createTournament(admin, input);
      destination = `/admin/tournaments/${createdId}`;
    }
  } catch (error) {
    console.error("Tournament save failed:", error);
    return { errors: {}, message: "Unable to save the tournament. Please try again." };
  }
  revalidatePath("/admin/tournaments");
  revalidatePath(destination);
  redirect(destination);
}
