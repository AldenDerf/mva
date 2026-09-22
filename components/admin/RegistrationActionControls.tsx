"use client";

import React, { useState, useTransition } from "react";
import { registration_status, payment_status } from "@prisma/client";
import { updateRegistrationStatusAction } from "@/app/admin/(portal)/registrations/[id]/actions";

interface RegistrationActionControlsProps {
  registrationId: string;
  registrationCode: string;
  teamName: string;
  categoryName: string;
  leagueName: string;
  currentStatus: registration_status;
  playerCount: number;
  minPlayers: number;
  paymentStatus: payment_status | "NO_PAYMENT";
  paymentAmount: number;
}

type ModalType = "VERIFY" | "REJECT" | "CANCEL" | null;

export function RegistrationActionControls({
  registrationId,
  registrationCode,
  teamName,
  categoryName,
  leagueName,
  currentStatus,
  playerCount,
  minPlayers,
  paymentStatus,
  paymentAmount,
}: RegistrationActionControlsProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isRosterBelowMinimum = playerCount < minPlayers;
  const isPaymentNotVerified = paymentStatus !== "VERIFIED";

  const handleCloseModal = React.useCallback(() => {
    if (isPending) return;
    setActiveModal(null);
    setReason("");
    setErrorMsg(null);
  }, [isPending]);

  // Escape key handler and body overflow lock for modals
  React.useEffect(() => {
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

  const handleOpenModal = (modal: ModalType) => {
    setActiveModal(modal);
    setReason("");
    setErrorMsg(null);
    setSuccessMsg(null);
  };

  const handleSubmit = (action: "VERIFY" | "REJECT" | "CANCEL") => {
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmedReason = reason.trim();
    if ((action === "REJECT" || action === "CANCEL") && !trimmedReason) {
      setErrorMsg(`A reason is strictly required to ${action.toLowerCase()} this registration.`);
      return;
    }

    startTransition(async () => {
      const result = await updateRegistrationStatusAction({
        registrationId,
        action,
        expectedStatus: currentStatus,
        reason: trimmedReason || null,
      });

      if (!result.success) {
        setErrorMsg(result.message);
      } else {
        setSuccessMsg(
          `Registration ${registrationCode} successfully updated to ${result.newStatus}.`
        );
        setActiveModal(null);
        setReason("");
      }
    });
  };

  const terminalStatusLabel =
    currentStatus === "REJECTED"
      ? "Rejected"
      : currentStatus === "CANCELLED"
      ? "Cancelled"
      : currentStatus;

  // If status is terminal (REJECTED or CANCELLED), render clean status notice
  if (currentStatus === "REJECTED" || currentStatus === "CANCELLED") {
    return (
      <div className="bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl p-4 text-xs text-[#5F6B61] flex items-center gap-3">
        <svg
          className="w-5 h-5 text-[#5F6B61] shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <div>
          <span className="font-bold text-[#172019]">Terminal Status: </span>
          This registration is{" "}
          <strong className="font-semibold text-[#172019]">{terminalStatusLabel}</strong>.
          No further status transitions can be performed.
        </div>
      </div>
    );
  }

  const humanPaymentStatus =
    paymentStatus === "NO_PAYMENT"
      ? "No Payment"
      : paymentStatus === "VERIFIED"
      ? "Verified"
      : paymentStatus === "PENDING"
      ? "Pending"
      : paymentStatus === "REJECTED"
      ? "Rejected"
      : paymentStatus === "REFUNDED"
      ? "Refunded"
      : paymentStatus;

  return (
    <div className="space-y-3">
      {/* Toast / Status messages */}
      {successMsg && (
        <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-emerald-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="font-medium">{successMsg}</span>
          </div>
          <button
            onClick={() => setSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-900 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {errorMsg && !activeModal && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl flex items-center justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <svg
              className="w-4 h-4 text-rose-600 shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="font-medium">{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg(null)}
            className="text-rose-700 hover:text-rose-900 text-xs font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Action Buttons Container */}
      <div className="flex flex-wrap items-center gap-2.5">
        {currentStatus === "PENDING_PAYMENT" && (
          <>
            <button
              type="button"
              onClick={() => handleOpenModal("VERIFY")}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-[#205823] hover:bg-[#18441a] text-white text-xs font-bold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span>Verify Registration</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal("REJECT")}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Reject</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenModal("CANCEL")}
              disabled={isPending}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-[#FAFAF8] text-[#5F6B61] border border-[#DDE3DE] text-xs font-semibold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5F6B61] focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                />
              </svg>
              <span>Cancel Entry</span>
            </button>
          </>
        )}

        {currentStatus === "VERIFIED" && (
          <button
            type="button"
            onClick={() => handleOpenModal("CANCEL")}
            disabled={isPending}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
            <span>Cancel Verified Registration</span>
          </button>
        )}
      </div>

      {/* ============================================================ */}
      {/* MODAL: VERIFY CONFIRMATION */}
      {/* ============================================================ */}
      {activeModal === "VERIFY" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#205823]/10 text-[#205823] flex items-center justify-center font-bold">
                  ✓
                </div>
                <h3 id="verify-modal-title" className="text-base font-extrabold text-[#172019]">
                  Verify Registration
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="text-[#5F6B61] hover:text-[#172019] text-sm p-1.5 rounded-lg hover:bg-neutral-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-50"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                {errorMsg}
              </div>
            )}

            {/* Summary details */}
            <div className="bg-[#FAFAF8] p-4 rounded-xl border border-[#DDE3DE] space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">Registration Code:</span>
                <span className="font-mono font-bold text-[#205823]">{registrationCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">Team Name:</span>
                <span className="font-bold text-[#172019]">{teamName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">League & Division:</span>
                <span className="text-[#172019]">
                  {leagueName} • {categoryName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">Roster Count:</span>
                <span className={`font-semibold ${isRosterBelowMinimum ? "text-amber-700" : "text-[#172019]"}`}>
                  {playerCount} player{playerCount === 1 ? "" : "s"} (Min required: {minPlayers})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">Payment Status:</span>
                <span className="font-semibold text-[#172019]">
                  {humanPaymentStatus} {paymentAmount > 0 ? `(₱${paymentAmount.toFixed(2)})` : ""}
                </span>
              </div>
            </div>

            {/* WARNING: Under-minimum roster */}
            {isRosterBelowMinimum && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-800">
                  <span>⚠️</span>
                  <span>Roster Under Minimum Requirement</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  This roster currently has <strong>{playerCount}</strong> player{playerCount === 1 ? "" : "s"}. The
                  category requires at least <strong>{minPlayers}</strong> players. As an administrator, you may still
                  verify this registration if granted an official dispensation.
                </p>
              </div>
            )}

            {/* WARNING: Payment not verified */}
            {isPaymentNotVerified && (
              <div className="p-3.5 bg-blue-50 border border-blue-200 text-blue-900 rounded-xl text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-blue-800">
                  <span>ℹ️</span>
                  <span>Payment Pending Notice</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Payment for this registration is currently <strong>{humanPaymentStatus}</strong>. Verifying this registration
                  will officially accept the team entry into the tournament, but will <strong>NOT</strong> verify its payment.
                  Payment verification is a separate administrative action.
                </p>
              </div>
            )}

            {/* Optional Note */}
            <div>
              <label htmlFor="verify-note" className="block text-xs font-bold text-[#172019] mb-1">
                Verification Note (Optional)
              </label>
              <textarea
                id="verify-note"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Optional administrative note or approval reference..."
                className="w-full text-xs p-2.5 rounded-xl border border-[#DDE3DE] focus:border-[#205823] focus:ring-1 focus:ring-[#205823] outline-none"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-[#5F6B61] hover:text-[#172019] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("VERIFY")}
                disabled={isPending}
                className="inline-flex items-center gap-2 px-4 py-2 bg-[#205823] hover:bg-[#18441a] text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50"
              >
                {isPending && (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                <span>Confirm Verification</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: REJECT CONFIRMATION */}
      {/* ============================================================ */}
      {activeModal === "REJECT" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reject-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold">
                  ✕
                </div>
                <h3 id="reject-modal-title" className="text-base font-extrabold text-[#172019]">
                  Reject Registration
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="text-[#5F6B61] hover:text-[#172019] text-sm p-1.5 rounded-lg hover:bg-neutral-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-50"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                {errorMsg}
              </div>
            )}

            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs space-y-1">
              <div className="font-bold text-rose-800">Permanent Terminal Action</div>
              <p className="text-[11px] leading-relaxed">
                Rejecting this registration marks it as <strong>REJECTED</strong>. In the current workflow, this is a
                terminal state and cannot be reopened.
              </p>
            </div>

            <div>
              <label htmlFor="reject-reason" className="block text-xs font-bold text-[#172019] mb-1">
                Reason for Rejection <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="reject-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the specific reason for rejecting this entry (e.g. duplicate team submission, ineligible players, missed deadline)..."
                className="w-full text-xs p-2.5 rounded-xl border border-[#DDE3DE] focus:border-rose-500 focus:ring-1 focus:ring-rose-500 outline-none"
              />
              <span className="text-[11px] text-[#5F6B61] mt-1 block">
                This reason will be recorded in the official immutable audit trail.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-[#5F6B61] hover:text-[#172019] transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("REJECT")}
                disabled={isPending || !reason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending && (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                <span>Confirm Rejection</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: CANCEL CONFIRMATION */}
      {/* ============================================================ */}
      {activeModal === "CANCEL" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  !
                </div>
                <h3 id="cancel-modal-title" className="text-base font-extrabold text-[#172019]">
                  Cancel Registration
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="text-[#5F6B61] hover:text-[#172019] text-sm p-1.5 rounded-lg hover:bg-neutral-100 transition-colors min-h-[36px] min-w-[36px] flex items-center justify-center disabled:opacity-50"
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                {errorMsg}
              </div>
            )}

            <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs space-y-1">
              <div className="font-bold text-amber-800">
                {currentStatus === "VERIFIED"
                  ? "Cancelling Verified Entry"
                  : "Withdrawal / Cancellation"}
              </div>
              <p className="text-[11px] leading-relaxed">
                {currentStatus === "VERIFIED"
                  ? "This registration was previously verified. Cancelling it will mark it as CANCELLED while preserving the historical verification timestamp. This action is terminal."
                  : "Cancelling this registration marks it as CANCELLED. In the current workflow, this is a terminal state."}
              </p>
            </div>

            <div>
              <label htmlFor="cancel-reason" className="block text-xs font-bold text-[#172019] mb-1">
                Reason for Cancellation <span className="text-rose-600">*</span>
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="State the reason for cancellation (e.g. team requested withdrawal, team dissolved, league schedule conflict)..."
                className="w-full text-xs p-2.5 rounded-xl border border-[#DDE3DE] focus:border-amber-500 focus:ring-1 focus:ring-amber-500 outline-none"
              />
              <span className="text-[11px] text-[#5F6B61] mt-1 block">
                This reason will be recorded in the official immutable audit trail.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-4 py-2 text-xs font-semibold text-[#5F6B61] hover:text-[#172019] transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("CANCEL")}
                disabled={isPending || !reason.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPending && (
                  <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                )}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
