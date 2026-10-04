import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { listTournaments } from "@/lib/admin/tournaments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tournaments | MVA Admin" };
const display = (date: Date | null, time = false) => date ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", ...(time ? { timeStyle: "short" as const, timeZone: "Asia/Manila" } : { timeZone: "UTC" }) }).format(date) : "—";

export default async function TournamentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const query = await searchParams;
  const page = Number(query.page || 1);
  const { items, total, page: current } = await listTournaments(page);
  return <main className="space-y-6 pb-16">
    <header className="flex flex-col gap-4 rounded-2xl border border-[#DDE3DE] bg-white p-6 sm:flex-row sm:items-center sm:justify-between">
      <div><p className="text-xs font-bold uppercase tracking-widest text-[#A47415]">League management</p>
        <h1 className="mt-1 text-3xl font-extrabold text-[#205823]">Tournaments</h1>
        <p className="mt-1 text-sm text-[#5F6B61]">Manage MVA competitions and their divisions.</p></div>
      <Link href="/admin/tournaments/new" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-[#205823] px-5 font-bold text-white">Create Tournament</Link>
    </header>
    {items.length === 0 ? <section className="rounded-2xl border border-[#DDE3DE] bg-white p-8 text-center" aria-label="No tournaments">
      <h2 className="text-xl font-bold text-[#205823]">No tournaments yet</h2><p className="mt-2 text-[#5F6B61]">Create the first tournament to begin managing divisions.</p>
    </section> : <ul className="grid gap-4 xl:grid-cols-2">{items.map(item => <li key={item.id} className="rounded-2xl border border-[#DDE3DE] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-[#A47415]">{item.year ?? "Year not set"}</p>
        <h2 className="text-xl font-bold text-[#205823]"><Link className="inline-flex min-h-11 items-center underline-offset-4 hover:underline" href={`/admin/tournaments/${item.id}`}>{item.name}</Link></h2></div>
        <span className="rounded-full bg-[#E9F2E9] px-3 py-1 text-xs font-bold text-[#205823]">{item.status.replaceAll("_", " ")}</span></div>
      <dl className="mt-3 grid gap-2 text-sm text-[#3D4B3F] sm:grid-cols-2">
        <div><dt className="font-semibold">Registration</dt><dd>{display(item.registration_open_at, true)} – {display(item.registration_close_at, true)}</dd></div>
        <div><dt className="font-semibold">Tournament</dt><dd>{display(item.start_date)} – {display(item.end_date)}</dd></div>
        <div><dt className="font-semibold">Divisions</dt><dd>{item._count.league_categories}</dd></div>
        <div><dt className="font-semibold">Registrations</dt><dd>{item._count.registrations}</dd></div>
      </dl>
    </li>)}</ul>}
    {total > 20 && <nav aria-label="Tournament pages" className="flex gap-3">
      {current > 1 && <Link className="inline-flex min-h-11 items-center rounded-lg border px-4" href={`?page=${current - 1}`}>Previous</Link>}
      {current * 20 < total && <Link className="inline-flex min-h-11 items-center rounded-lg border px-4" href={`?page=${current + 1}`}>Next</Link>}
    </nav>}
  </main>;
}
