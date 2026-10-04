import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { TournamentForm } from "@/components/admin/TournamentForm";

export const metadata = { title: "Create Tournament | MVA Admin" };
export default async function NewTournamentPage() {
  await requireAdmin();
  return <main className="space-y-5 pb-16"><Link href="/admin/tournaments" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#205823]">← Tournaments</Link>
    <div><h1 className="text-3xl font-extrabold text-[#205823]">Create Tournament</h1><p className="mt-1 text-sm text-[#5F6B61]">Set the tournament details. Divisions are managed in the next phase.</p></div>
    <TournamentForm /></main>;
}
