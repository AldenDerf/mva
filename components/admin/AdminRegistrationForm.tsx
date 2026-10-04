"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { createAdminRegistrationAction } from "@/app/admin/(portal)/registrations/new/actions";
import type { PlayerSex } from "@/lib/player-sex";

type Choice = { id: string; name: string; year: number | null; status: string;
  divisions: Array<{ id: string; name: string; fee: number; minPlayers: number; maxPlayers: number }> };
type PlayerRow = { id: number; first_name: string; middle_name: string; last_name: string; suffix: string; sex: PlayerSex | "" };
const field = "min-h-11 w-full rounded-lg border border-[#B7C7B9] bg-white px-3 py-2 text-[#172019] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#205823]";

export function AdminRegistrationForm({ choices, admin, initialTournamentId }: { choices: Choice[]; admin: { displayName: string; email: string }; initialTournamentId?: string }) {
  const [state, action, pending] = useActionState(createAdminRegistrationAction, {});
  const [leagueId, setLeagueId] = useState(initialTournamentId ?? choices[0]?.id ?? "");
  const league = choices.find(item => item.id === leagueId);
  const [divisionId, setDivisionId] = useState(league?.divisions[0]?.id ?? "");
  const [players, setPlayers] = useState<PlayerRow[]>([{ id: 1, first_name: "", middle_name: "", last_name: "", suffix: "", sex: "" }]);
  const [nextId, setNextId] = useState(2);
  const [captainId, setCaptainId] = useState(1);
  const newestPlayerId = useRef<number | null>(null);
  const division = league?.divisions.find(item => item.id === divisionId);
  useEffect(() => {
    const id = newestPlayerId.current;
    if (id === null || !players.some(player => player.id === id)) return;
    newestPlayerId.current = null;
    const input = document.getElementById(`first_name-${id}`);
    input?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "center" });
    input?.focus({ preventScroll: true });
  }, [players]);
  const update = (id: number, patch: Partial<PlayerRow>) => setPlayers(rows => rows.map(row => row.id === id ? { ...row, ...patch } : row));
  const add = () => { newestPlayerId.current = nextId; setPlayers(rows => [...rows, { id: nextId, first_name: "", middle_name: "", last_name: "", suffix: "", sex: "" }]); setNextId(id => id + 1); };
  const remove = (id: number) => {
    const remaining = players.filter(row => row.id !== id);
    setPlayers(remaining);
    if (captainId === id) setCaptainId(remaining[0]?.id ?? 0);
  };
  if (!choices.length) return <div className="rounded-2xl border border-[#DDE3DE] bg-white p-8">
    <h2 className="text-lg font-bold text-[#205823]">No tournaments available</h2>
    <p className="mt-2 text-sm text-[#5F6B61]">Create a tournament and division before registering a team.</p>
    <Link href="/admin/tournaments/new" className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-[#205823] px-5 font-bold text-white">Create Tournament</Link>
  </div>;
  return <form action={action} className="max-w-4xl space-y-6 pb-32 sm:pb-28">
    {state.message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{state.message}</p>}
    <section className="space-y-4 rounded-2xl border border-[#DDE3DE] bg-white p-5 sm:p-6">
      <h2 className="text-xl font-bold text-[#205823]">Tournament and team</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label htmlFor="league_id" className="mb-1 block text-sm font-semibold">Tournament</label>
          <select id="league_id" name="league_id" value={leagueId} onChange={event => { const next = choices.find(item => item.id === event.target.value); setLeagueId(event.target.value); setDivisionId(next?.divisions[0]?.id ?? ""); }} className={field} required>
            {choices.map(item => <option key={item.id} value={item.id}>{item.name} ({item.status.replaceAll("_", " ")})</option>)}
          </select></div>
        <div><label htmlFor="league_category_id" className="mb-1 block text-sm font-semibold">Division</label>
          <select id="league_category_id" name="league_category_id" value={divisionId} onChange={event => setDivisionId(event.target.value)} className={field} required disabled={!league?.divisions.length} aria-describedby={!league?.divisions.length ? "missing-division" : undefined}>
            {!league?.divisions.length && <option value="">No divisions available</option>}
            {league?.divisions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></div>
      </div>
      {league && league.divisions.length === 0 && <div id="missing-division" role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">This tournament has no divisions yet.</p><p>Add a division before registering a team.</p><Link href={`/admin/tournaments/${league.id}/divisions/new`} className="mt-2 inline-flex min-h-11 items-center font-bold text-[#205823] underline">Add Division</Link></div>}
      <p className="text-sm text-[#5F6B61]">Administrators may register into valid tournaments even when public registration is closed. Existing team names are reused.</p>
      <div><label htmlFor="team_name" className="mb-1 block text-sm font-semibold">Team Name</label>
        <input id="team_name" name="team_name" required maxLength={150} className={field} /></div>
    </section>
    <section className="space-y-3 rounded-2xl border border-[#DDE3DE] bg-white p-5 sm:p-6">
      <h2 className="text-xl font-bold text-[#205823]">Registered by</h2>
      <p className="font-semibold text-[#172019]">{admin.displayName} <span className="text-sm font-normal text-[#5F6B61]">· Administrator</span></p>
      {admin.email && <p className="break-all text-sm text-[#5F6B61]">{admin.email}</p>}
      <p className="text-sm text-[#5F6B61]">Your authenticated admin account is recorded as the encoder. The team captain is selected below.</p>
      <div><label htmlFor="registrant_contact" className="mb-1 block text-sm font-semibold">Contact number for this registration</label>
        <input id="registrant_contact" name="registrant_contact" type="tel" required maxLength={30} className={field} />
        <p className="mt-1 text-xs text-[#5F6B61]">Required by the existing registration record; your admin profile has no contact number.</p></div>
    </section>
    <section className="space-y-4 rounded-2xl border border-[#DDE3DE] bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-[#205823]">Players · {players.length} added</h2>
        {division && <p className="text-sm text-[#5F6B61]">Minimum {division.minPlayers} · Maximum {division.maxPlayers} for this division</p>}</div>
        <button type="button" onClick={add} className="min-h-11 rounded-lg border border-[#205823] px-4 font-bold text-[#205823]">Add Player</button></div>
      <p className="text-sm text-[#5F6B61]">Sex is optional. A reused player keeps their recorded value; a missing value can be completed here. Correct a conflicting value in the player profile first.</p>
      {players.map((player, index) => <div key={player.id} className="space-y-3 rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="font-bold">Player {index + 1}{captainId === player.id && <span className="ml-2 text-xs font-semibold text-[#205823]">Captain</span>}</h3>
          {players.length > 1 && <button type="button" onClick={() => remove(player.id)} className="min-h-11 rounded-lg px-3 text-sm font-semibold text-red-700">Remove</button>}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          {([ ["first_name", "First Name"], ["middle_name", "Middle Name (optional)"], ["last_name", "Last Name"], ["suffix", "Suffix (optional)"] ] as const).map(([key, label]) =>
            <div key={key}><label htmlFor={`${key}-${player.id}`} className="mb-1 block text-sm font-semibold">{label}</label>
              <input id={`${key}-${player.id}`} value={player[key]} onChange={event => update(player.id, { [key]: event.target.value })}
                required={key === "first_name" || key === "last_name"} maxLength={key === "suffix" ? 20 : 100} className={field} /></div>)}
          <div><label htmlFor={`sex-${player.id}`} className="mb-1 block text-sm font-semibold">Sex (optional)</label>
            <select id={`sex-${player.id}`} value={player.sex} onChange={event => update(player.id, { sex: event.target.value as PlayerSex | "" })} className={field}>
              <option value="">Not recorded</option><option value="MALE">Male</option><option value="FEMALE">Female</option>
            </select></div>
        </div>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#205823]"><input type="radio" name="captain" checked={captainId === player.id} onChange={() => setCaptainId(player.id)} />{captainId === player.id ? "Team Captain" : "Set as Team Captain"}</label>
      </div>)}
      <div className="flex justify-center border-t border-[#DDE3DE] pt-4"><button type="button" onClick={add} className="min-h-11 rounded-lg border border-[#205823] px-5 font-bold text-[#205823] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#205823]">+ Add Another Player</button></div>
      <input type="hidden" name="players" value={JSON.stringify(players.map(player => ({
        first_name: player.first_name, middle_name: player.middle_name || null, last_name: player.last_name,
        suffix: player.suffix || null,
        sex: player.sex || null, is_captain: player.id === captainId,
      })))} />
    </section>
    <div className="fixed bottom-0 left-0 right-0 z-20 flex flex-wrap items-center justify-between gap-3 border-t border-[#DDE3DE] bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] backdrop-blur-sm lg:left-64 lg:px-8 xl:left-72" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
      <Link href="/admin/registrations" className="inline-flex min-h-11 items-center rounded-lg border border-[#B7C7B9] px-5 font-semibold text-[#205823]">Cancel</Link>
      <button type="submit" disabled={pending || !divisionId} aria-describedby={!divisionId ? "register-disabled-reason" : undefined} className="min-h-11 rounded-lg bg-[#205823] px-6 font-bold text-white disabled:opacity-60">{pending ? "Registering…" : "Register Team"}</button>{!divisionId && <span id="register-disabled-reason" className="sr-only">Add a division before registering a team.</span>}</div>
  </form>;
}
