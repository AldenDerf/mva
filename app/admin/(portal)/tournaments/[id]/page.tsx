import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { getTournament } from "@/lib/admin/tournaments";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const display = (date: Date | null, time = false) => date ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", ...(time ? { timeStyle: "short" as const, timeZone: "Asia/Manila" } : { timeZone: "UTC" }) }).format(date) : "Not set";

export default async function TournamentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;
  if (!uuid.test(id)) notFound();
  const tournament = await getTournament(id);
  if (!tournament) notFound();
  return <main className="space-y-6 pb-16">
    <Link href="/admin/tournaments" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#205823]">← Tournaments</Link>
    <header className="rounded-2xl border border-[#DDE3DE] bg-white p-6">
      <p className="text-xs font-bold uppercase tracking-wider text-[#A47415]">{tournament.year ?? "Year not set"} · {tournament.status.replaceAll("_", " ")}</p>
      <h1 className="mt-2 text-3xl font-extrabold text-[#205823]">{tournament.name}</h1>
      <div className="mt-5 flex flex-wrap gap-3"><Link href={`/admin/tournaments/${id}/edit`} className="inline-flex min-h-11 items-center rounded-lg bg-[#205823] px-5 font-bold text-white">Edit Tournament</Link>
        <span className="inline-flex min-h-11 items-center rounded-lg border border-[#DDE3DE] px-5 text-sm text-[#5F6B61]" aria-label="Add Division available in Phase 06.1B">Add Division · Phase 06.1B</span></div>
    </header>
    <section className="grid gap-4 rounded-2xl border border-[#DDE3DE] bg-white p-6 sm:grid-cols-2" aria-label="Tournament dates">
      <div><h2 className="font-bold text-[#205823]">Registration opens</h2><p>{display(tournament.registration_open_at, true)}</p></div>
      <div><h2 className="font-bold text-[#205823]">Registration closes</h2><p>{display(tournament.registration_close_at, true)}</p></div>
      <div><h2 className="font-bold text-[#205823]">Tournament starts</h2><p>{display(tournament.start_date)}</p></div>
      <div><h2 className="font-bold text-[#205823]">Tournament ends</h2><p>{display(tournament.end_date)}</p></div>
    </section>
    <section className="rounded-2xl border border-[#DDE3DE] bg-white p-6"><h2 className="text-xl font-bold text-[#205823]">Description</h2><p className="mt-2 whitespace-pre-wrap text-[#3D4B3F]">{tournament.description || "No description added."}</p></section>
    <section className="rounded-2xl border border-[#DDE3DE] bg-white p-6"><h2 className="text-xl font-bold text-[#205823]">Divisions ({tournament._count.league_categories})</h2>
      {tournament.league_categories.length ? <ul className="mt-3 divide-y divide-[#DDE3DE]">{tournament.league_categories.map(category =>
        <li key={category.id} className="py-3"><strong>{category.name}</strong><p className="text-sm text-[#5F6B61]">{category._count.registrations_registrations_league_category_idToleague_categories} registrations{category.description ? ` · ${category.description}` : ""}</p></li>)}</ul>
        : <p className="mt-2 text-[#5F6B61]">No divisions yet. Division creation is planned for Phase 06.1B.</p>}
      <p className="mt-4 text-sm font-semibold text-[#205823]">{tournament._count.registrations} total registrations</p>
    </section>
  </main>;
}
