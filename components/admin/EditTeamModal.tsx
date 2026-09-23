"use client";

import React, { useState, useEffect, useTransition } from "react";
import { updateTeamNameAction } from "@/app/admin/(portal)/registrations/[id]/team-edit-actions";

export interface EditTeamTarget {
  id: string;
  name: string;
  slug?: string;
  registrationId?: string;
}

interface EditTeamModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  team: EditTeamTarget | null;
}

interface DialogContentProps {
  team: EditTeamTarget;
  onClose: () => void;
  onSuccess?: () => void;
}

function EditTeamDialogContent({
  team,
  onClose,
  onSuccess,
}: DialogContentProps) {
  const [teamName, setTeamName] = useState(team.name);
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

    const trimmed = teamName.trim();
    if (!trimmed) {
      setErrorMessage("Team name cannot be empty.");
      return;
    }

    if (trimmed.length > 150) {
      setErrorMessage("Team name cannot exceed 150 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await updateTeamNameAction({
          teamId: team.id,
          teamName: trimmed,
          expectedTeamName: team.name,
          registrationId: team.registrationId,
        });

        if (result.success) {
          setSuccessMessage("Team name updated successfully.");
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
            : "An unexpected error occurred while updating the team name.";
        setErrorMessage(message);
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-team-title"
      className="relative w-full max-w-md bg-white rounded-2xl border border-[#DDE3DE] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
    >
      {/* Modal Header */}
      <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between gap-4 bg-[#FAFAF8]">
        <div>
          <h2
            id="edit-team-title"
            className="text-lg font-extrabold text-[#172019]"
          >
            Edit Team Name
          </h2>
          <p className="text-xs text-[#5F6B61] mt-0.5">
            Safely correct the display name of this team.
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
      <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
        {/* Information Notice */}
        <div className="rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] p-3.5 text-xs text-[#5F6B61] flex items-start gap-2.5">
          <svg
            className="w-4 h-4 text-[#205823] shrink-0 mt-0.5"
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
          <p className="text-[11px] leading-relaxed">
            Updating this field changes the displayed team name across registrations. The canonical team web address ({team.slug ? `/teams/${team.slug}` : "URL"}) is strictly preserved.
          </p>
        </div>

        <div>
          <label
            htmlFor="edit-team-name-input"
            className="block text-xs font-semibold text-[#172019] mb-1.5"
          >
            Team Display Name <span className="text-red-500">*</span>
          </label>
          <input
            id="edit-team-name-input"
            type="text"
            required
            maxLength={150}
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            disabled={isPending}
            className="w-full px-3 py-2.5 rounded-xl border border-[#DDE3DE] text-sm text-[#172019] bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all font-medium"
            placeholder="Enter official team name"
          />
        </div>

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
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Team Name</span>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export function EditTeamModal({
  isOpen,
  onClose,
  onSuccess,
  team,
}: EditTeamModalProps) {
  if (!isOpen || !team) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <EditTeamDialogContent
        team={team}
        onClose={onClose}
        onSuccess={onSuccess}
      />
    </div>
  );
}
