"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { AdminPaymentListItem } from "@/lib/admin/payments";
import {
  PaymentStatusBadge,
  PaymentCompletionBadge,
  RegistrationStatusBadge,
} from "@/components/admin/StatusBadges";
import {
  PaymentCorrectionModal,
  PaymentCorrectionTarget,
} from "@/components/admin/PaymentCorrectionModal";

interface PaymentListViewProps {
  items: AdminPaymentListItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

export function PaymentListView({
  items,
  totalCount,
  page,
  pageSize,
  totalPages,
  hasPreviousPage,
  hasNextPage,
}: PaymentListViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [correctionTarget, setCorrectionTarget] =
    useState<PaymentCorrectionTarget | null>(null);

  const createPageUrl = (targetPage: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", targetPage.toString());
    return `${pathname}?${params.toString()}`;
  };

  const handleOpenCorrection = (item: AdminPaymentListItem) => {
    setCorrectionTarget({
      id: item.id,
      registrationId: item.registrationId,
      registrationCode: item.registrationCode,
      teamName: item.teamName,
      playerName: item.fullName,
      amount: item.amount,
      status: item.status,
      paymentMethod: item.paymentMethod,
      referenceNumber: item.referenceNumber,
    });
  };

  const handleCorrectionSuccess = () => {
    router.refresh();
  };

  const startRecord = totalCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const endRecord = Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-4">
      {/* Correction Modal */}
      <PaymentCorrectionModal
        isOpen={Boolean(correctionTarget)}
        onClose={() => setCorrectionTarget(null)}
        onSuccess={handleCorrectionSuccess}
        payment={correctionTarget}
      />

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#DDE3DE] p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-[#FAFAF8] border border-[#DDE3DE] flex items-center justify-center mx-auto text-[#5F6B61] mb-3">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
          </div>
          <h3 className="text-base font-bold text-[#172019]">
            No payments found
          </h3>
          <p className="text-xs text-[#5F6B61] mt-1 max-w-sm mx-auto">
            No payment records match the selected search criteria or filters.
          </p>
        </div>
      ) : (
        <>
          {/* ============================================================ */}
          {/* MOBILE VIEW (< md): Mobile-first Payment Cards (Section I) */}
          {/* ============================================================ */}
          <div className="block md:hidden space-y-3.5">
            {items.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-[#DDE3DE] p-4 shadow-xs space-y-3.5"
              >
                {/* Header: Player Name or Legacy demarcation */}
                <div className="flex items-start justify-between gap-2 border-b border-[#DDE3DE]/60 pb-3">
                  <div className="min-w-0">
                    {item.isLegacyUnallocated ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                        Legacy / Unallocated Payment
                      </span>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="font-extrabold text-sm text-[#172019] truncate">
                          {item.fullName}
                        </span>
                        {item.jerseyNumber !== null && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#FAFAF8] border border-[#DDE3DE] text-[#5F6B61]">
                            #{item.jerseyNumber}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="text-xs text-[#5F6B61] mt-0.5 truncate">
                      <span className="font-semibold text-[#172019]">
                        {item.teamName}
                      </span>
                      {" • "}
                      <span>{item.categoryName}</span>
                    </div>

                    <div className="mt-1">
                      <span className="font-mono text-[10px] font-bold text-[#205823] px-1.5 py-0.5 rounded bg-[#205823]/10 border border-[#205823]/20">
                        {item.registrationCode}
                      </span>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono font-extrabold text-base text-[#172019]">
                      {formatCurrency(item.amount)}
                    </div>
                    <div className="mt-1 flex justify-end">
                      <PaymentStatusBadge status={item.status} />
                    </div>
                  </div>
                </div>

                {/* Transaction details: Method, Reference, Verification */}
                <div className="grid grid-cols-2 gap-2 text-xs bg-[#FAFAF8] p-3 rounded-xl border border-[#DDE3DE]/80">
                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                      Method
                    </span>
                    <span className="font-semibold text-[#172019]">
                      {item.paymentMethod}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                      Reference
                    </span>
                    <span className="font-mono text-[11px] text-[#172019] truncate block">
                      {item.referenceNumber || "—"}
                    </span>
                  </div>

                  <div className="col-span-2 pt-1 border-t border-[#DDE3DE]/60 flex items-center justify-between text-[11px] text-[#5F6B61]">
                    <span>
                      Created: {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                    {item.verifiedAt && (
                      <span className="text-[#205823]">
                        Verified {new Date(item.verifiedAt).toLocaleDateString()}
                        {item.verifierDisplayName ? ` by ${item.verifierDisplayName}` : ""}
                      </span>
                    )}
                  </div>
                </div>

                {/* TEAM PAYMENT Summary Box */}
                <div className="p-3 rounded-xl bg-white border border-[#DDE3DE] text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[#5F6B61]">
                      Team Payment
                    </span>
                    <PaymentCompletionBadge
                      status={item.paymentCompleteness}
                      size="xs"
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#172019]">
                      {item.paidPlayerCount} of {item.rosterCount} Paid
                    </span>
                    <span className="text-[#5F6B61]">
                      {formatCurrency(item.verifiedPaidAmount)} /{" "}
                      {formatCurrency(item.expectedAmount)}
                    </span>
                  </div>

                  <div className="text-[11px] flex items-center justify-between text-[#5F6B61] pt-1 border-t border-[#DDE3DE]/40">
                    <span>Outstanding Balance:</span>
                    <span
                      className={`font-mono font-bold ${
                        item.balance > 0 ? "text-amber-700" : "text-[#205823]"
                      }`}
                    >
                      {formatCurrency(item.balance)}
                    </span>
                  </div>
                </div>

                {/* Actions: Minimum comfortable touch targets */}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleOpenCorrection(item)}
                    className="flex-1 py-2.5 px-3 text-xs font-bold text-[#172019] bg-white hover:bg-[#FAFAF8] active:bg-[#DDE3DE]/50 border border-[#DDE3DE] rounded-xl text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] min-h-[44px] flex items-center justify-center gap-1.5"
                  >
                    <svg
                      className="w-3.5 h-3.5 text-[#5F6B61]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span>Correct Details</span>
                  </button>

                  <Link
                    href={`/admin/registrations/${item.registrationId}`}
                    className="flex-1 py-2.5 px-3 text-xs font-bold text-[#205823] bg-[#205823]/10 hover:bg-[#205823]/20 active:bg-[#205823]/30 border border-[#205823]/20 rounded-xl text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] min-h-[44px] flex items-center justify-center gap-1"
                  >
                    <span>View Registration</span>
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {/* ============================================================ */}
          {/* DESKTOP VIEW (>= md): Desktop Table (Section J) */}
          {/* ============================================================ */}
          <div className="hidden md:block bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#DDE3DE] bg-[#FAFAF8] text-[#5F6B61] font-bold">
                    <th scope="col" className="py-3 px-4">
                      Player
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Team / Division
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Registration
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Amount
                    </th>
                    <th scope="col" className="py-3 px-4 text-center">
                      Status
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Method / Ref
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Verified Info
                    </th>
                    <th scope="col" className="py-3 px-4">
                      Team Payment
                    </th>
                    <th scope="col" className="py-3 px-4 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE3DE] text-[#172019]">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#FAFAF8]/80 transition-colors"
                    >
                      {/* Player Column */}
                      <td className="py-3 px-4">
                        {item.isLegacyUnallocated ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            Legacy / Unallocated
                          </span>
                        ) : (
                          <div>
                            <span className="font-bold text-[#172019] block">
                              {item.fullName}
                            </span>
                            {item.jerseyNumber !== null && (
                              <span className="font-mono text-[10px] text-[#5F6B61]">
                                Jersey #{item.jerseyNumber}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Team / Division */}
                      <td className="py-3 px-4">
                        <span className="font-semibold text-[#172019] block truncate max-w-[140px]">
                          {item.teamName}
                        </span>
                        <span className="text-[11px] text-[#5F6B61] block truncate max-w-[140px]">
                          {item.categoryName}
                        </span>
                      </td>

                      {/* Registration */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-bold text-[#205823] block text-[11px]">
                          {item.registrationCode}
                        </span>
                        <div className="mt-0.5">
                          <RegistrationStatusBadge
                            status={item.registrationStatus}
                          />
                        </div>
                      </td>

                      {/* Amount */}
                      <td className="py-3 px-4 text-right font-mono font-bold text-[#172019] whitespace-nowrap">
                        {formatCurrency(item.amount)}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <PaymentStatusBadge status={item.status} />
                      </td>

                      {/* Method / Ref */}
                      <td className="py-3 px-4">
                        <span className="font-medium text-[#172019] block">
                          {item.paymentMethod}
                        </span>
                        <span className="font-mono text-[11px] text-[#5F6B61] block truncate max-w-[120px]">
                          {item.referenceNumber || "—"}
                        </span>
                      </td>

                      {/* Verified Info */}
                      <td className="py-3 px-4 text-[11px] text-[#5F6B61]">
                        {item.verifiedAt ? (
                          <div>
                            <span className="text-[#205823] font-medium block">
                              {new Date(item.verifiedAt).toLocaleDateString()}
                            </span>
                            <span className="truncate block max-w-[110px]">
                              {item.verifierDisplayName || "Admin"}
                            </span>
                          </div>
                        ) : (
                          <span>Unverified</span>
                        )}
                      </td>

                      {/* Team Payment Accounting Context */}
                      <td className="py-3 px-4">
                        <div className="space-y-0.5">
                          <PaymentCompletionBadge
                            status={item.paymentCompleteness}
                            size="xs"
                          />
                          <div className="text-[10px] font-mono text-[#5F6B61]">
                            {item.paidPlayerCount}/{item.rosterCount} Paid (Bal:{" "}
                            {formatCurrency(item.balance)})
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          <button
                            type="button"
                            onClick={() => handleOpenCorrection(item)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#172019] hover:bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                            title="Correct payment method or reference number"
                          >
                            Correct
                          </button>
                          <Link
                            href={`/admin/registrations/${item.registrationId}`}
                            className="px-2.5 py-1 text-xs font-bold text-[#205823] hover:bg-[#205823]/10 border border-[#205823]/20 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                            title="View full registration details"
                          >
                            View
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ============================================================ */}
          {/* PAGINATION CONTROLS (Section T) */}
          {/* ============================================================ */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
            <div className="text-[#5F6B61] text-center sm:text-left">
              Showing <span className="font-bold text-[#172019]">{startRecord}</span> to{" "}
              <span className="font-bold text-[#172019]">{endRecord}</span> of{" "}
              <span className="font-bold text-[#172019]">{totalCount}</span> payments
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                {hasPreviousPage ? (
                  <Link
                    href={createPageUrl(page - 1)}
                    className="px-3 py-1.5 font-semibold text-[#172019] bg-[#FAFAF8] hover:bg-[#DDE3DE]/50 border border-[#DDE3DE] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  >
                    Previous
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 font-semibold text-[#5F6B61]/40 bg-[#FAFAF8] border border-[#DDE3DE]/40 rounded-xl cursor-not-allowed">
                    Previous
                  </span>
                )}

                <span className="px-2 font-mono text-[#5F6B61]">
                  Page {page} of {totalPages}
                </span>

                {hasNextPage ? (
                  <Link
                    href={createPageUrl(page + 1)}
                    className="px-3 py-1.5 font-semibold text-[#172019] bg-[#FAFAF8] hover:bg-[#DDE3DE]/50 border border-[#DDE3DE] rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  >
                    Next
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 font-semibold text-[#5F6B61]/40 bg-[#FAFAF8] border border-[#DDE3DE]/40 rounded-xl cursor-not-allowed">
                    Next
                  </span>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
