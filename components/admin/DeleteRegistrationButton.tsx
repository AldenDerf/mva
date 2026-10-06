"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { registration_status } from "@prisma/client";
import { deleteRegistrationAction } from "@/app/admin/(portal)/registrations/[id]/actions";

export function DeleteRegistrationButton({ registrationId, registrationCode, status }: {
  registrationId: string;
  registrationCode: string;
  status: registration_status;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    startTransition(async () => {
      const result = await deleteRegistrationAction({ registrationId, expectedStatus: status, confirmationCode: confirmation, reason });
      if (result.success) router.replace("/admin/registrations");
      else setError(result.message);
    });
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-rose-300 px-4 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 focus-visible:outline-2 focus-visible:outline-rose-700">Delete Registration</button>
    {open && <div role="dialog" aria-modal="true" aria-labelledby="delete-registration-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
        <h2 id="delete-registration-title" className="text-lg font-bold text-rose-800">Delete Registration Permanently?</h2>
        <p className="text-sm">This will permanently remove this tournament registration and its unpaid assessment records. The reusable team and player profiles will remain. This action cannot be undone.</p>
        <label className="block text-sm font-semibold" htmlFor="delete-reason">Deletion reason</label>
        <textarea id="delete-reason" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} rows={3} className="w-full rounded-lg border p-2" />
        <label className="block text-sm font-semibold" htmlFor="delete-confirmation">Type {registrationCode} to confirm</label>
        <input id="delete-confirmation" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} className="w-full rounded-lg border p-2" autoComplete="off" />
        {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" disabled={pending} onClick={() => { setOpen(false); setError(""); }} className="rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button type="button" disabled={pending || reason.trim().length < 10 || confirmation !== registrationCode} onClick={submit} className="rounded-lg bg-rose-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">Delete Registration</button>
        </div>
      </div>
    </div>}
  </>;
}
