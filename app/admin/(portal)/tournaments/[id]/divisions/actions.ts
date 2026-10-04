"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth/admin";
import { createDivision, updateDivision, validateDivision } from "@/lib/admin/tournaments";

export type DivisionFormState = { errors: Record<string, string>; message?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveDivision(_previous: DivisionFormState, form: FormData): Promise<DivisionFormState> {
  const admin = await requireAdmin();
  const tournamentId = String(form.get("tournament_id") ?? "");
  const divisionId = String(form.get("division_id") ?? "");
  const mode = String(form.get("mode") ?? "");
  if (!uuid.test(tournamentId) || (mode !== "create" && mode !== "edit") ||
      (mode === "edit" && !uuid.test(divisionId)) || (mode === "create" && divisionId))
    return { errors: {}, message: "Invalid division request." };
  const { input, errors } = validateDivision(form);
  if (!input) return { errors, message: "Please correct the highlighted fields." };
  try {
    const result = mode === "edit"
      ? await updateDivision(admin, tournamentId, divisionId, input)
      : await createDivision(admin, tournamentId, input);
    if (!result.ok) return { errors: result.field === "form" ? {} : { [result.field]: result.message },
      message: result.field === "form" ? result.message : "Please correct the highlighted field." };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      return { errors: { name: "This division name is already used in this tournament." }, message: "Please correct the highlighted field." };
    console.error("Division save failed:", error);
    return { errors: {}, message: "Unable to save the division. Please try again." };
  }
  const destination = `/admin/tournaments/${tournamentId}`;
  revalidatePath(destination);
  redirect(destination);
}
