import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import {
  getDashboardSummaryCounts,
  getDashboardAccountingTotals,
  getRecentRegistrations,
  RecentRegistrationItem,
} from "@/lib/admin/dashboard";
import {
  RegistrationStatusBadge,
  PaymentCompletionBadge,
} from "@/components/admin/StatusBadges";

export const metadata: Metadata = {
  title: "Admin Dashboard | Mahatao Volleyball Association",
  description: "Mahatao Volleyball Association administrative dashboard and real-time operations.",
};

export const dynamic = "force-dynamic";

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

export default async function AdminDashboardPage() {
  const [summary, accounting, recentRegistrations] = await Promise.all([
    getDashboardSummaryCounts(),
    getDashboardAccountingTotals(),
    getRecentRegistrations(5),
  ]);

  return (
    <div className="space-y-8 pb-12">
      {/* ============================================================ */}
      {/* SECTION A: PAGE HEADING */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#DDE3DE]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172019]">
              Admin Dashboard
            </h1>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
              Live Overview
            </span>
          </div>
          <p className="text-sm text-[#5F6B61] mt-1">
            Real-time overview of association tournament team registrations, per-player payments, and financial accounts.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#5F6B61]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Development Database</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION B: TOURNAMENT ACCOUNTING & FINANCIAL SUMMARY */}
      {/* ============================================================ */}
      <section aria-label="Tournament Accounting Totals" className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#172019] flex items-center gap-2">
              <span>🏆 Tournament Accounting Overview</span>
              {accounting.leagueName && (
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
                  {accounting.leagueName}
                </span>
              )}
            </h2>
            <p className="text-xs text-[#5F6B61]">
              Derived from canonical per-player accounting (₱300/official roster member, no 12-player cap).
            </p>
          </div>

          <Link
            href="/admin/registrations"
            className="text-xs font-bold text-[#205823] hover:underline self-start sm:self-auto"
          >
            View All Registrations →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
          {/* Card 1: Total Expected */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#172019]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Total Expected Fees
              </span>
              <span className="p-2 rounded-lg bg-neutral-100 text-[#172019]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-extrabold text-[#172019] tracking-tight font-mono">
                {formatCurrency(accounting.totalExpectedAmount)}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                {accounting.totalRosterPlayers} roster players assessed across {accounting.totalRegistrations} teams
              </p>
            </div>
          </div>

          {/* Card 2: Total Verified Paid */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#205823]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Total Verified Paid
              </span>
              <span className="p-2 rounded-lg bg-emerald-50 text-[#205823]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-extrabold text-[#205823] tracking-tight font-mono">
                {formatCurrency(accounting.totalVerifiedPaidAmount)}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                {accounting.totalPaidPlayers} players paid (
                {accounting.totalRosterPlayers > 0
                  ? Math.round((accounting.totalPaidPlayers / accounting.totalRosterPlayers) * 100)
                  : 0}
                % collected)
              </p>
            </div>
          </div>

          {/* Card 3: Outstanding Balance */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Outstanding Balance
              </span>
              <span className="p-2 rounded-lg bg-amber-50 text-amber-700">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <span className="text-2xl sm:text-3xl font-extrabold text-amber-800 tracking-tight font-mono">
                {formatCurrency(accounting.totalOutstandingBalance)}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                {accounting.totalUnpaidPlayers} unpaid player fees pending settlement
              </p>
            </div>
          </div>

          {/* Card 4: Verified Teams Breakdown */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#F5D025]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Verified Teams
              </span>
              <span className="p-2 rounded-lg bg-amber-50 text-[#B99531]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-3">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-[#172019] tracking-tight">
                  {accounting.verifiedTeams}
                </span>
                <span className="text-xs text-[#5F6B61]">Total Verified</span>
              </div>
              <div className="mt-2 text-xs flex flex-col gap-0.5 text-[#5F6B61]">
                <div className="flex items-center justify-between">
                  <span className="text-[#205823] font-semibold">Payment Complete:</span>
                  <span className="font-bold text-[#172019]">{accounting.verifiedPaymentCompleteTeams}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-amber-800 font-semibold">Payment Incomplete:</span>
                  <span className="font-bold text-[#172019]">{accounting.verifiedPaymentIncompleteTeams}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION C: OPERATIONAL WORKFLOW COUNTS */}
      {/* ============================================================ */}
      <section aria-label="Workflow Status Counts">
        <h3 className="text-sm font-bold uppercase tracking-wider text-[#5F6B61] mb-3">
          Workflow Pipeline Counts
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-xl border border-[#DDE3DE] p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-[#5F6B61] block">
              Pending Entries
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[#172019] mt-1 block">
              {summary.pendingRegistrations}
            </span>
          </div>

          <div className="bg-white rounded-xl border border-[#DDE3DE] p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-[#5F6B61] block">
              Verified Entries
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[#205823] mt-1 block">
              {summary.verifiedRegistrations}
            </span>
          </div>

          <div className="bg-white rounded-xl border border-[#DDE3DE] p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-[#5F6B61] block">
              Pending Payments
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-amber-700 mt-1 block">
              {summary.pendingPayments}
            </span>
          </div>

          <div className="bg-white rounded-xl border border-[#DDE3DE] p-4 shadow-xs">
            <span className="text-[11px] font-bold uppercase text-[#5F6B61] block">
              Total Submissions
            </span>
            <span className="text-xl sm:text-2xl font-extrabold text-[#172019] mt-1 block">
              {summary.totalRegistrations}
            </span>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION D: RECENT REGISTRATIONS */}
      {/* ============================================================ */}
      <section aria-label="Recent Registrations">
        <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
          {/* Section Header */}
          <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#172019]">
                Recent Registrations & Payment Status
              </h2>
              <p className="text-xs text-[#5F6B61] mt-0.5">
                Showing the latest 5 tournament entries with canonical per-player accounting figures.
              </p>
            </div>
            <Link
              href="/admin/registrations"
              className="text-xs font-bold text-[#205823] hover:underline self-start sm:self-auto"
            >
              View Full List →
            </Link>
          </div>

          {/* Content: Empty State vs Records */}
          {recentRegistrations.length === 0 ? (
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
              <h3 className="text-base font-bold text-[#172019]">
                No registrations recorded yet
              </h3>
              <p className="text-sm text-[#5F6B61] max-w-md mt-1 leading-relaxed">
                When teams submit entries through the public registration portal, their submissions, roster player counts, and payment completeness will appear here.
              </p>
            </div>
          ) : (
            <div>
              {/* DESKTOP TABLE VIEW (lg:block, hidden on mobile) */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAFAF8] text-[#5F6B61] text-xs uppercase font-bold tracking-wider border-b border-[#DDE3DE]">
                    <tr>
                      <th scope="col" className="py-3.5 px-6">
                        Reference Code
                      </th>
                      <th scope="col" className="py-3.5 px-6">
                        Team & Category
                      </th>
                      <th scope="col" className="py-3.5 px-4 text-center">
                        Roster
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
                      <th scope="col" className="py-3.5 px-6 text-center">
                        Payment Completeness
                      </th>
                      <th scope="col" className="py-3.5 px-6 text-center">
                        Registration Status
                      </th>
                      <th scope="col" className="py-3.5 px-6 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDE3DE] text-[#172019]">
                    {recentRegistrations.map((item: RecentRegistrationItem) => (
                      <tr key={item.id} className="hover:bg-[#FAFAF8]/80 transition-colors">
                        <td className="py-4 px-6 font-mono font-bold text-xs text-[#205823] whitespace-nowrap">
                          {item.registrationCode}
                        </td>
                        <td className="py-4 px-6">
                          <Link
                            href={`/admin/registrations/${item.id}`}
                            className="font-bold text-[#172019] hover:text-[#205823] hover:underline block"
                          >
                            {item.teamName}
                          </Link>
                          <span className="text-xs text-[#5F6B61] block mt-0.5">
                            {item.categoryName} • {item.leagueName}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-center whitespace-nowrap">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold bg-[#FAFAF8] text-[#172019] border border-[#DDE3DE]">
                            {item.playerCount} {item.playerCount === 1 ? "player" : "players"}
                          </span>
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-xs font-semibold text-[#172019] whitespace-nowrap">
                          {formatCurrency(item.expectedAmount)}
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-xs font-bold text-[#205823] whitespace-nowrap">
                          {formatCurrency(item.verifiedPaidAmount)}
                        </td>
                        <td className="py-4 px-4 text-right font-mono text-xs whitespace-nowrap">
                          <span
                            className={`font-bold ${
                              item.balance > 0
                                ? "text-amber-700"
                                : item.balance < 0
                                ? "text-blue-700"
                                : "text-[#5F6B61]"
                            }`}
                          >
                            {formatCurrency(item.balance)}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-center whitespace-nowrap">
                          <div className="flex flex-col items-center gap-1">
                            <PaymentCompletionBadge
                              status={item.paymentCompletionStatus}
                              size="xs"
                            />
                            <span className="text-[11px] text-[#5F6B61]">
                              {item.paidPlayerCount} of {item.playerCount} Paid
                            </span>
                          </div>
                        </td>
                        <td className="py-4 px-6 text-center whitespace-nowrap">
                          <RegistrationStatusBadge status={item.registrationStatus} />
                        </td>
                        <td className="py-4 px-6 text-right whitespace-nowrap">
                          <Link
                            href={`/admin/registrations/${item.id}`}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#205823] bg-[#eef5ef] hover:bg-[#205823] hover:text-white transition-colors"
                          >
                            <span>Inspect</span>
                            <span aria-hidden="true">→</span>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD VIEW (block on mobile, hidden on lg+) */}
              <div className="lg:hidden divide-y divide-[#DDE3DE]">
                {recentRegistrations.map((item: RecentRegistrationItem) => (
                  <div key={item.id} className="p-4 sm:p-5 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono font-bold text-xs text-[#205823]">
                        {item.registrationCode}
                      </span>
                      <span className="text-xs text-[#5F6B61]">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-base text-[#172019]">
                        <Link
                          href={`/admin/registrations/${item.id}`}
                          className="hover:text-[#205823]"
                        >
                          {item.teamName}
                        </Link>
                      </h4>
                      <p className="text-xs text-[#5F6B61] mt-0.5">
                        {item.categoryName} • {item.playerCount}{" "}
                        {item.playerCount === 1 ? "player" : "players"}
                      </p>
                    </div>

                    {/* Accounting Mini Grid */}
                    <div className="bg-[#FAFAF8] rounded-xl p-3 border border-[#DDE3DE] grid grid-cols-3 gap-2 text-center text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                          Expected
                        </span>
                        <span className="font-mono font-bold text-[#172019] text-xs sm:text-sm mt-0.5 block">
                          {formatCurrency(item.expectedAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                          Paid
                        </span>
                        <span className="font-mono font-bold text-[#205823] text-xs sm:text-sm mt-0.5 block">
                          {formatCurrency(item.verifiedPaidAmount)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                          Balance
                        </span>
                        <span
                          className={`font-mono font-bold text-xs sm:text-sm mt-0.5 block ${
                            item.balance > 0 ? "text-amber-700" : "text-[#5F6B61]"
                          }`}
                        >
                          {formatCurrency(item.balance)}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-[#DDE3DE]/60 text-xs">
                      <div className="flex items-center gap-2">
                        <PaymentCompletionBadge
                          status={item.paymentCompletionStatus}
                          size="xs"
                        />
                        <span className="text-xs text-[#5F6B61]">
                          ({item.paidPlayerCount}/{item.playerCount})
                        </span>
                      </div>
                      <RegistrationStatusBadge status={item.registrationStatus} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
