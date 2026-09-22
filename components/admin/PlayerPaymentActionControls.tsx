"use client";

import React, { useState, useTransition } from "react";
import { payment_status, payment_method } from "@prisma/client";
import { updatePlayerPaymentAction } from "@/app/admin/(portal)/registrations/[id]/payment-actions";

interface PlayerPaymentActionControlsProps {
  registrationId: string;
  registrationPlayerId: string;
  paymentId?: string | null;
  playerName: string;
  paymentStatus: payment_status | "UNPAID";
  amount?: number;
  paymentMethod?: payment_method;
  referenceNumber?: string | null;
  verifiedAt?: Date | null;
}

type ModalType = "VERIFY" | "REJECT" | "REFUND" | null;

export function PlayerPaymentActionControls({
  registrationId,
  registrationPlayerId,
  paymentId,
  playerName,
  paymentStatus,
  amount = 300,
  paymentMethod = "CASH",
  referenceNumber,
}: PlayerPaymentActionControlsProps) {
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [selectedMethod, setSelectedMethod] = useState<payment_method>(
    paymentMethod || "CASH"
  );
  const [refNum, setRefNum] = useState(referenceNumber || "");
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
    setSelectedMethod(paymentMethod || "CASH");
    setRefNum(referenceNumber || "");
    setReason("");
    setErrorMsg(null);
  };

  const handleSubmit = (action: "VERIFY" | "REJECT" | "REFUND") => {
    setErrorMsg(null);

    const trimmedReason = reason.trim();
    if ((action === "REJECT" || action === "REFUND") && !trimmedReason) {
      setErrorMsg(`A reason is strictly required to ${action.toLowerCase()} this payment.`);
      return;
    }

    startTransition(async () => {
      const result = await updatePlayerPaymentAction({
        registrationId,
        registrationPlayerId,
        paymentId: paymentId || undefined,
        action,
        expectedStatus: paymentStatus === "UNPAID" ? undefined : paymentStatus,
        paymentMethod: selectedMethod,
        referenceNumber: refNum.trim() || null,
        reason: trimmedReason || null,
        notes: trimmedReason || null,
      });

      if (!result.success) {
        setErrorMsg(result.message);
      } else {
        setActiveModal(null);
      }
    });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Badge & Trigger Button based on status */}
      {paymentStatus === "VERIFIED" ? (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[11px] font-bold bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
            <svg className="w-3 h-3 text-[#205823]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
            <span>Paid ₱{amount.toFixed(0)}</span>
          </span>

          <button
            type="button"
            onClick={() => handleOpenModal("REFUND")}
            disabled={isPending}
            aria-label={`Refund payment for ${playerName}`}
            className="text-xs text-[#5F6B61] hover:text-rose-700 underline font-medium ml-1 transition-colors disabled:opacity-50 min-h-[36px] py-1 px-1.5 inline-flex items-center"
          >
            Refund
          </button>
        </div>
      ) : paymentStatus === "REJECTED" ? (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            Rejected
          </span>
          <button
            type="button"
            onClick={() => handleOpenModal("VERIFY")}
            disabled={isPending}
            aria-label={`Verify payment for ${playerName}`}
            className="min-h-[36px] px-3 py-1.5 text-xs font-bold bg-[#205823] hover:bg-[#18441a] text-white rounded-lg shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50 inline-flex items-center justify-center cursor-pointer"
          >
            Verify
          </button>
        </div>
      ) : paymentStatus === "REFUNDED" ? (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-[#FAFAF8] text-[#5F6B61] border border-[#DDE3DE]">
          Refunded
        </span>
      ) : (
        /* PENDING or UNPAID */
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            Unpaid (₱{amount.toFixed(0)})
          </span>
          <button
            type="button"
            onClick={() => handleOpenModal("VERIFY")}
            disabled={isPending}
            aria-label={`Verify payment for ${playerName}`}
            className="min-h-[36px] px-3 py-1.5 text-xs font-bold bg-[#205823] hover:bg-[#18441a] text-white rounded-lg shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50 inline-flex items-center justify-center cursor-pointer"
          >
            Verify
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: VERIFY PAYMENT */}
      {/* ============================================================ */}
      {activeModal === "VERIFY" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="verify-player-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-[#205823]/10 text-[#205823] flex items-center justify-center font-bold text-sm">
                  ₱
                </div>
                <h3 id="verify-player-modal-title" className="text-base font-extrabold text-[#172019]">
                  Verify Player Payment
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

            <div className="bg-[#FAFAF8] p-3 rounded-xl border border-[#DDE3DE] space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">Player Name:</span>
                <span className="font-bold text-[#172019]">{playerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5F6B61]">Required Fee:</span>
                <span className="font-bold text-[#205823]">₱{amount.toFixed(2)}</span>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="payment-method-select" className="font-bold text-[#172019] block mb-1">
                  Payment Method <span className="text-rose-500">*</span>
                </label>
                <select
                  id="payment-method-select"
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value as payment_method)}
                  disabled={isPending}
                  className="w-full p-2.5 rounded-xl border border-[#DDE3DE] bg-white text-[#172019] text-xs focus:ring-2 focus:ring-[#205823]"
                >
                  <option value="CASH">CASH (Paid at secretariat desk)</option>
                  <option value="GCASH">GCASH (Online transfer)</option>
                  <option value="BANK_TRANSFER">BANK TRANSFER</option>
                  <option value="OTHER">OTHER</option>
                </select>
              </div>

              <div>
                <label htmlFor="ref-num-input" className="font-bold text-[#172019] block mb-1">
                  Reference / Receipt Number (Optional for Cash)
                </label>
                <input
                  id="ref-num-input"
                  type="text"
                  value={refNum}
                  onChange={(e) => setRefNum(e.target.value)}
                  placeholder="e.g. OR-10294 or GCash Ref"
                  disabled={isPending}
                  className="w-full p-2.5 rounded-xl border border-[#DDE3DE] bg-white text-[#172019] text-xs focus:ring-2 focus:ring-[#205823]"
                />
              </div>

              <div>
                <label htmlFor="verify-notes-input" className="font-bold text-[#172019] block mb-1">
                  Administrative Notes (Optional)
                </label>
                <textarea
                  id="verify-notes-input"
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Verified by secretariat desk at gym"
                  disabled={isPending}
                  className="w-full p-2.5 rounded-xl border border-[#DDE3DE] bg-white text-[#172019] text-xs focus:ring-2 focus:ring-[#205823]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-4 py-2 bg-white hover:bg-[#FAFAF8] text-[#5F6B61] border border-[#DDE3DE] text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("VERIFY")}
                disabled={isPending}
                className="px-4 py-2 bg-[#205823] hover:bg-[#18441a] text-white text-xs font-bold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50"
              >
                {isPending ? "Verifying..." : "Confirm Verification"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL: REFUND PAYMENT */}
      {/* ============================================================ */}
      {activeModal === "REFUND" && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="refund-player-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-sm">
                  ↺
                </div>
                <h3 id="refund-player-modal-title" className="text-base font-extrabold text-[#172019]">
                  Refund Player Payment
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

            <p className="text-xs text-[#5F6B61] leading-relaxed">
              You are about to mark the <strong>₱{amount.toFixed(2)}</strong> registration fee for{" "}
              <strong>{playerName}</strong> as refunded. This action will be permanently recorded in the audit log.
            </p>

            <div className="space-y-1.5 text-xs">
              <label htmlFor="refund-reason-input" className="font-bold text-[#172019] block">
                Reason for Refund <span className="text-rose-500">*</span>
              </label>
              <textarea
                id="refund-reason-input"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Explain the reason for refunding this payment..."
                disabled={isPending}
                className="w-full p-2.5 rounded-xl border border-[#DDE3DE] bg-white text-[#172019] text-xs focus:ring-2 focus:ring-rose-500"
              />
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-[#DDE3DE]">
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isPending}
                className="px-4 py-2 bg-white hover:bg-[#FAFAF8] text-[#5F6B61] border border-[#DDE3DE] text-xs font-semibold rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSubmit("REFUND")}
                disabled={isPending || !reason.trim()}
                className="px-4 py-2 bg-rose-700 hover:bg-rose-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 disabled:opacity-50"
              >
                {isPending ? "Processing..." : "Confirm Refund"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
