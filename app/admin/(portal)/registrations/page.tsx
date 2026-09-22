import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import {
  getAdminRegistrations,
  getFilterCategories,
  AdminRegistrationListItem,
} from "@/lib/admin/registrations";
import { RegistrationFilters } from "@/components/admin/RegistrationFilters";
import {
  RegistrationStatusBadge,
  PaymentCompletionBadge,
} from "@/components/admin/StatusBadges";
import { registration_status, payment_status } from "@prisma/client";

export const metadata: Metadata = {
  title: "Registrations | MVA Admin",
  description: "Administrative management and review of tournament team registrations.",
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    paymentStatus?: string;
    categoryId?: string;
    page?: string;
  }>;
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

export default async function AdminRegistrationsPage({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;

  const q = resolvedParams.q?.trim() || undefined;
  const rawStatus = resolvedParams.status?.trim();
  const rawPaymentStatus = resolvedParams.paymentStatus?.trim();
  const categoryId = resolvedParams.categoryId?.trim() || undefined;
  const page = Math.max(1, parseInt(resolvedParams.page || "1", 10) || 1);

  // Validate enums against Prisma definitions
  const validRegistrationStatuses: registration_status[] = [
    "PENDING_PAYMENT",
    "VERIFIED",
    "REJECTED",
    "CANCELLED",
  ];
  const validPaymentStatuses: payment_status[] = [
    "PENDING",
    "VERIFIED",
    "REJECTED",
    "REFUNDED",
  ];

  const status = validRegistrationStatuses.includes(
    rawStatus as registration_status
  )
    ? (rawStatus as registration_status)
    : undefined;

  const paymentStatus = validPaymentStatuses.includes(
    rawPaymentStatus as payment_status
  )
    ? (rawPaymentStatus as payment_status)
    : undefined;

  const [data, categories] = await Promise.all([
    getAdminRegistrations({
      page,
      pageSize: 20,
      q,
      status,
      paymentStatus,
      categoryId,
    }),
    getFilterCategories(),
  ]);

  const hasActiveFilters = Boolean(q || status || paymentStatus || categoryId);

  // Helper to construct pagination URLs while preserving current filters
  const buildPageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (paymentStatus) params.set("paymentStatus", paymentStatus);
    if (categoryId) params.set("categoryId", categoryId);
    params.set("page", targetPage.toString());
    return `/admin/registrations?${params.toString()}`;
  };

  const startRecord = data.totalCount === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const endRecord = Math.min(data.page * data.pageSize, data.totalCount);

  return (
    <div className="space-y-6 pb-12">
      {/* ============================================================ */}
      {/* SECTION A: PAGE HEADING */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#DDE3DE]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172019]">
              Team Registrations
            </h1>
            {hasActiveFilters ? (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-800 border border-amber-500/20">
                {data.totalCount} {data.totalCount === 1 ? "Filtered Match" : "Filtered Matches"}
              </span>
            ) : (
              <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
                {data.totalCount} {data.totalCount === 1 ? "Record" : "Records"}
              </span>
            )}
          </div>
          <p className="text-sm text-[#5F6B61] mt-1">
            Browse, search, and inspect association tournament registration entries and canonical accounting balances.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#5F6B61] bg-[#FAFAF8] px-3 py-1.5 rounded-lg border border-[#DDE3DE]">
            Sorted: Newest First
          </span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION B: SEARCH & FILTERS BAR */}
      {/* ============================================================ */}
      <RegistrationFilters
        categories={categories}
        currentQuery={q}
        currentStatus={status}
        currentPaymentStatus={paymentStatus}
        currentCategoryId={categoryId}
      />

      {/* ============================================================ */}
      {/* SECTION C: REGISTRATION LIST TABLE / CARDS */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
        {data.totalCount === 0 ? (
          /* EMPTY STATE */
          <div className="py-16 px-6 text-center flex flex-col items-center justify-center">
            <div className="w-16 h-16 rounded-full bg-[#FAFAF8] border border-[#DDE3DE] flex items-center justify-center text-[#5F6B61] mb-4">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            {hasActiveFilters ? (
              <>
                <h2 className="text-base font-bold text-[#172019]">
                  No registrations match your current search and filters
                </h2>
                <p className="text-sm text-[#5F6B61] max-w-md mt-1 leading-relaxed">
                  No records matched your search query or filter criteria. Try adjusting your search term or clearing the active filters.
                </p>
                <div className="mt-5">
                  <Link
                    href="/admin/registrations"
                    className="inline-flex items-center min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold text-[#205823] bg-[#eef5ef] hover:bg-[#dcebdd] border border-[#205823]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  >
                    Clear all filters
                  </Link>
                </div>
              </>
            ) : (
              <>
                <h2 className="text-base font-bold text-[#172019]">
                  No registrations recorded yet
                </h2>
                <p className="text-sm text-[#5F6B61] max-w-md mt-1 leading-relaxed">
                  Public tournament entries submitted by teams will appear here in real-time.
                </p>
              </>
            )}
          </div>
        ) : (
          <div>
            {/* DESKTOP TABLE VIEW (lg:block, hidden on mobile) */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-[#FAFAF8] text-[#5F6B61] text-xs uppercase font-bold tracking-wider border-b border-[#DDE3DE]">
                  <tr>
                    <th scope="col" className="py-3.5 px-5">
                      Reference Code
                    </th>
                    <th scope="col" className="py-3.5 px-5">
                      Team & Division
                    </th>
                    <th scope="col" className="py-3.5 px-3 text-center">
                      Roster
                    </th>
                    <th scope="col" className="py-3.5 px-5 text-center">
                      Payment Completeness
                    </th>
                    <th scope="col" className="py-3.5 px-4 text-right">
                      Expected
                    </th>
                    <th scope="col" className="py-3.5 px-4 text-right">
                      Paid
                    </th>
                    <th scope="col" className="py-3.5 px-4 text-right">
                      Balance
                    </th>
                    <th scope="col" className="py-3.5 px-5 text-center">
                      Registration Status
                    </th>
                    <th scope="col" className="py-3.5 px-5 text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DDE3DE] text-[#172019]">
                  {data.items.map((item: AdminRegistrationListItem) => (
                    <tr
                      key={item.id}
                      className="hover:bg-[#FAFAF8]/80 transition-colors group"
                    >
                      {/* Reference Code */}
                      <td className="py-4 px-5 font-mono font-bold text-xs whitespace-nowrap">
                        <span className="text-[#205823] bg-[#205823]/5 px-2 py-1 rounded-md border border-[#205823]/15 inline-block">
                          {item.registrationCode}
                        </span>
                      </td>

                      {/* Team & Division */}
                      <td className="py-4 px-5">
                        <Link
                          href={`/admin/registrations/${item.id}`}
                          className="font-bold text-base text-[#172019] hover:text-[#205823] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-xs block leading-snug"
                        >
                          {item.teamName}
                        </Link>
                        <span className="text-xs text-[#5F6B61] block mt-0.5">
                          {item.categoryName} &bull; {item.leagueName}
                        </span>
                      </td>

                      {/* Roster Count */}
                      <td className="py-4 px-3 text-center whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#FAFAF8] text-[#172019] border border-[#DDE3DE]">
                          {item.playerCount} {item.playerCount === 1 ? "player" : "players"}
                        </span>
                      </td>

                      {/* Payment Completeness */}
                      <td className="py-4 px-5 text-center whitespace-nowrap">
                        <div className="flex flex-col items-center gap-1">
                          <PaymentCompletionBadge
                            status={item.paymentCompletionStatus}
                            size="xs"
                          />
                          <span className="text-[11px] font-medium text-[#5F6B61]">
                            {item.paidPlayerCount} of {item.playerCount} Paid
                          </span>
                          {item.hasLegacyPayments && (
                            <div className="mt-1 flex flex-col items-center">
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-300">
                                Payment needs review
                              </span>
                              <span className="text-[10px] text-amber-700 mt-0.5">
                                Unassigned payment
                              </span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Expected */}
                      <td className="py-4 px-4 text-right font-mono text-xs font-medium text-[#5F6B61] whitespace-nowrap">
                        {formatCurrency(item.expectedAmount)}
                      </td>

                      {/* Verified Paid */}
                      <td className="py-4 px-4 text-right font-mono text-xs font-bold text-[#205823] whitespace-nowrap">
                        {formatCurrency(item.verifiedPaidAmount)}
                      </td>

                      {/* Balance */}
                      <td className="py-4 px-4 text-right font-mono text-xs whitespace-nowrap">
                        {item.balance > 0 ? (
                          <div>
                            <span className="font-extrabold text-amber-800 block text-xs">
                              {formatCurrency(item.balance)}
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700">
                              Due
                            </span>
                          </div>
                        ) : item.balance < 0 ? (
                          <div>
                            <span className="font-bold text-blue-700 block text-xs">
                              {formatCurrency(item.balance)}
                            </span>
                            <span className="text-[10px] font-medium uppercase tracking-wider text-blue-700">
                              Credit
                            </span>
                          </div>
                        ) : (
                          <div>
                            <span className="font-bold text-[#205823] block text-xs">
                              {formatCurrency(0)}
                            </span>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#205823]">
                              Settled
                            </span>
                          </div>
                        )}
                      </td>

                      {/* Registration Status */}
                      <td className="py-4 px-5 text-center whitespace-nowrap">
                        <RegistrationStatusBadge status={item.status} />
                      </td>

                      {/* Action */}
                      <td className="py-4 px-5 text-right whitespace-nowrap">
                        <Link
                          href={`/admin/registrations/${item.id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-[#205823] bg-[#eef5ef] hover:bg-[#205823] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] min-h-[36px]"
                        >
                          <span>View Details</span>
                          <span aria-hidden="true">&rarr;</span>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* MOBILE & TABLET CARD VIEW (Visible below lg: 360px, 390px, 430px) */}
            <div className="lg:hidden divide-y divide-[#DDE3DE]">
              {data.items.map((item: AdminRegistrationListItem) => (
                <div key={item.id} className="p-4 sm:p-5 space-y-3.5">
                  {/* Card Top: Team Name as Primary Title + Registration Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h2 className="font-bold text-base text-[#172019] leading-snug">
                        <Link
                          href={`/admin/registrations/${item.id}`}
                          className="hover:text-[#205823] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded block"
                        >
                          {item.teamName}
                        </Link>
                      </h2>
                      <p className="text-xs text-[#5F6B61] mt-0.5">
                        {item.categoryName} &bull; {item.leagueName}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <RegistrationStatusBadge status={item.status} />
                    </div>
                  </div>

                  {/* Reference Code and Submission Date Metadata */}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-mono font-bold text-xs text-[#205823] bg-[#205823]/5 px-2 py-0.5 rounded border border-[#205823]/15">
                      {item.registrationCode}
                    </span>
                    <span className="text-[11px] text-[#5F6B61]">
                      {formatDate(item.submittedAt)}
                    </span>
                  </div>

                  {/* Payment Completeness & Balance Container */}
                  <div className="space-y-2 pt-1 border-t border-[#DDE3DE]/60">
                    <div className="flex items-center justify-between gap-2">
                      <PaymentCompletionBadge
                        status={item.paymentCompletionStatus}
                        size="xs"
                      />
                      <span className="text-xs font-semibold text-[#172019]">
                        {item.paidPlayerCount} of {item.playerCount} Paid
                      </span>
                    </div>

                    {/* Balance & Fee Breakdown Box */}
                    <div
                      className={`rounded-xl p-3 border text-xs space-y-1.5 ${
                        item.balance > 0
                          ? "bg-amber-50/70 border-amber-200 text-amber-950"
                          : item.balance < 0
                          ? "bg-blue-50/70 border-blue-200 text-blue-950"
                          : "bg-[#eef5ef]/60 border-[#205823]/20 text-[#172019]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-[#5F6B61]">Balance:</span>
                        <span className="font-mono font-extrabold text-sm">
                          {item.balance > 0 ? (
                            <span className="text-amber-800">
                              {formatCurrency(item.balance)}{" "}
                              <span className="text-[10px] uppercase font-bold tracking-wider">Due</span>
                            </span>
                          ) : item.balance < 0 ? (
                            <span className="text-blue-700">
                              {formatCurrency(item.balance)}{" "}
                              <span className="text-[10px] uppercase font-bold tracking-wider">Credit</span>
                            </span>
                          ) : (
                            <span className="text-[#205823]">
                              {formatCurrency(0)}{" "}
                              <span className="text-[10px] uppercase font-bold tracking-wider">Settled</span>
                            </span>
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-[#5F6B61] pt-1 border-t border-black/5">
                        <span>
                          Expected: <strong className="font-mono text-[#172019]">{formatCurrency(item.expectedAmount)}</strong>
                        </span>
                        <span>
                          Paid: <strong className="font-mono text-[#205823]">{formatCurrency(item.verifiedPaidAmount)}</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Legacy Payment Review Notice */}
                  {item.hasLegacyPayments && (
                    <div className="rounded-xl bg-amber-50 border border-amber-300 p-3 text-xs text-amber-900 space-y-1.5">
                      <div className="flex items-center gap-1.5 font-bold text-amber-900">
                        <svg
                          className="w-4 h-4 text-amber-700 shrink-0"
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
                        <span>Payment needs review</span>
                      </div>
                      <p className="text-[11px] text-amber-800 leading-relaxed">
                        This registration has an older payment that isn&apos;t assigned to a specific player.
                      </p>
                      <div>
                        <Link
                          href={`/admin/registrations/${item.id}`}
                          className="inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:underline min-h-[36px] py-1"
                        >
                          <span>View payment details</span>
                          <span aria-hidden="true">&rarr;</span>
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Registrant & Roster Size */}
                  <div className="flex items-center justify-between text-xs text-[#5F6B61] pt-1">
                    <span>
                      Registrant: <strong className="text-[#172019]">{item.registrantName}</strong>
                    </span>
                    <span className="font-medium">
                      {item.playerCount} {item.playerCount === 1 ? "Player" : "Players"}
                    </span>
                  </div>

                  {/* Card Action Button (approaching 44-48px touch target) */}
                  <div className="pt-2">
                    <Link
                      href={`/admin/registrations/${item.id}`}
                      className="w-full min-h-[46px] flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-[#205823] bg-[#eef5ef] hover:bg-[#205823] hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                    >
                      <span>View Registration Details</span>
                      <span aria-hidden="true">&rarr;</span>
                    </Link>
                  </div>
                </div>
              ))}
            </div>

            {/* ============================================================ */}
            {/* PAGINATION BAR */}
            {/* ============================================================ */}
            <div className="p-4 sm:px-6 sm:py-4 border-t border-[#DDE3DE] bg-[#FAFAF8] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[#5F6B61]">
              <div>
                Showing <strong className="text-[#172019]">{startRecord}</strong> to{" "}
                <strong className="text-[#172019]">{endRecord}</strong> of{" "}
                <strong className="text-[#172019]">{data.totalCount}</strong>{" "}
                {hasActiveFilters ? "matching registrations" : "registrations"}
              </div>

              <div className="flex items-center gap-2">
                {data.page > 1 ? (
                  <Link
                    href={buildPageUrl(data.page - 1)}
                    className="px-3 py-1.5 rounded-lg border border-[#DDE3DE] bg-white text-[#172019] font-medium hover:bg-neutral-50 hover:border-neutral-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  >
                    ← Previous
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg border border-[#DDE3DE]/60 bg-neutral-100 text-[#5F6B61]/50 cursor-not-allowed select-none">
                    ← Previous
                  </span>
                )}

                <span className="px-2.5 py-1.5 rounded-lg bg-white border border-[#DDE3DE] font-semibold text-[#172019]">
                  Page {data.page} of {data.totalPages}
                </span>

                {data.page < data.totalPages ? (
                  <Link
                    href={buildPageUrl(data.page + 1)}
                    className="px-3 py-1.5 rounded-lg border border-[#DDE3DE] bg-white text-[#172019] font-medium hover:bg-neutral-50 hover:border-neutral-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  >
                    Next →
                  </Link>
                ) : (
                  <span className="px-3 py-1.5 rounded-lg border border-[#DDE3DE]/60 bg-neutral-100 text-[#5F6B61]/50 cursor-not-allowed select-none">
                    Next →
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
