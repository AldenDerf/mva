"use client";

import React, { useState } from "react";
import { AdminRegistrationDetailPayment } from "@/lib/admin/registrations";
import { PaymentStatusBadge } from "@/components/admin/StatusBadges";
import { PaymentCorrectionButton } from "@/components/admin/PaymentCorrectionButton";
import {
  AllocatePaymentModal,
  RosterCandidateForAllocation,
} from "@/components/admin/AllocatePaymentModal";
import {
  ReverseAllocationModal,
  ReverseAllocationTarget,
} from "@/components/admin/ReverseAllocationModal";

interface LegacyPaymentCardProps {
  payment: AdminRegistrationDetailPayment;
  paymentIndex: number;
  registrationId: string;
  registrationCode: string;
  teamName: string;
  rosterCandidates: RosterCandidateForAllocation[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  GCASH: "GCash",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

export function LegacyPaymentCard({
  payment,
  paymentIndex,
  registrationId,
  registrationCode,
  teamName,
  rosterCandidates,
}: LegacyPaymentCardProps) {
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  const [reverseTarget, setReverseTarget] = useState<ReverseAllocationTarget | null>(null);
  const [showHistory, setShowHistory] = useState(true);

  const isLegacy = payment.isLegacyEligible;
  const allocations = payment.allocations || [];
  const activeAllocations = allocations.filter((a) => a.reversedAt === null);
  const reversedAllocations = allocations.filter((a) => a.reversedAt !== null);

  return (
    <div className="p-5 sm:p-6 space-y-4 hover:bg-[#FAFAF8]/40 transition-colors">
      {/* Modals */}
      <AllocatePaymentModal
        isOpen={isAllocateOpen}
        onClose={() => setIsAllocateOpen(false)}
        registrationId={registrationId}
        payment={{
          id: payment.id,
          amount: payment.amount,
          allocatedAmount: payment.allocatedAmount,
          remainingUnallocated: payment.remainingUnallocated,
        }}
        roster={rosterCandidates}
      />

      <ReverseAllocationModal
        isOpen={Boolean(reverseTarget)}
        onClose={() => setReverseTarget(null)}
        target={reverseTarget}
      />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-[#5F6B61]">
            Payment #{paymentIndex + 1}
          </span>
          <PaymentStatusBadge status={payment.status} />
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
              payment.remainingUnallocated > 0.001
                ? "bg-emerald-50 text-[#205823] border border-emerald-200"
                : "bg-neutral-100 text-[#205823] border border-emerald-200"
            }`}
          >
            {payment.remainingUnallocated > 0.001
              ? "Legacy Unallocated Payment"
              : "Legacy Payment — Fully Reconciled"}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-base font-extrabold text-[#172019]">
            {formatCurrency(payment.amount)}
          </span>
          {payment.remainingUnallocated > 0.001 && (
            <button
              type="button"
              onClick={() => setIsAllocateOpen(true)}
              className="min-h-[32px] px-3 py-1 text-xs font-bold bg-[#205823] hover:bg-[#1b4b1e] text-white rounded-lg shadow-2xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>Allocate to Players</span>
            </button>
          )}
          <PaymentCorrectionButton
            payment={{
              id: payment.id,
              registrationId,
              registrationCode,
              teamName,
              playerName:
                payment.remainingUnallocated > 0.001
                  ? "Legacy Unallocated Payment"
                  : "Legacy Payment — Fully Reconciled",
              amount: payment.amount,
              status: payment.status,
              paymentMethod: payment.paymentMethod,
              referenceNumber: payment.referenceNumber,
            }}
            size="xs"
          />
        </div>
      </div>

      {/* Allocation Summary Card */}
      <div className="rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
          <span className="text-[10px] uppercase font-bold text-[#5F6B61]">
            Original Amount
          </span>
          <span className="font-mono font-bold text-sm text-[#172019]">
            {formatCurrency(payment.amount)}
          </span>
        </div>
        <div className="flex sm:flex-col justify-between sm:justify-start items-center sm:items-start sm:border-x sm:border-[#DDE3DE] sm:px-4">
          <span className="text-[10px] uppercase font-bold text-[#5F6B61]">
            Allocated to Roster
          </span>
          <span className="font-mono font-bold text-sm text-[#205823]">
            {formatCurrency(payment.allocatedAmount)}
          </span>
        </div>
        <div className="flex sm:flex-col justify-between sm:justify-start items-center sm:items-start">
          <span className="text-[10px] uppercase font-bold text-[#5F6B61]">
            Remaining Unallocated
          </span>
          <span
            className={`font-mono font-extrabold text-sm ${
              payment.remainingUnallocated > 0.001 ? "text-amber-800" : "text-emerald-800"
            }`}
          >
            {formatCurrency(payment.remainingUnallocated <= 0.001 ? 0 : payment.remainingUnallocated)}
          </span>
        </div>
      </div>

      {/* Transaction Details Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs pt-1">
        <div>
          <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
            Method
          </span>
          <span className="font-semibold text-[#172019]">
            {PAYMENT_METHOD_LABELS[payment.paymentMethod] || payment.paymentMethod}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
            Reference Number
          </span>
          <span className="font-mono text-[#172019]">
            {payment.referenceNumber || "—"}
          </span>
        </div>

        <div>
          <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
            Created Date
          </span>
          <span className="text-[#172019]">
            {formatDate(payment.createdAt)}
          </span>
        </div>

        {payment.verifiedAt && (
          <div>
            <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
              Verified Date
            </span>
            <span className="text-[#172019]">
              {formatDate(payment.verifiedAt)}
            </span>
          </div>
        )}

        {payment.receiptUrl && (
          <div className="sm:col-span-2">
            <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
              Receipt File
            </span>
            <span className="text-xs text-[#205823] truncate block font-mono">
              {payment.receiptUrl}
            </span>
          </div>
        )}
      </div>

      {payment.notes && (
        <div className="pt-2 text-xs text-[#5F6B61] border-t border-[#DDE3DE]/60">
          <span className="font-bold text-[#172019]">Payment Notes:</span> {payment.notes}
        </div>
      )}

      {/* Allocation History Section */}
      {isLegacy && allocations.length > 0 && (
        <div className="pt-2 border-t border-[#DDE3DE]/60 space-y-3">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs font-bold text-[#172019] flex items-center gap-1.5 hover:text-[#205823] cursor-pointer"
            >
              <span>Allocation History</span>
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-[#DDE3DE] text-[#172019]">
                {activeAllocations.length} Active
                {reversedAllocations.length > 0 && `, ${reversedAllocations.length} Reversed`}
              </span>
              <span className="text-[10px] text-[#5F6B61]">
                {showHistory ? "▲" : "▼"}
              </span>
            </button>
          </div>

          {showHistory && (
            <div className="space-y-2">
              {allocations.map((alloc) => {
                const isReversed = alloc.reversedAt !== null;
                return (
                  <div
                    key={alloc.id}
                    className={`rounded-xl border p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      isReversed
                        ? "border-[#DDE3DE] bg-[#FAFAF8] opacity-75"
                        : "border-[#DDE3DE] bg-white shadow-2xs"
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-[#172019]">
                          {alloc.player.fullName}
                        </span>
                        {alloc.player.jerseyNumber !== null && (
                          <span className="font-mono text-[10px] text-[#5F6B61]">
                            #{alloc.player.jerseyNumber}
                          </span>
                        )}
                        {alloc.player.status === "REMOVED" && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-neutral-200 text-[#5F6B61]">
                            REMOVED
                          </span>
                        )}
                        <span className="font-mono font-bold text-[#205823]">
                          {formatCurrency(alloc.amount)}
                        </span>
                        {isReversed ? (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                            REVERSED
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            ACTIVE
                          </span>
                        )}
                      </div>

                      <div className="text-[11px] text-[#5F6B61] flex flex-wrap items-center gap-2">
                        <span>
                          Allocated {formatDate(alloc.createdAt)} by {alloc.allocatedByName}
                        </span>
                        <span>• Note: &ldquo;{alloc.reconciliationNote}&rdquo;</span>
                      </div>

                      {isReversed && (
                        <div className="text-[11px] text-rose-800 bg-rose-50/60 p-2 rounded-lg border border-rose-100 mt-1">
                          Reversed on {formatDate(alloc.reversedAt!)}
                          {alloc.reversedByName ? ` by ${alloc.reversedByName}` : ""}:{" "}
                          &ldquo;{alloc.reversalReason}&rdquo;
                        </div>
                      )}
                    </div>

                    {!isReversed && (
                      <button
                        type="button"
                        onClick={() =>
                          setReverseTarget({
                            id: alloc.id,
                            paymentId: payment.id,
                            playerName: alloc.player.fullName,
                            amount: alloc.amount,
                            registrationId,
                          })
                        }
                        className="text-xs font-semibold text-rose-700 hover:text-rose-900 border border-rose-200 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer self-start sm:self-center shrink-0"
                      >
                        Reverse Allocation
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
