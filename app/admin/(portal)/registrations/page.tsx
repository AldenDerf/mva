import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { getRegistrationMonitoring } from "@/lib/admin/registration-monitoring";
import { TournamentCard } from "@/components/admin/RegistrationMonitoring";

export const metadata: Metadata = { title: "Registration Dashboard | MVA Admin" };
export const dynamic = "force-dynamic";

export default async function RegistrationsPage() {
  await requireAdmin();
  const tournaments = await getRegistrationMonitoring();
  return <main className="space-y-6 pb-12">
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#DDE3DE] pb-5">
      <div><p className="text-xs font-bold uppercase tracking-wider text-[#A47415]">Admin monitoring</p>
        <h1 className="text-3xl font-extrabold text-[#205823]">Registration Dashboard</h1>
        <p className="mt-1 text-sm text-[#5F6B61]">Choose a tournament to find the divisions, teams, and players needing attention.</p></div>
      <Link href="/admin/registrations/new" className="inline-flex min-h-11 items-center rounded-lg bg-[#205823] px-4 text-sm font-bold text-white">Register Team</Link>
    </header>
    <p className="text-sm font-semibold text-[#5F6B61]">{tournaments.length} {tournaments.length === 1 ? "tournament" : "tournaments"}</p>
    {tournaments.length ? <div className="grid gap-4 xl:grid-cols-2">{tournaments.map(item => <TournamentCard key={item.id} item={item} />)}</div>
      : <section className="rounded-2xl border border-dashed border-[#B7C7B9] bg-white p-8 text-center"><h2 className="font-bold text-[#172019]">No tournaments yet</h2><p className="mt-1 text-sm text-[#5F6B61]">Create a tournament to begin monitoring registrations.</p><Link href="/admin/tournaments/new" className="mt-4 inline-block font-bold text-[#205823]">Create Tournament →</Link></section>}
  </main>;
}
