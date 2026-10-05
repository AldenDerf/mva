"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getMovePlayerDestinationsAction, movePlayerAction } from "@/app/admin/(portal)/registrations/[id]/move-player-actions";

interface Props {
  registrationPlayerId: string;
  playerId: string;
  playerName: string;
  sourceRegistrationId: string;
  sourceTeamName: string;
  tournamentName: string;
  divisionName: string;
  hasVerifiedPayment: boolean;
  isCaptain: boolean;
}

export function MovePlayerButton(props: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<Awaited<ReturnType<typeof getMovePlayerDestinationsAction>>>([]);
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function show() {
    setOpen(true);
    setError("");
    if (props.isCaptain) return;
    startTransition(async () => {
      try { setOptions(await getMovePlayerDestinationsAction(props.sourceRegistrationId, props.playerId)); }
      catch { setError("Unable to load eligible teams."); }
    });
  }

  function submit() {
    startTransition(async () => {
      try {
        const result = await movePlayerAction({
          registrationPlayerId: props.registrationPlayerId,
          sourceRegistrationId: props.sourceRegistrationId,
          destinationRegistrationId: destination,
          reason,
        });
        if (!result.success) { setError(result.message); return; }
        setOpen(false);
        router.refresh();
      } catch { setError("Unable to move this player. Please try again."); }
    });
  }

  return <>
    <button type="button" onClick={show} className="min-h-[36px] rounded-lg border border-[#205823]/30 px-2.5 py-1 text-xs font-semibold text-[#205823] hover:bg-[#eef5ef]">Move</button>
    {open && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="move-player-title">
      <div className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-xl space-y-4">
        <h2 id="move-player-title" className="text-lg font-bold">Move Player</h2>
        <div className="text-sm space-y-1"><p><strong>Player:</strong> {props.playerName}</p><p><strong>From:</strong> {props.sourceTeamName}</p><p><strong>Tournament:</strong> {props.tournamentName}</p><p><strong>Division:</strong> {props.divisionName}</p></div>
        {props.isCaptain ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Reassign the team captain before moving this player.</p> : <>
          <p className="text-xs text-[#5F6B61]">Only teams in the same tournament and division are available.</p>
          <div><label htmlFor={`move-destination-${props.registrationPlayerId}`} className="block text-sm font-semibold">Destination Team</label>
            <select id={`move-destination-${props.registrationPlayerId}`} value={destination} onChange={(event) => setDestination(event.target.value)} disabled={pending} className="mt-1 w-full rounded-lg border p-2 text-sm">
              <option value="">Select team</option>{options.map((option) => <option key={option.id} value={option.id}>{option.teamName} — {option.activePlayerCount} active players</option>)}
            </select></div>
          {!pending && !error && options.length === 0 && <p className="text-sm">No other eligible teams are available in this tournament and division.</p>}
          <div><label htmlFor={`move-reason-${props.registrationPlayerId}`} className="block text-sm font-semibold">Reason</label><textarea id={`move-reason-${props.registrationPlayerId}`} value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} rows={3} className="mt-1 w-full rounded-lg border p-2 text-sm" /></div>
          {props.hasVerifiedPayment && <p className="rounded-lg bg-[#eef5ef] p-3 text-xs">Existing verified payment history will move with this player&apos;s roster membership. No new registration fee will be created.</p>}
        </>}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} disabled={pending} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>{!props.isCaptain && <button type="button" onClick={submit} disabled={pending || !destination || !reason.trim()} className="rounded-lg bg-[#205823] px-4 py-2 text-sm text-white disabled:opacity-50">{pending ? "Moving..." : "Move Player"}</button>}</div>
      </div>
    </div>}
  </>;
}
