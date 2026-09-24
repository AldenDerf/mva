"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { allocateLegacyPaymentAction } from "@/app/admin/(portal)/registrations/[id]/allocation-actions";
import { roster_status } from "@prisma/client";

export interface RosterCandidateForAllocation {
  registrationPlayerId: string;
  fullName: string;
  jerseyNumber: number | null;
  status: roster_status;
  existingCredit: number;
  outstanding: number;
  fee: number;
  isFullyCredited: boolean;
}

interface AllocatePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  registrationId: string;
  payment: {
    id: string;
    amount: number;
    allocatedAmount: number;
    remainingUnallocated: number;
  };
  roster: RosterCandidateForAllocation[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function AllocatePaymentModal({
  isOpen,
  onClose,
  registrationId,
  payment,
  roster,
}: AllocatePaymentModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Selected player allocations: map of registrationPlayerId -> amount
  const [selectedAmounts, setSelectedAmounts] = useState<Record<string, number>>({});
  // Acknowledgements for removed players: map of registrationPlayerId -> boolean
  const [removedAcknowledgements, setRemovedAcknowledgements] = useState<Record<string, boolean>>({});
  const [reconciliationNote, setReconciliationNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const resetForm = React.useCallback(() => {
    setSelectedAmounts({});
    setRemovedAcknowledgements({});
    setReconciliationNote("");
    setErrorMsg(null);
  }, []);

  const handleClose = React.useCallback(() => {
    if (isPending) return;
    resetForm();
    onClose();
  }, [isPending, resetForm, onClose]);

  // Escape key handler and body overflow lock
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

  if (!isOpen) return null;

  const totalSelectedAllocation = Object.values(selectedAmounts).reduce(
    (sum, val) => sum + (val || 0),
    0
  );

  const isOverAllocated = totalSelectedAllocation > payment.remainingUnallocated;

  const handleTogglePlayer = (player: RosterCandidateForAllocation) => {
    setSelectedAmounts((prev) => {
      const next = { ...prev };
      if (next[player.registrationPlayerId] !== undefined) {
        delete next[player.registrationPlayerId];
      } else {
        // Default to either the player's outstanding obligation or 300, whichever fits remaining
        const suggested = Math.min(
          player.outstanding > 0 ? player.outstanding : player.fee,
          payment.remainingUnallocated - totalSelectedAllocation > 0
            ? payment.remainingUnallocated - totalSelectedAllocation
            : player.fee
        );
        next[player.registrationPlayerId] = suggested > 0 ? suggested : player.fee;
      }
      return next;
    });
  };

  const handleAmountChange = (registrationPlayerId: string, value: number) => {
    setSelectedAmounts((prev) => ({
      ...prev,
      [registrationPlayerId]: value,
    }));
  };

  const handleRemovedAckChange = (registrationPlayerId: string, checked: boolean) => {
    setRemovedAcknowledgements((prev) => ({
      ...prev,
      [registrationPlayerId]: checked,
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const entries = Object.entries(selectedAmounts);
    if (entries.length === 0) {
      setErrorMsg("Please select at least one player to allocate funds to.");
      return;
    }

    if (totalSelectedAllocation <= 0) {
      setErrorMsg("Total allocation amount must be greater than zero.");
      return;
    }

    if (isOverAllocated) {
      setErrorMsg(
        `Total allocation (${formatCurrency(
          totalSelectedAllocation
        )}) cannot exceed remaining unallocated funds (${formatCurrency(
          payment.remainingUnallocated
        )}).`
      );
      return;
    }

    // Validate each player allocation
    for (const [rpId, amt] of entries) {
      if (amt <= 0) {
        setErrorMsg("Each allocated amount must be greater than zero.");
        return;
      }
      const player = roster.find((r) => r.registrationPlayerId === rpId);
      if (!player) continue;

      if (amt > player.outstanding) {
        setErrorMsg(
          `Allocation of ${formatCurrency(amt)} exceeds outstanding amount for ${
            player.fullName
          } (max: ${formatCurrency(player.outstanding)}).`
        );
        return;
      }

      if (player.status === "REMOVED" && !removedAcknowledgements[rpId]) {
        setErrorMsg(
          `Please confirm the acknowledgement for historical removed player ${player.fullName}.`
        );
        return;
      }
    }

    if (!reconciliationNote.trim()) {
      setErrorMsg("A reconciliation note explaining this historical allocation is required.");
      return;
    }

    startTransition(async () => {
      const allocations = entries.map(([registrationPlayerId, amount]) => ({
        registrationPlayerId,
        amount,
      }));

      const result = await allocateLegacyPaymentAction({
        registrationId,
        paymentId: payment.id,
        allocations,
        reconciliationNote: reconciliationNote.trim(),
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
      aria-labelledby="allocate-legacy-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150 overflow-y-auto"
    >
      <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-2xl max-w-xl w-full my-8 overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between gap-3 bg-[#FAFAF8] shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-wider text-[#205823] bg-[#205823]/10 px-2 py-0.5 rounded-md border border-[#205823]/20">
                Reconciliation
              </span>
            </div>
            <h2 id="allocate-legacy-modal-title" className="text-lg font-extrabold text-[#172019] mt-1">
              Allocate Legacy Payment
            </h2>
            <p className="text-xs text-[#5F6B61] mt-0.5">
              Attribute historical verified money to individual roster members.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isPending}
            className="w-8 h-8 rounded-full flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/40 transition-colors cursor-pointer"
            aria-label="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Content Body - Scrollable */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 grow">
          {/* Payment Summary Box */}
          <div className="bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl p-4 grid grid-cols-3 gap-2 text-center">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                Original Payment
              </span>
              <span className="font-mono font-bold text-sm text-[#172019] mt-0.5 block">
                {formatCurrency(payment.amount)}
              </span>
            </div>
            <div className="border-x border-[#DDE3DE]">
              <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                Already Allocated
              </span>
              <span className="font-mono font-bold text-sm text-[#205823] mt-0.5 block">
                {formatCurrency(payment.allocatedAmount)}
              </span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                Remaining
              </span>
              <span className="font-mono font-extrabold text-sm text-amber-800 mt-0.5 block">
                {formatCurrency(payment.remainingUnallocated)}
              </span>
            </div>
          </div>

          <div className="text-xs text-[#5F6B61] bg-[#205823]/5 border border-[#205823]/15 rounded-xl p-3 flex items-start gap-2">
            <span className="text-sm">ℹ️</span>
            <div>
              <span className="font-semibold text-[#172019]">Manual Roster Attribution:</span>{" "}
              <span>
                Remaining {formatCurrency(payment.remainingUnallocated)} can be allocated to eligible players below. No new cash receipt will be generated.
              </span>
            </div>
          </div>

          {errorMsg && (
            <div
              role="alert"
              className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium space-y-1"
            >
              <div className="font-bold flex items-center gap-1.5">
                <span>⚠️ Error</span>
              </div>
              <p>{errorMsg}</p>
            </div>
          )}

          {/* Roster Selection Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-[#172019]">
                Select Roster Members ({roster.length} Total)
              </label>
              <span className="text-[11px] text-[#5F6B61]">
                {Object.keys(selectedAmounts).length} selected
              </span>
            </div>

            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {roster.map((player) => {
                const isSelected = selectedAmounts[player.registrationPlayerId] !== undefined;
                const isRemoved = player.status === "REMOVED";
                const isFullyCredited = player.outstanding <= 0;

                return (
                  <div
                    key={player.registrationPlayerId}
                    className={`rounded-xl border transition-all p-3.5 space-y-3 ${
                      isSelected
                        ? "border-[#205823] bg-[#205823]/5 ring-1 ring-[#205823]"
                        : isFullyCredited
                        ? "border-[#DDE3DE] bg-[#FAFAF8] opacity-60"
                        : "border-[#DDE3DE] bg-white hover:border-[#5F6B61]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        <input
                          type="checkbox"
                          id={`alloc-player-${player.registrationPlayerId}`}
                          checked={isSelected}
                          disabled={isFullyCredited || isPending}
                          onChange={() => handleTogglePlayer(player)}
                          className="mt-0.5 w-4 h-4 rounded text-[#205823] focus:ring-[#205823] border-[#DDE3DE] cursor-pointer disabled:cursor-not-allowed"
                        />
                        <label
                          htmlFor={`alloc-player-${player.registrationPlayerId}`}
                          className="min-w-0 cursor-pointer block select-none"
                        >
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-bold text-sm text-[#172019] truncate">
                              {player.fullName}
                            </span>
                            {player.jerseyNumber !== null && (
                              <span className="font-mono text-[10px] text-[#5F6B61] px-1 py-0.2 bg-[#FAFAF8] border border-[#DDE3DE] rounded">
                                #{player.jerseyNumber}
                              </span>
                            )}
                            {isRemoved ? (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-neutral-200 text-[#5F6B61]">
                                REMOVED
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                ACTIVE
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-[#5F6B61] mt-0.5">
                            Existing Verified Credit:{" "}
                            <span className="font-mono font-semibold text-[#172019]">
                              {formatCurrency(player.existingCredit)}
                            </span>{" "}
                            • Outstanding:{" "}
                            <span
                              className={`font-mono font-semibold ${
                                player.outstanding > 0 ? "text-amber-800" : "text-emerald-800"
                              }`}
                            >
                              {formatCurrency(player.outstanding)}
                            </span>
                          </div>
                        </label>
                      </div>

                      {isFullyCredited ? (
                        <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md shrink-0">
                          Fully Credited
                        </span>
                      ) : (
                        isSelected && (
                          <div className="shrink-0 flex items-center gap-1.5">
                            <span className="text-xs text-[#5F6B61]">₱</span>
                            <input
                              type="number"
                              min={1}
                              max={player.outstanding}
                              step="any"
                              value={selectedAmounts[player.registrationPlayerId] || ""}
                              onChange={(e) =>
                                handleAmountChange(
                                  player.registrationPlayerId,
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="w-24 text-right font-mono font-bold text-xs p-1.5 rounded-lg border border-[#DDE3DE] focus:ring-2 focus:ring-[#205823] focus:outline-none"
                              aria-label={`Allocation amount for ${player.fullName}`}
                            />
                          </div>
                        )
                      )}
                    </div>

                    {/* Removed Player Warning Notice & Checkbox */}
                    {isSelected && isRemoved && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2 text-amber-900">
                        <div className="flex items-start gap-2">
                          <span className="text-amber-700 font-bold shrink-0">⚠️ Notice:</span>
                          <p className="text-[11px] leading-relaxed">
                            This player is no longer on the active roster. Allocate only if this historical payment originally covered this player. (Does not restore player to active roster or alter active team obligation).
                          </p>
                        </div>
                        <label className="flex items-center gap-2 pt-1 font-semibold text-[11px] text-amber-950 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={Boolean(removedAcknowledgements[player.registrationPlayerId])}
                            onChange={(e) =>
                              handleRemovedAckChange(player.registrationPlayerId, e.target.checked)
                            }
                            className="w-3.5 h-3.5 rounded text-amber-800 focus:ring-amber-800 border-amber-300 cursor-pointer"
                          />
                          <span>I confirm this historical payment covered this removed player.</span>
                        </label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reconciliation Note Input */}
          <div className="space-y-1.5">
            <label
              htmlFor="reconciliation-note-input"
              className="block text-xs font-bold uppercase tracking-wider text-[#172019]"
            >
              Reconciliation Note <span className="text-rose-600">*</span>
            </label>
            <p className="text-[11px] text-[#5F6B61]">
              Document why and how this historical payment was attributed to the selected players.
            </p>
            <textarea
              id="reconciliation-note-input"
              rows={2}
              required
              value={reconciliationNote}
              onChange={(e) => setReconciliationNote(e.target.value)}
              placeholder="e.g. Historical team payment covered the original seven registered players."
              className="w-full text-xs p-3 rounded-xl border border-[#DDE3DE] focus:ring-2 focus:ring-[#205823] focus:outline-none resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 sm:p-6 border-t border-[#DDE3DE] bg-[#FAFAF8] flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
          <div>
            <div className="text-xs text-[#5F6B61]">
              Total to Allocate:{" "}
              <span
                className={`font-mono font-bold text-sm ${
                  isOverAllocated ? "text-rose-700" : "text-[#205823]"
                }`}
              >
                {formatCurrency(totalSelectedAllocation)}
              </span>{" "}
              / {formatCurrency(payment.remainingUnallocated)}
            </div>
            {isOverAllocated && (
              <span className="text-[11px] font-semibold text-rose-700 block">
                Exceeds remaining unallocated funds!
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isPending}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-[#DDE3DE] bg-white text-[#5F6B61] hover:bg-[#FAFAF8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                isPending ||
                isOverAllocated ||
                totalSelectedAllocation <= 0 ||
                !reconciliationNote.trim()
              }
              className="px-5 py-2 text-xs font-bold rounded-xl bg-[#205823] text-white hover:bg-[#1b4b1e] transition-colors shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
            >
              {isPending ? "Allocating..." : "Confirm Allocation"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
