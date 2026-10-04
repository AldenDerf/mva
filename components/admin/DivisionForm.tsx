"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveDivision, type DivisionFormState } from "@/app/admin/(portal)/tournaments/[id]/divisions/actions";

type Initial = { id: string; name: string; description: string | null;
  registration_fee: { toString(): string }; min_players: number; max_players: number };
const inputClass = "mt-1 block min-h-11 w-full rounded-lg border border-[#B7C7B9] bg-white px-3 py-2 text-[#172019] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#205823]";

export function DivisionForm({ tournamentId, initial }: { tournamentId: string; initial?: Initial }) {
  const [state, action, pending] = useActionState(saveDivision, { errors: {} } as DivisionFormState);
  const field = (name: string, label: string, type: string, value: string, extra: Record<string, string> = {}) =>
    <div><label htmlFor={name} className="block text-sm font-semibold text-[#205823]">{label}</label>
      <input id={name} name={name} type={type} defaultValue={value} className={inputClass}
        aria-invalid={Boolean(state.errors[name])} aria-describedby={state.errors[name] ? `${name}-error` : undefined}
        {...extra} />
      {state.errors[name] && <p id={`${name}-error`} className="mt-1 text-sm text-red-700">{state.errors[name]}</p>}</div>;
  return <form action={action} className="max-w-3xl space-y-6 rounded-2xl border border-[#DDE3DE] bg-white p-5 shadow-sm sm:p-8">
    <input type="hidden" name="tournament_id" value={tournamentId} />
    <input type="hidden" name="mode" value={initial ? "edit" : "create"} />
    {initial && <input type="hidden" name="division_id" value={initial.id} />}
    {state.message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    {field("name", "Division Name", "text", initial?.name ?? "", { required: "true", maxLength: "100" })}
    <div><label htmlFor="description" className="block text-sm font-semibold text-[#205823]">Description</label>
      <textarea id="description" name="description" rows={4} defaultValue={initial?.description ?? ""} className={inputClass} /></div>
    <div className="grid gap-5 sm:grid-cols-2">
      {field("registration_fee", "Registration Fee (PHP)", "number", initial?.registration_fee.toString() ?? "0", { min: "0", step: "0.01", required: "true" })}
      {field("min_players", "Minimum Players", "number", String(initial?.min_players ?? 6), { min: "1", step: "1", required: "true" })}
      {field("max_players", "Maximum Players", "number", String(initial?.max_players ?? 12), { min: "1", step: "1", required: "true" })}
    </div>
    {initial && <p className="text-sm text-[#5F6B61]">After a team registers, the fee is locked. Player limits must continue to fit every existing roster.</p>}
    <div className="flex flex-wrap gap-3 border-t border-[#DDE3DE] pt-5">
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-[#205823] px-5 py-2 font-bold text-white hover:bg-[#174319] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#205823] disabled:opacity-60">{pending ? "Saving…" : initial ? "Save Division" : "Create Division"}</button>
      <Link href={`/admin/tournaments/${tournamentId}`} className="inline-flex min-h-11 items-center rounded-lg border border-[#B7C7B9] px-5 font-semibold text-[#205823]">Cancel</Link>
    </div>
  </form>;
}
