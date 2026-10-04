import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { getAdminRegistrationChoices } from "@/lib/admin/registration-create";
import { AdminRegistrationForm } from "@/components/admin/AdminRegistrationForm";

export const dynamic = "force-dynamic";
export const metadata = { title: "Register Team | MVA Admin" };

export default async function NewAdminRegistrationPage({ searchParams }: { searchParams: Promise<{ tournamentId?: string }> }) {
  const admin = await requireAdmin();
  const { tournamentId } = await searchParams;
  const choices = await getAdminRegistrationChoices();
  const selectedTournamentId = choices.some(choice => choice.id === tournamentId) ? tournamentId : undefined;
  if (tournamentId && !selectedTournamentId) return <main className="space-y-5 pb-16">
    <h1 className="text-3xl font-extrabold text-[#205823]">Tournament unavailable for registration</h1>
    <p className="text-sm text-[#5F6B61]">This tournament is not accepting new admin team registrations. Choose an eligible tournament or review its status.</p>
    <Link href="/admin/registrations/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#205823] px-4 font-bold text-white">Choose a Tournament</Link>
  </main>;
  return <main className="space-y-5 pb-16">
    <Link href="/admin/registrations" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#205823]">← Registrations</Link>
    <div><p className="text-xs font-bold uppercase tracking-wider text-[#A47415]">Admin Registration</p>
      <h1 className="mt-1 text-3xl font-extrabold text-[#205823]">Register a Team</h1>
      <p className="mt-1 text-sm text-[#5F6B61]">Add a team and its roster to a tournament division.</p></div>
    <AdminRegistrationForm choices={choices} admin={{ displayName: admin.displayName, email: admin.email }} initialTournamentId={selectedTournamentId} />
  </main>;
}
