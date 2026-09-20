"use client";

import React, { useState, useEffect, useTransition } from "react";
import { payment_method, payment_status } from "@prisma/client";
import { correctPaymentDetailsAction } from "@/app/admin/(portal)/payments/actions";
import { PaymentStatusBadge } from "@/components/admin/StatusBadges";

export interface PaymentCorrectionTarget {
  id: string;
  registrationId: string;
  registrationCode: string;
  teamName: string;
  playerName: string;
  amount: number;
  status: payment_status;
  paymentMethod: payment_method;
  referenceNumber: string | null;
}

interface PaymentCorrectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  payment: PaymentCorrectionTarget | null;
}

const PAYMENT_METHODS: { value: payment_method; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "GCASH", label: "GCash" },
  { value: "BANK_TRANSFER", label: "Bank Transfer" },
  { value: "OTHER", label: "Other" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

interface DialogContentProps {
  payment: PaymentCorrectionTarget;
  onClose: () => void;
  onSuccess?: () => void;
}

function PaymentCorrectionDialogContent({
  payment,
  onClose,
  onSuccess,
}: DialogContentProps) {
  const [selectedMethod, setSelectedMethod] = useState<payment_method>(
    payment.paymentMethod
  );
  const [referenceNumber, setReferenceNumber] = useState(
    payment.referenceNumber || ""
  );
  const [reason, setReason] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

    const trimmedReason = reason.trim();
    if (trimmedReason.length < 5) {
      setErrorMessage(
        "A meaningful correction reason (minimum 5 characters) is required."
      );
      return;
    }

    const trimmedRef = referenceNumber.trim();
    if (trimmedRef.length > 100) {
      setErrorMessage("Reference number cannot exceed 100 characters.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await correctPaymentDetailsAction({
          paymentId: payment.id,
          paymentMethod: selectedMethod,
          referenceNumber: trimmedRef.length > 0 ? trimmedRef : null,
          expectedPaymentMethod: payment.paymentMethod,
          expectedReferenceNumber: payment.referenceNumber,
          reason: trimmedReason,
          registrationId: payment.registrationId,
        });

        if (!result.success) {
          setErrorMessage(result.message);
          return;
        }

        onSuccess?.();
        onClose();
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while saving payment corrections."
        );
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="correction-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isPending) onClose();
        }}
        aria-hidden="true"
      />

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-[#DDE3DE] overflow-hidden z-10 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-start justify-between gap-4 bg-[#FAFAF8]">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
                {payment.registrationCode}
              </span>
              <PaymentStatusBadge status={payment.status} />
            </div>
            <h2
              id="correction-modal-title"
              className="text-lg sm:text-xl font-extrabold text-[#172019] mt-1.5"
            >
              Correct Payment Details
            </h2>
            <p className="text-xs text-[#5F6B61] mt-0.5">
              Update payment method or reference number with audit recording.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="p-1.5 text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/40 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50"
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
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 overflow-y-auto space-y-5">
          {/* Immutable Context Card */}
          <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] text-xs space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#5F6B61]">
              Payment Context (Immutable)
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[#5F6B61] block text-[10px]">Player / Account</span>
                <span className="font-bold text-[#172019] block truncate">
                  {payment.playerName}
                </span>
              </div>
              <div>
                <span className="text-[#5F6B61] block text-[10px]">Team</span>
                <span className="font-bold text-[#172019] block truncate">
                  {payment.teamName}
                </span>
              </div>
              <div>
                <span className="text-[#5F6B61] block text-[10px]">Amount</span>
                <span className="font-mono font-bold text-[#205823] block">
                  {formatCurrency(payment.amount)}
                </span>
              </div>
              <div>
                <span className="text-[#5F6B61] block text-[10px]">Status</span>
                <span className="font-semibold text-[#172019] block">
                  {payment.status}
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[#DDE3DE]/80 text-[11px] text-[#5F6B61] flex items-center gap-1.5">
              <svg className="w-4 h-4 text-[#5F6B61] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Amount and status cannot be changed via this correction form.</span>
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2">
              <svg className="w-4 h-4 mt-0.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>{errorMessage}</div>
            </div>
          )}

          {/* Editable Field 1: Payment Method */}
          <div>
            <label
              htmlFor="payment-method-select"
              className="block text-xs font-bold text-[#172019] mb-1.5"
            >
              Payment Method <span className="text-red-600">*</span>
            </label>
            <select
              id="payment-method-select"
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value as payment_method)}
              disabled={isPending}
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-white text-[#172019] focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
            >
              {PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Editable Field 2: Reference Number */}
          <div>
            <label
              htmlFor="reference-number-input"
              className="block text-xs font-bold text-[#172019] mb-1.5"
            >
              Reference / Transaction Number{" "}
              <span className="font-normal text-[#5F6B61]">(Optional, max 100 chars)</span>
            </label>
            <input
              id="reference-number-input"
              type="text"
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
              disabled={isPending}
              maxLength={100}
              placeholder="e.g., GCASH-12345678 or Ref #9901"
              className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-[#DDE3DE] bg-white text-[#172019] placeholder:text-[#5F6B61]/40 focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
            />
          </div>

          {/* Required Field: Correction Reason */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="correction-reason-textarea"
                className="block text-xs font-bold text-[#172019]"
              >
                Correction Reason <span className="text-red-600">*</span>
              </label>
              <span className="text-[10px] text-[#5F6B61]">Min 5 characters</span>
            </div>
            <textarea
              id="correction-reason-textarea"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isPending}
              rows={3}
              placeholder="State the reason for this correction (e.g., Typo in GCash reference number, Paid via bank transfer instead of cash)..."
              className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-white text-[#172019] placeholder:text-[#5F6B61]/40 focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-[#DDE3DE] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold text-[#5F6B61] hover:text-[#172019] rounded-xl hover:bg-[#FAFAF8] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-[#205823] hover:bg-[#1b4b1e] rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] disabled:opacity-50 min-w-[120px]"
            >
              {isPending ? (
                <>
                  <svg
                    className="w-3.5 h-3.5 animate-spin text-white"
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
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Correction</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PaymentCorrectionModal({
  isOpen,
  onClose,
  onSuccess,
  payment,
}: PaymentCorrectionModalProps) {
  if (!isOpen || !payment) return null;

  return (
    <PaymentCorrectionDialogContent
      key={payment.id}
      payment={payment}
      onClose={onClose}
      onSuccess={onSuccess}
    />
  );
}
