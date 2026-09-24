"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reverseLegacyPaymentAllocationAction } from "@/app/admin/(portal)/registrations/[id]/allocation-actions";

export interface ReverseAllocationTarget {
  id: string; // allocationId
  paymentId: string;
  playerName: string;
  amount: number;
  registrationId: string;
}

interface ReverseAllocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  target: ReverseAllocationTarget | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function ReverseAllocationModal({
  isOpen,
  onClose,
  target,
}: ReverseAllocationModalProps) {
  const router = useRouter();
  const [reversalReason, setReversalReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const resetForm = React.useCallback(() => {
    setReversalReason("");
    setErrorMsg(null);
  }, []);

  const handleClose = React.useCallback(() => {
    if (isPending) return;
    resetForm();
    onClose();
  }, [isPending, resetForm, onClose]);

  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isPending && isOpen) {
        handleClose();
      }
    };
    if (isOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, isPending, handleClose]);

  if (!isOpen || !target) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reversalReason.trim()) {
      setErrorMsg("A reversal reason is required.");
      return;
    }

    startTransition(async () => {
      setErrorMsg(null);
      const result = await reverseLegacyPaymentAllocationAction({
        registrationId: target.registrationId,
        allocationId: target.id,
        reversalReason: reversalReason.trim(),
      });

      if (!result.success) {
        setErrorMsg(result.message);
      } else {
        resetForm();
        router.refresh();
        onClose();
      }
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="reverse-allocation-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-2xl max-w-md w-full p-6 space-y-4 animate-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center font-bold text-sm">
              ↩
            </div>
            <div>
              <h3 id="reverse-allocation-modal-title" className="text-base font-extrabold text-[#172019]">
                Reverse Payment Allocation
              </h3>
              <p className="text-xs text-[#5F6B61]">
                Preserves audit history and returns funds to unallocated pool.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="w-7 h-7 rounded-full flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/40 transition-colors cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-2 text-amber-950">
          <div className="flex justify-between items-center font-semibold">
            <span>Player:</span>
            <span className="font-bold text-[#172019]">{target.playerName}</span>
          </div>
          <div className="flex justify-between items-center font-semibold">
            <span>Allocated Amount:</span>
            <span className="font-mono font-bold text-[#205823]">{formatCurrency(target.amount)}</span>
          </div>
          <p className="text-[11px] leading-relaxed text-amber-900 border-t border-amber-200/60 pt-2">
            Reversing this allocation will mark the record as reversed, deduct credit from {target.playerName}, and return {formatCurrency(target.amount)} to the remaining unallocated balance.
          </p>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="reversal-reason-input"
              className="block text-xs font-bold uppercase tracking-wider text-[#172019]"
            >
              Reversal Reason <span className="text-rose-600">*</span>
            </label>
            <input
              id="reversal-reason-input"
              type="text"
              required
              value={reversalReason}
              onChange={(e) => setReversalReason(e.target.value)}
              placeholder="e.g. Wrong player selected, clerical mistake..."
              className="w-full text-xs p-2.5 rounded-xl border border-[#DDE3DE] focus:ring-2 focus:ring-rose-600 focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#DDE3DE] bg-white text-[#5F6B61] hover:bg-[#FAFAF8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !reversalReason.trim()}
              className="px-4 py-2 text-xs font-bold rounded-xl bg-rose-700 text-white hover:bg-rose-800 transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
            >
              {isPending ? "Reversing..." : "Confirm Reversal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
