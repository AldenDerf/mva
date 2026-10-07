import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/admin";
import { canAdminRegisterTeam } from "@/lib/registration-lifecycle";
import { getRegistrationMonitoring } from "@/lib/admin/registration-monitoring";
import { CountGrid, TeamBreakdown } from "@/components/admin/RegistrationMonitoring";
import { RowActionsMenu } from "@/components/admin/RowActionsMenu";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function DivisionRegistrationPage({ params, searchParams }: {
  params: Promise<{ tournamentId: string; divisionId: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAdmin();
  const { tournamentId, divisionId } = await params;
  if (!uuid.test(tournamentId) || !uuid.test(divisionId)) notFound();
  const [tournament] = await getRegistrationMonitoring(tournamentId);
  const division = tournament?.divisions.find(item => item.id === divisionId);
  if (!tournament || !division) notFound();
  const query = (await searchParams).q?.trim() ?? "";
  const teams = query ? division.teamsList.filter(item => `${item.name} ${item.code} ${item.status}`.toLowerCase().includes(query.toLowerCase())) : division.teamsList;
  return <main className="space-y-6 pb-12">
    <nav aria-label="Breadcrumb" className="text-sm"><Link href="/admin/registrations" className="text-[#205823] hover:underline">Registrations</Link><span className="mx-2">/</span><Link href={`/admin/registrations/tournaments/${tournament.id}`} className="text-[#205823] hover:underline">{tournament.name}</Link><span className="mx-2">/</span>{division.name}</nav>
    <header className="rounded-2xl border border-[#DDE3DE] bg-white p-5"><p className="text-xs font-bold uppercase text-[#A47415]">Registration monitoring</p><h1 className="text-2xl font-extrabold text-[#205823]">{division.name}</h1><p className="mt-1 text-sm text-[#5F6B61]">{tournament.name}</p>
      {canAdminRegisterTeam(tournament.status as Parameters<typeof canAdminRegisterTeam>[0]) && <Link href={`/admin/registrations/new?tournamentId=${tournament.id}`} className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#205823] px-4 text-sm font-bold text-white">Register Team</Link>}
    </header>
    <CountGrid counts={division} links={{ Teams: "#teams", Players: "#players", Verified: "#verified", Pending: "#pending" }} />
    <section id="breakdown" className="grid gap-3 md:grid-cols-3">
      {([ ["players", "Players", "players"], ["verified", "Verified", "verifiedPlayers"], ["pending", "Pending / Unverified", "pendingPlayers"] ] as const).map(([anchor, title, key]) => <div id={anchor} key={anchor} className="scroll-mt-6 rounded-2xl border border-[#DDE3DE] bg-white p-4"><h2 className="font-bold text-[#172019]">{title} by team</h2><TeamBreakdown teams={division.teamsList} metric={key} /></div>)}
    </section>
    <section id="teams" className="scroll-mt-6 space-y-3"><div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-xl font-extrabold text-[#172019]">Teams</h2><form className="flex gap-2" action=""><label htmlFor="team-search" className="sr-only">Search teams</label><input id="team-search" name="q" defaultValue={query} placeholder="Team, code, or status" className="min-h-11 rounded-lg border border-[#B7C7B9] bg-white px-3 text-sm"/><button className="min-h-11 rounded-lg bg-[#205823] px-4 text-sm font-bold text-white">Search</button></form></div>
      {teams.length ? <><div className="hidden overflow-x-auto rounded-2xl border border-[#DDE3DE] bg-white md:block"><table className="w-full text-left text-sm"><thead className="bg-[#FAFAF8] text-[#5F6B61]"><tr>{["Team", "Players", "Verified", "Pending", "Registration Status", "Actions"].map(label => <th key={label} scope="col" className="px-4 py-3">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#DDE3DE]">{teams.map(team => <tr key={team.id}><th scope="row" className="px-4 py-3 text-left"><Link href={`/admin/registrations/${team.id}`} className="font-bold text-[#205823] hover:underline">{team.name}</Link><span className="block text-xs font-normal text-[#5F6B61]">{team.code}</span>{team.needsPaymentReview > 0 && <span className="text-xs font-bold text-amber-800">Needs payment review</span>}</th><td className="px-4 py-3">{team.players}</td><td className="px-4 py-3">{team.verifiedPlayers}</td><td className="px-4 py-3">{team.pendingPlayers}</td><td className="px-4 py-3">{team.status.replaceAll("_", " ")}</td><td className="px-4 py-3"><RowActionsMenu label={`Actions for ${team.name}`} items={[{ label: "View Details", href: `/admin/registrations/${team.id}` }, { label: "Manage Players", href: `/admin/registrations/${team.id}#roster` }, { label: "View Payments", href: `/admin/registrations/${team.id}#payment-records` }]} /></td></tr>)}</tbody></table></div>
        <div className="grid gap-3 md:hidden">{teams.map(team => <article key={team.id} className="rounded-2xl border border-[#DDE3DE] bg-white p-4"><div className="flex justify-between gap-2"><Link href={`/admin/registrations/${team.id}`} className="font-bold text-[#205823]">{team.name}</Link><RowActionsMenu label={`Actions for ${team.name}`} items={[{ label: "View Details", href: `/admin/registrations/${team.id}` }, { label: "Manage Players", href: `/admin/registrations/${team.id}#roster` }, { label: "View Payments", href: `/admin/registrations/${team.id}#payment-records` }]} /></div><p className="mt-2 text-sm">{team.players} Players · {team.verifiedPlayers} Verified · {team.pendingPlayers} Pending</p><p className="mt-1 text-xs text-[#5F6B61]">{team.status.replaceAll("_", " ")}</p>{team.needsPaymentReview > 0 && <p className="mt-1 text-xs font-bold text-amber-800">Needs payment review</p>}</article>)}</div></>
        : <div className="rounded-2xl border border-dashed border-[#DDE3DE] bg-white p-6 text-sm">{query ? "No teams match your search." : "No teams registered in this division yet."}{query && <Link href="?" className="ml-2 font-bold text-[#205823]">Clear search</Link>}</div>}
    </section>
  </main>;
}
