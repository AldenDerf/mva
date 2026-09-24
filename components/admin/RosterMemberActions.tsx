"use client";

import React, { useState, useTransition, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  deleteRosterMemberAction,
  removeRosterMemberAction,
  restoreRosterMemberAction,
} from "@/app/admin/(portal)/registrations/[id]/roster-actions";

export interface RosterMemberActionsProps {
  registrationId: string;
  registrationPlayerId: string;
  playerName: string;
  teamName: string;
  teamSlug?: string;
  status: "ACTIVE" | "REMOVED";
  hasVerifiedPayment: boolean;
  isCaptain: boolean;
  size?: "sm" | "xs";
}

type ModalType = "DELETE" | "REMOVE" | "RESTORE" | "CAPTAIN_WARNING" | null;

export function RosterMemberActions({
  registrationId,
  registrationPlayerId,
  playerName,
  teamName,
  teamSlug,
  status,
  hasVerifiedPayment,
  isCaptain,
  size = "xs",
}: RosterMemberActionsProps) {
  const router = useRouter();
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleCloseModal = useCallback(() => {
    if (isPending) return;
    setActiveModal(null);
    setReason("");
    setErrorMsg(null);
  }, [isPending]);

  // Escape key handler and body overflow lock for modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending && activeModal !== null) {
        handleCloseModal();
      }
    };
    if (activeModal !== null) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [activeModal, isPending, handleCloseModal]);

  const handleOpenRemove = () => {
    setErrorMsg(null);
    setReason("");
    if (isCaptain) {
      setActiveModal("CAPTAIN_WARNING");
      return;
    }
    setActiveModal("REMOVE");
  };

  const handleOpenRestore = () => {
    setErrorMsg(null);
    setReason("");
    setActiveModal("RESTORE");
  };

  const handleOpenDelete = () => {
    setErrorMsg(null);
    setReason("");
    setActiveModal("DELETE");
  };

  const handleConfirmDelete = () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMsg("A reason is strictly required to delete this player.");
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const res = await deleteRosterMemberAction({
        registrationId,
        registrationPlayerId,
        reason: trimmedReason,
        teamSlug,
      });

      if (!res.success) {
        setErrorMsg(res.message);
      } else {
        handleCloseModal();
        router.refresh();
      }
    });
  };

  const handleConfirmRemove = () => {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setErrorMsg("A reason is strictly required to remove this player.");
      return;
    }

    setErrorMsg(null);
    startTransition(async () => {
      const res = await removeRosterMemberAction({
        registrationId,
        registrationPlayerId,
        reason: trimmedReason,
        teamSlug,
      });

      if (!res.success) {
        setErrorMsg(res.message);
      } else {
        handleCloseModal();
        router.refresh();
      }
    });
  };

  const handleConfirmRestore = () => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await restoreRosterMemberAction({
        registrationId,
        registrationPlayerId,
        reason: reason.trim() || undefined,
        teamSlug,
      });

      if (!res.success) {
        setErrorMsg(res.message);
      } else {
        handleCloseModal();
        router.refresh();
      }
    });
  };

  const isXs = size === "xs";

  return (
    <>
      {/* Action Trigger Buttons */}
      {status === "ACTIVE" ? (
        <button
          type="button"
          onClick={handleOpenRemove}
          disabled={isPending}
          aria-label={`Remove ${playerName} from active roster`}
          className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-[#DDE3DE] bg-white text-[#5F6B61] hover:text-amber-800 hover:border-amber-300 hover:bg-amber-50/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700 cursor-pointer shadow-2xs ${
            isXs
              ? "min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 text-xs sm:text-[11px]"
              : "min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs"
          }`}
          title="Remove player from active roster"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
          <span>Remove</span>
        </button>
      ) : (
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleOpenRestore}
            disabled={isPending}
            aria-label={`Restore ${playerName} to active roster`}
            className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-[#205823]/30 bg-white text-[#205823] hover:bg-[#eef5ef] hover:border-[#205823] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer shadow-2xs ${
              isXs
                ? "min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 text-xs sm:text-[11px]"
                : "min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs"
            }`}
            title="Restore player to active roster"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Restore</span>
          </button>

          {!hasVerifiedPayment ? (
            <button
              type="button"
              onClick={handleOpenDelete}
              disabled={isPending}
              aria-label={`Delete ${playerName} from roster`}
              className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-red-200 bg-white text-red-700 hover:bg-red-50 hover:border-red-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 cursor-pointer shadow-2xs ${
                isXs
                  ? "min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 text-xs sm:text-[11px]"
                  : "min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs"
              }`}
              title="Permanently delete removed roster membership"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              aria-disabled="true"
              aria-label={`Delete disabled: Refund ${playerName}'s verified payment before deleting`}
              className={`inline-flex items-center gap-1 font-semibold rounded-lg border border-[#DDE3DE] bg-[#FAFAF8] text-[#5F6B61]/50 cursor-not-allowed opacity-60 shadow-2xs ${
                isXs
                  ? "min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 text-xs sm:text-[11px]"
                  : "min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs"
              }`}
              title="Refund this player's verified payment before deleting."
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              <span>Delete</span>
            </button>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: CAPTAIN REASSIGNMENT WARNING */}
      {/* ========================================================================= */}
      {activeModal === "CAPTAIN_WARNING" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="captain-warning-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#DDE3DE] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 id="captain-warning-title" className="text-base font-bold text-[#172019]">
                  Team Captain Protection
                </h3>
                <p className="text-xs text-[#5F6B61] leading-relaxed">
                  <span className="font-semibold text-[#172019]">{playerName}</span> is currently designated as the team captain.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed space-y-1">
              <p className="font-bold">Reassign the team captain before removing this player.</p>
              <p className="text-[11px] text-amber-800">
                To protect roster leadership integrity, active captains cannot be deleted or removed. Please edit another player to assign captaincy first.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleCloseModal}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl border border-[#DDE3DE] bg-white text-[#172019] hover:bg-[#FAFAF8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: DELETE UNVERIFIED PLAYER */}
      {/* ========================================================================= */}
      {activeModal === "DELETE" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-player-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#DDE3DE] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 id="delete-player-title" className="text-base font-bold text-[#172019]">
                  Delete {playerName} from Roster?
                </h3>
                <p className="text-xs text-[#5F6B61] leading-relaxed">
                  Team: <span className="font-semibold text-[#172019]">{teamName}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-red-50/70 border border-red-200 rounded-xl text-xs text-red-950 leading-relaxed">
              <p className="font-semibold">This permanently deletes this roster membership.</p>
              <p className="text-[11px] text-red-900 mt-0.5">
                The player&apos;s main profile and required financial/audit history will remain preserved.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="delete-reason" className="block text-xs font-bold text-[#172019]">
                Reason for deletion <span className="text-red-600">*</span>
              </label>
              <textarea
                id="delete-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Accidentally registered, Duplicate roster entry, Confirmed erroneous entry"
                maxLength={500}
                disabled={isPending}
                className="w-full text-xs p-3 rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-600 resize-none"
              />
              <span className="block text-[10px] text-[#5F6B61] text-right">
                {reason.length}/500
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl border border-[#DDE3DE] bg-white text-[#172019] hover:bg-[#FAFAF8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isPending || !reason.trim()}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending ? "Deleting Player..." : "Delete Player"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: REMOVE ROSTER MEMBER */}
      {/* ========================================================================= */}
      {activeModal === "REMOVE" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="remove-player-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#DDE3DE] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 id="remove-player-title" className="text-base font-bold text-[#172019]">
                  Remove {playerName} from Roster?
                </h3>
                <p className="text-xs text-[#5F6B61] leading-relaxed">
                  Team: <span className="font-semibold text-[#172019]">{teamName}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-amber-50/80 border border-amber-300 rounded-xl text-xs text-amber-950 leading-relaxed space-y-1">
              {hasVerifiedPayment ? (
                <>
                  <p className="font-bold">This player has a verified payment.</p>
                  <p className="text-[11px] text-amber-900">
                    Removing the player will take them off the active roster, but their verified payment and financial history will be preserved.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold">Player will be removed from the active roster.</p>
                  <p className="text-[11px] text-amber-900">
                    The player will leave the active roster and their active fee obligations will decrease, but their record will remain available for restoration or history.
                  </p>
                </>
              )}
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="remove-reason" className="block text-xs font-bold text-[#172019]">
                Reason for removal <span className="text-red-600">*</span>
              </label>
              <textarea
                id="remove-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Injury before tournament, Requested by team leader, Replacement"
                maxLength={500}
                disabled={isPending}
                className="w-full text-xs p-3 rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-600 resize-none"
              />
              <span className="block text-[10px] text-[#5F6B61] text-right">
                {reason.length}/500
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl border border-[#DDE3DE] bg-white text-[#172019] hover:bg-[#FAFAF8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={isPending || !reason.trim()}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl bg-amber-600 text-white hover:bg-amber-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending ? "Removing Player..." : "Remove Player"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: RESTORE PLAYER */}
      {/* ========================================================================= */}
      {activeModal === "RESTORE" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="restore-player-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl max-w-md w-full p-5 sm:p-6 shadow-xl border border-[#DDE3DE] space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-[#205823]/10 text-[#205823] flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
              <div className="space-y-1">
                <h3 id="restore-player-title" className="text-base font-bold text-[#172019]">
                  Restore {playerName} to Active Roster?
                </h3>
                <p className="text-xs text-[#5F6B61] leading-relaxed">
                  Team: <span className="font-semibold text-[#172019]">{teamName}</span>
                </p>
              </div>
            </div>

            <div className="p-3 bg-[#eef5ef]/70 border border-[#205823]/25 rounded-xl text-xs text-[#172019] leading-relaxed space-y-1">
              <p className="font-semibold text-[#205823]">Player will return to the active team roster.</p>
              <p className="text-[11px] text-[#5F6B61]">
                Active team fees and roster counts will update accordingly. Any existing verified payment will automatically reapply to this active player.
              </p>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 border border-red-300 text-red-900 rounded-xl text-xs font-medium">
                {errorMsg}
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="restore-reason" className="block text-xs font-bold text-[#172019]">
                Notes / Reason <span className="text-[#5F6B61] font-normal">(optional)</span>
              </label>
              <textarea
                id="restore-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Cleared to play, Added back to active lineup"
                maxLength={500}
                disabled={isPending}
                className="w-full text-xs p-3 rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl border border-[#DDE3DE] bg-white text-[#172019] hover:bg-[#FAFAF8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRestore}
                disabled={isPending}
                className="min-h-[40px] px-4 py-2 text-xs font-bold rounded-xl bg-[#205823] text-white hover:bg-[#18461b] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
              >
                {isPending ? "Restoring Player..." : "Restore Player"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
