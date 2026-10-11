import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { canAdminRegisterTeam } from "@/lib/registration-lifecycle";
import { getRegistrationMonitoring } from "@/lib/admin/registration-monitoring";
import { CountGrid, dateLabel, DivisionCard } from "@/components/admin/RegistrationMonitoring";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function TournamentRegistrationPage({ params }: { params: Promise<{ tournamentId: string }> }) {
  await requireAdmin();
  const { tournamentId } = await params;
  if (!uuid.test(tournamentId)) notFound();
  const [item] = await getRegistrationMonitoring(tournamentId);
  if (!item) notFound();
  const base = `/admin/registrations/tournaments/${item.id}`;
  return <main className="space-y-6 pb-12">
    <nav aria-label="Breadcrumb" className="text-sm"><Link href="/admin/registrations" className="font-bold text-[#205823]">Registrations</Link><span className="mx-2 text-[#5F6B61]">/</span>{item.name}</nav>
    <header className="rounded-2xl border border-[#DDE3DE] bg-white p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-[#A47415]">{item.status.replaceAll("_", " ")}</p>
      <h1 className="mt-1 text-2xl font-extrabold text-[#205823]">{item.name}</h1>
      <p className="mt-1 text-sm text-[#5F6B61]">{dateLabel(item.startDate)} – {dateLabel(item.endDate)}</p>
      {item.divisions.length > 0 && canAdminRegisterTeam(item.status as Parameters<typeof canAdminRegisterTeam>[0]) && <Link href={`/admin/registrations/new?tournamentId=${item.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#205823] px-4 text-sm font-bold text-white">Register Team</Link>}
    </header>
    <CountGrid counts={{ ...item, divisions: item.divisions.length }} links={{ Divisions: "#divisions", Teams: "#divisions", Players: "#players", Verified: "#verified", Pending: "#pending" }} />
    <section id="breakdown" className="grid gap-3 md:grid-cols-3">
      {([ ["players", "Players", "players"], ["verified", "Verified", "verifiedPlayers"], ["pending", "Pending / Unverified", "pendingPlayers"] ] as const).map(([anchor, title, key]) =>
        <div id={anchor} key={anchor} className="scroll-mt-6 rounded-2xl border border-[#DDE3DE] bg-white p-4"><h2 className="font-bold text-[#172019]">{title} by division</h2>
          <ul className="mt-2 divide-y divide-[#DDE3DE]">{item.divisions.map(division => <li key={division.id} className="flex justify-between gap-2 py-2 text-sm"><Link href={`${base}/divisions/${division.id}#${anchor}`} className="font-semibold text-[#205823] hover:underline">{division.name}</Link><strong>{division[key]}</strong></li>)}</ul>
          {!item.divisions.length && <p className="mt-2 text-sm text-[#5F6B61]">No divisions yet.</p>}
        </div>)}
    </section>
    <section id="divisions" className="scroll-mt-6"><h2 className="mb-3 text-xl font-extrabold text-[#172019]">Divisions</h2>
      {item.divisions.length ? <div className="grid gap-3 md:grid-cols-2">{item.divisions.map(division => <DivisionCard key={division.id} item={division} tournamentId={item.id} />)}</div>
        : <div className="rounded-2xl border border-dashed border-[#DDE3DE] bg-white p-6"><p>No divisions configured yet.</p><Link href={`/admin/tournaments/${item.id}/divisions/new`} className="mt-3 inline-block font-bold text-[#205823]">Add Division →</Link></div>}
    </section>
  </main>;
}
