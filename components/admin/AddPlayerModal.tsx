"use client";

import React, { useState, useTransition } from "react";
import { addPlayerToRosterAction } from "@/app/admin/(portal)/registrations/[id]/roster-actions";

interface AddPlayerModalProps {
  registrationId: string;
  registrationCode: string;
  teamName: string;
}

const COMMON_POSITIONS = [
  "Setter",
  "Outside Hitter",
  "Opposite Hitter",
  "Middle Blocker",
  "Libero",
  "Defensive Specialist",
  "Utility",
];

export function AddPlayerModal({
  registrationId,
  registrationCode,
  teamName,
}: AddPlayerModalProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [suffix, setSuffix] = useState("");
  const [jerseyNumber, setJerseyNumber] = useState("");
  const [position, setPosition] = useState("");
  const [isCaptain, setIsCaptain] = useState(false);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpen = () => {
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setSuffix("");
    setJerseyNumber("");
    setPosition("");
    setIsCaptain(false);
    setErrorMsg(null);
    setIsOpen(true);
  };

  const handleClose = () => {
    if (isPending) return;
    setIsOpen(false);
    setErrorMsg(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setErrorMsg("First name is strictly required.");
      return;
    }

    const trimmedLast = lastName.trim();
    if (!trimmedLast) {
      setErrorMsg("Last name is strictly required.");
      return;
    }

    let parsedJersey: number | null = null;
    if (jerseyNumber.trim() !== "") {
      const num = Number(jerseyNumber);
      if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 99) {
        setErrorMsg("Jersey number must be a valid number between 0 and 99.");
        return;
      }
      parsedJersey = num;
    }

    startTransition(async () => {
      const result = await addPlayerToRosterAction({
        registrationId,
        firstName: trimmedFirst,
        middleName: middleName.trim() || null,
        lastName: trimmedLast,
        suffix: suffix.trim() || null,
        jerseyNumber: parsedJersey,
        position: position.trim() || null,
        isCaptain,
      });

      if (!result.success) {
        setErrorMsg(result.message);
      } else {
        setIsOpen(false);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#205823] text-white hover:bg-[#1a471c] active:scale-[0.98] transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-1"
      >
        <svg
          className="w-3.5 h-3.5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M12 4v16m8-8H4"
          />
        </svg>
        <span>Add Player</span>
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="add-player-title"
        >
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between bg-[#FAFAF8]">
              <div>
                <h3
                  id="add-player-title"
                  className="text-base font-bold text-[#172019]"
                >
                  Add Player to Official Roster
                </h3>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  {teamName} • <span className="font-mono">{registrationCode}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="text-[#5F6B61] hover:text-[#172019] p-1.5 rounded-lg hover:bg-black/5 transition-colors disabled:opacity-50"
                aria-label="Close dialog"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 overflow-y-auto">
              {errorMsg && (
                <div
                  className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium flex items-start gap-2"
                  role="alert"
                >
                  <svg
                    className="w-4 h-4 text-red-600 shrink-0 mt-0.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Informational banner */}
              <div className="p-3 bg-[#eef5ef] border border-[#205823]/20 rounded-xl text-xs text-[#205823] space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Immediate Roster Addition</span>
                </div>
                <p className="text-[11px] text-[#172019] leading-relaxed">
                  The player will immediately become an official roster member and be assessed an initial <strong>₱300.00 unpaid (pending)</strong> registration fee.
                </p>
              </div>

              {/* Names Section */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="player-first-name"
                    className="block text-xs font-bold text-[#172019] mb-1"
                  >
                    First Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="player-first-name"
                    type="text"
                    required
                    disabled={isPending}
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Juan"
                    className="w-full text-xs px-3 py-2 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#205823] focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="player-middle-name"
                    className="block text-xs font-bold text-[#172019] mb-1"
                  >
                    Middle Name <span className="text-xs text-[#5F6B61] font-normal">(optional)</span>
                  </label>
                  <input
                    id="player-middle-name"
                    type="text"
                    disabled={isPending}
                    value={middleName}
                    onChange={(e) => setMiddleName(e.target.value)}
                    placeholder="e.g. Santos"
                    className="w-full text-xs px-3 py-2 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#205823] focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="player-last-name"
                    className="block text-xs font-bold text-[#172019] mb-1"
                  >
                    Last Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="player-last-name"
                    type="text"
                    required
                    disabled={isPending}
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Dela Cruz"
                    className="w-full text-xs px-3 py-2 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#205823] focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="player-suffix"
                    className="block text-xs font-bold text-[#172019] mb-1"
                  >
                    Suffix <span className="text-xs text-[#5F6B61] font-normal">(optional)</span>
                  </label>
                  <input
                    id="player-suffix"
                    type="text"
                    disabled={isPending}
                    value={suffix}
                    onChange={(e) => setSuffix(e.target.value)}
                    placeholder="e.g. Jr., III"
                    className="w-full text-xs px-3 py-2 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#205823] focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              {/* Roster Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#DDE3DE]/60">
                <div>
                  <label
                    htmlFor="player-jersey"
                    className="block text-xs font-bold text-[#172019] mb-1"
                  >
                    Jersey Number <span className="text-xs text-[#5F6B61] font-normal">(0-99)</span>
                  </label>
                  <input
                    id="player-jersey"
                    type="number"
                    min={0}
                    max={99}
                    disabled={isPending}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="e.g. 7"
                    className="w-full text-xs px-3 py-2 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#205823] focus:bg-white transition-all disabled:opacity-50"
                  />
                </div>

                <div>
                  <label
                    htmlFor="player-position"
                    className="block text-xs font-bold text-[#172019] mb-1"
                  >
                    Position <span className="text-xs text-[#5F6B61] font-normal">(optional)</span>
                  </label>
                  <input
                    id="player-position"
                    type="text"
                    list="positions-list"
                    disabled={isPending}
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    placeholder="e.g. Setter"
                    className="w-full text-xs px-3 py-2 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#205823] focus:bg-white transition-all disabled:opacity-50"
                  />
                  <datalist id="positions-list">
                    {COMMON_POSITIONS.map((pos) => (
                      <option key={pos} value={pos} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* Captain Checkbox */}
              <div className="pt-2">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={isPending}
                    checked={isCaptain}
                    onChange={(e) => setIsCaptain(e.target.checked)}
                    className="w-4 h-4 rounded text-[#205823] focus:ring-[#205823] border-[#DDE3DE]"
                  />
                  <span className="text-xs font-bold text-[#172019]">
                    Assign as Team Captain
                  </span>
                </label>
                <p className="text-[11px] text-[#5F6B61] pl-6">
                  Designates this player as the official captain for this tournament registration.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-[#DDE3DE]">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isPending}
                  className="px-4 py-2 text-xs font-semibold text-[#5F6B61] hover:text-[#172019] hover:bg-black/5 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-[#205823] text-white hover:bg-[#1a471c] active:scale-[0.98] transition-all disabled:opacity-50 shadow-xs"
                >
                  {isPending ? (
                    <>
                      <svg
                        className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span>Adding Player...</span>
                    </>
                  ) : (
                    <span>Add Player</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
