"use client";

import React, { useState, useEffect, useTransition } from "react";
import { updatePlayerDetailsAction } from "@/app/admin/(portal)/registrations/[id]/player-edit-actions";

export interface EditPlayerTarget {
  registrationId: string;
  registrationPlayerId: string;
  playerId: string;
  teamSlug?: string;

  // Personal Information
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
  contactNumber: string | null;
  dateOfBirth: Date | null;
  registrationCount: number;

  // Roster Information
  jerseyNumber: number | null;
  position: string | null;
  isCaptain: boolean;
}

interface EditPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  player: EditPlayerTarget | null;
}

interface DialogContentProps {
  player: EditPlayerTarget;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditPlayerDialogContent({
  player,
  onClose,
  onSuccess,
}: DialogContentProps) {
  // Personal Info Form State
  const [firstName, setFirstName] = useState(player.firstName);
  const [middleName, setMiddleName] = useState(player.middleName || "");
  const [lastName, setLastName] = useState(player.lastName);
  const [suffix, setSuffix] = useState(player.suffix || "");
  const [contactNumber, setContactNumber] = useState(
    player.contactNumber || ""
  );
  const [dateOfBirth, setDateOfBirth] = useState<string>(
    player.dateOfBirth
      ? new Date(player.dateOfBirth).toISOString().split("T")[0]
      : ""
  );

  // Roster Info Form State
  const [jerseyNumber, setJerseyNumber] = useState<string>(
    player.jerseyNumber !== null ? String(player.jerseyNumber) : ""
  );
  const [position, setPosition] = useState(player.position || "");
  const [isCaptain, setIsCaptain] = useState(player.isCaptain);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Handle ESC key press and body overflow
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isPending, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const trimmedFirst = firstName.trim();
    if (!trimmedFirst) {
      setErrorMessage("First name is required.");
      return;
    }

    const trimmedLast = lastName.trim();
    if (!trimmedLast) {
      setErrorMessage("Last name is required.");
      return;
    }

    let parsedJersey: number | null = null;
    if (jerseyNumber.trim() !== "") {
      const num = Number(jerseyNumber);
      if (isNaN(num) || !Number.isInteger(num) || num < 0 || num > 99) {
        setErrorMessage("Jersey number must be a whole number between 0 and 99.");
        return;
      }
      parsedJersey = num;
    }

    startTransition(async () => {
      try {
        const result = await updatePlayerDetailsAction({
          registrationId: player.registrationId,
          registrationPlayerId: player.registrationPlayerId,
          playerId: player.playerId,
          teamSlug: player.teamSlug,
          firstName: trimmedFirst,
          middleName: middleName.trim() || null,
          lastName: trimmedLast,
          suffix: suffix.trim() || null,
          contactNumber: contactNumber.trim() || null,
          dateOfBirth: dateOfBirth ? dateOfBirth : null,
          jerseyNumber: parsedJersey,
          position: position.trim() || null,
          isCaptain,
        });

        if (result.success) {
          setSuccessMessage("Player details updated successfully.");
          setTimeout(() => {
            if (onSuccess) onSuccess();
            onClose();
          }, 600);
        } else {
          setErrorMessage(result.message);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while saving player changes.";
        setErrorMessage(message);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-player-title"
      className="relative w-full max-w-lg bg-white rounded-2xl border border-[#DDE3DE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
    >
      {/* Modal Header */}
      <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between gap-4 bg-[#FAFAF8]">
        <div>
          <h2
            id="edit-player-title"
            className="text-lg font-extrabold text-[#172019]"
          >
            Edit Player Details
          </h2>
          <p className="text-xs text-[#5F6B61] mt-0.5">
            Safely correct personal information and tournament roster metadata.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="text-[#5F6B61] hover:text-[#172019] p-2 rounded-lg hover:bg-neutral-200/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
          aria-label="Close dialog"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Form Content */}
      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
        {/* Global Player Notice if in multiple registrations */}
        {player.registrationCount > 1 && (
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-3.5 text-xs text-blue-950 flex items-start gap-2.5">
            <svg
              className="w-4 h-4 text-blue-700 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="space-y-0.5">
              <span className="font-bold text-blue-900 block">
                Shared Player Profile
              </span>
              <p className="text-[11px] leading-relaxed text-blue-900">
                This player profile appears in {player.registrationCount} registrations. Changes to personal information will appear in those registrations as well. Roster fields (jersey number, position, captaincy) apply only to this team.
              </p>
            </div>
          </div>
        )}

        {/* SECTION 1: PERSONAL INFORMATION */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-[#205823] border-b border-[#DDE3DE] pb-1 w-full">
            Personal Information (Player Profile)
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-player-firstname"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                First Name <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-player-firstname"
                type="text"
                required
                maxLength={100}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="edit-player-middlename"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Middle Name <span className="text-[11px] font-normal text-[#5F6B61]">(Optional)</span>
              </label>
              <input
                id="edit-player-middlename"
                type="text"
                maxLength={100}
                value={middleName}
                onChange={(e) => setMiddleName(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="edit-player-lastname"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Last Name <span className="text-red-500">*</span>
              </label>
              <input
                id="edit-player-lastname"
                type="text"
                required
                maxLength={100}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="edit-player-suffix"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Suffix <span className="text-[11px] font-normal text-[#5F6B61]">(Jr., III, etc.)</span>
              </label>
              <input
                id="edit-player-suffix"
                type="text"
                maxLength={20}
                placeholder="e.g. Jr."
                value={suffix}
                onChange={(e) => setSuffix(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="edit-player-contact"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Contact Number <span className="text-[11px] font-normal text-[#5F6B61]">(Optional)</span>
              </label>
              <input
                id="edit-player-contact"
                type="tel"
                maxLength={30}
                placeholder="0912 345 6789"
                value={contactNumber}
                onChange={(e) => setContactNumber(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label
                htmlFor="edit-player-dob"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Date of Birth <span className="text-[11px] font-normal text-[#5F6B61]">(Optional)</span>
              </label>
              <input
                id="edit-player-dob"
                type="date"
                value={dateOfBirth}
                onChange={(e) => setDateOfBirth(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>
          </div>
        </fieldset>

        {/* SECTION 2: ROSTER INFORMATION */}
        <fieldset className="space-y-4">
          <legend className="text-xs font-bold uppercase tracking-wider text-[#205823] border-b border-[#DDE3DE] pb-1 w-full">
            Tournament Roster Information
          </legend>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="edit-player-jersey"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Jersey Number <span className="text-[11px] font-normal text-[#5F6B61]">(0–99)</span>
              </label>
              <input
                id="edit-player-jersey"
                type="number"
                min={0}
                max={99}
                placeholder="e.g. 7"
                value={jerseyNumber}
                onChange={(e) => setJerseyNumber(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all font-mono"
              />
            </div>

            <div>
              <label
                htmlFor="edit-player-position"
                className="block text-xs font-semibold text-[#172019] mb-1"
              >
                Position <span className="text-[11px] font-normal text-[#5F6B61]">(Optional)</span>
              </label>
              <input
                id="edit-player-position"
                type="text"
                maxLength={50}
                placeholder="e.g. Setter, Outside Hitter"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                disabled={isPending}
                className="w-full px-3 py-2 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
              />
            </div>
          </div>

          {/* Captain Toggle */}
          <div className="pt-2">
            <label className="relative flex items-start gap-3 p-3 rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] hover:bg-[#FAFAF8]/80 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={isCaptain}
                onChange={(e) => setIsCaptain(e.target.checked)}
                disabled={isPending}
                className="w-4 h-4 mt-0.5 text-[#205823] rounded border-[#DDE3DE] focus:ring-[#205823] focus:ring-2 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-[#172019] block">
                  Designate as Team Captain
                </span>
                <span className="text-[#5F6B61] block text-[11px] mt-0.5">
                  If selected, any previously designated captain on this roster will automatically be unassigned.
                </span>
              </div>
            </label>
          </div>
        </fieldset>

        {/* Feedback Messages */}
        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-start gap-2"
          >
            <svg
              className="w-4 h-4 text-red-500 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div
            role="status"
            className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2"
          >
            <svg
              className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Actions */}
        <div className="pt-4 border-t border-[#DDE3DE] flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-[#DDE3DE] text-xs font-semibold text-[#172019] bg-white hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#205823] text-white text-xs font-bold hover:bg-[#18441a] transition-all shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isPending ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span>Saving Changes...</span>
              </>
            ) : (
              <span>Save Changes</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export function EditPlayerModal({
  isOpen,
  onClose,
  onSuccess,
  player,
}: EditPlayerModalProps) {
  if (!isOpen || !player) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <EditPlayerDialogContent
        player={player}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </div>
  );
}
