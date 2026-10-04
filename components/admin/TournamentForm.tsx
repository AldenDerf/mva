"use client";

import Link from "next/link";
import { useActionState } from "react";
import { saveTournament, type FormState } from "@/app/admin/(portal)/tournaments/actions";

type Initial = { id?: string; name?: string; year?: number | null; description?: string | null;
  registration_open_at?: Date | null; registration_close_at?: Date | null;
  start_date?: Date | null; end_date?: Date | null; status?: string };

const fieldClass = "mt-1 block min-h-11 w-full rounded-lg border border-[#B7C7B9] bg-white px-3 py-2 text-[#172019] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#205823]";
const dateTime = (value?: Date | null) => value ? new Date(value.getTime() + 8 * 60 * 60000).toISOString().slice(0, 16) : "";
const date = (value?: Date | null) => value?.toISOString().slice(0, 10) ?? "";

export function TournamentForm({ initial = {} }: { initial?: Initial }) {
  const [state, action, pending] = useActionState(saveTournament, { errors: {} } as FormState);
  const field = (name: string, label: string, type: string, defaultValue: string, required = false) => (
    <div>
      <label htmlFor={name} className="block text-sm font-semibold text-[#205823]">{label}</label>
      <input id={name} name={name} type={type} required={required} defaultValue={defaultValue}
        aria-invalid={Boolean(state.errors[name])} aria-describedby={state.errors[name] ? `${name}-error` : undefined}
        className={fieldClass} />
      {state.errors[name] && <p id={`${name}-error`} className="mt-1 text-sm text-red-700">{state.errors[name]}</p>}
    </div>
  );
  return <form action={action} className="max-w-3xl space-y-6 rounded-2xl border border-[#DDE3DE] bg-white p-5 shadow-sm sm:p-8">
    <input type="hidden" name="mode" value={initial.id ? "edit" : "create"} />
    {initial.id && <input type="hidden" name="id" value={initial.id} />}
    {state.message && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{state.message}</p>}
    {field("name", "Tournament Name", "text", initial.name ?? "", true)}
    {field("year", "Year", "number", String(initial.year ?? ""))}
    <div><label htmlFor="description" className="block text-sm font-semibold text-[#205823]">Description</label>
      <textarea id="description" name="description" rows={4} defaultValue={initial.description ?? ""} className={fieldClass} /></div>
    <div className="grid gap-5 sm:grid-cols-2">
      <p className="sm:col-span-2 text-sm text-[#5F6B61]">Registration times use Philippine Standard Time (UTC+8).</p>
      {field("registration_open_at", "Registration Open Date/Time", "datetime-local", dateTime(initial.registration_open_at))}
      {field("registration_close_at", "Registration Close Date/Time", "datetime-local", dateTime(initial.registration_close_at))}
      {field("start_date", "Tournament Start Date", "date", date(initial.start_date))}
      {field("end_date", "Tournament End Date", "date", date(initial.end_date))}
    </div>
    <div><label htmlFor="status" className="block text-sm font-semibold text-[#205823]">{initial.id ? "Status" : "Initial Status"}</label>
      <select id="status" name="status" defaultValue={initial.status ?? "DRAFT"} className={fieldClass} aria-invalid={Boolean(state.errors.status)}>
        {(["DRAFT", "OPEN_FOR_REGISTRATION", ...(initial.id ? ["REGISTRATION_CLOSED", "ONGOING", "COMPLETED", "ARCHIVED"] : [])]).map(status =>
          <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select>
      {state.errors.status && <p role="alert" className="text-sm text-red-700">{state.errors.status}</p>}
    </div>
    <div className="flex flex-wrap gap-3 border-t border-[#DDE3DE] pt-5">
      <button type="submit" disabled={pending} className="min-h-11 rounded-lg bg-[#205823] px-5 py-2 font-bold text-white hover:bg-[#174319] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#205823] disabled:opacity-60">{pending ? "Saving…" : initial.id ? "Save Changes" : "Create Tournament"}</button>
      <Link href={initial.id ? `/admin/tournaments/${initial.id}` : "/admin/tournaments"} className="inline-flex min-h-11 items-center rounded-lg border border-[#B7C7B9] px-5 font-semibold text-[#205823]">Cancel</Link>
    </div>
  </form>;
}
