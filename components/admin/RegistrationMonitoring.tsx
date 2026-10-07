import Link from "next/link";
import type { MonitoringCounts, MonitoringDivision, MonitoringTeam, MonitoringTournament } from "@/lib/admin/registration-monitoring";

export const dateLabel = (date: Date | null) => date
  ? new Intl.DateTimeFormat("en-PH", { dateStyle: "medium", timeZone: "UTC" }).format(date)
  : "Date not set";

export function CountGrid({ counts, links }: {
  counts: MonitoringCounts & { divisions?: number };
  links: Partial<Record<"Divisions" | "Teams" | "Players" | "Verified" | "Pending", string>>;
}) {
  const metrics: Array<[keyof typeof links, number]> = [
    ...(counts.divisions === undefined ? [] : [["Divisions", counts.divisions] as ["Divisions", number]]),
    ["Teams", counts.teams], ["Players", counts.players],
    ["Verified", counts.verifiedPlayers], ["Pending", counts.pendingPlayers],
  ];
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Registration counts">
    {metrics.map(([label, value]) => <Link key={label} href={links[label] ?? "#breakdown"}
      className="rounded-2xl border border-[#DDE3DE] bg-white p-4 shadow-xs hover:border-[#205823] focus-visible:outline-2 focus-visible:outline-[#205823]">
      <span className="block text-xs font-bold uppercase tracking-wide text-[#5F6B61]">{label}</span>
      <span className={`mt-2 block text-3xl font-extrabold ${label === "Pending" && value ? "text-amber-800" : "text-[#205823]"}`}>{value}</span>
      <span className="mt-1 block text-xs text-[#5F6B61]">View breakdown →</span>
    </Link>)}
  </div>;
}

export function TournamentCard({ item }: { item: MonitoringTournament }) {
  const href = `/admin/registrations/tournaments/${item.id}`;
  return <article className="rounded-2xl border border-[#DDE3DE] bg-white p-5 shadow-xs hover:border-[#205823]">
    <Link href={href} className="block rounded focus-visible:outline-2 focus-visible:outline-[#205823]">
      <span className="text-xs font-bold uppercase tracking-wide text-[#A47415]">{item.status.replaceAll("_", " ")}</span>
      <h2 className="mt-1 text-xl font-extrabold text-[#205823]">{item.name}</h2>
      <p className="mt-1 text-sm text-[#5F6B61]">{dateLabel(item.startDate)} – {dateLabel(item.endDate)}</p>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
        {[["Divisions", item.divisions.length], ["Teams", item.teams], ["Players", item.players], ["Verified", item.verifiedPlayers], ["Pending", item.pendingPlayers]].map(([label, value]) =>
          <span key={label} className="rounded-lg bg-[#FAFAF8] p-2"><strong className="block text-lg text-[#172019]">{value}</strong>{label}</span>)}
      </div>
      {item.needsPaymentReview > 0 && <p className="mt-3 text-xs font-bold text-amber-800">{item.needsPaymentReview} team(s) need payment review</p>}
      <span className="mt-4 inline-block text-sm font-bold text-[#205823]">View Tournament →</span>
    </Link>
  </article>;
}

export function DivisionCard({ item, tournamentId }: { item: MonitoringDivision; tournamentId: string }) {
  return <Link href={`/admin/registrations/tournaments/${tournamentId}/divisions/${item.id}`}
    className="block rounded-2xl border border-[#DDE3DE] bg-white p-5 shadow-xs hover:border-[#205823] focus-visible:outline-2 focus-visible:outline-[#205823]">
    <h3 className="text-lg font-extrabold text-[#205823]">{item.name}</h3>
    <p className="mt-2 text-sm text-[#3D4B3F]">{item.teams} Teams · {item.players} Players · {item.verifiedPlayers} Verified · {item.pendingPlayers} Pending</p>
    {item.needsPaymentReview > 0 && <p className="mt-2 text-xs font-bold text-amber-800">{item.needsPaymentReview} team(s) need payment review</p>}
    <span className="mt-3 inline-block text-sm font-bold text-[#205823]">View Division →</span>
  </Link>;
}

export function TeamBreakdown({ teams, metric }: { teams: MonitoringTeam[]; metric: "players" | "verifiedPlayers" | "pendingPlayers" }) {
  const relevant = metric === "pendingPlayers" ? teams.filter(item => item.pendingPlayers || item.needsPaymentReview) : teams;
  return <ul className="divide-y divide-[#DDE3DE]">
    {relevant.length ? relevant.map(team => <li key={team.id} className="flex items-center justify-between gap-3 py-3 text-sm">
      <div><Link href={`/admin/registrations/${team.id}#roster`} className="font-bold text-[#205823] hover:underline">{team.name}</Link>
        {team.needsPaymentReview > 0 && <span className="ml-2 text-xs font-bold text-amber-800">Needs payment review</span>}</div>
      <strong>{team[metric]}</strong>
    </li>) : <li className="py-3 text-sm text-[#5F6B61]">All active players are verified.</li>}
  </ul>;
}
