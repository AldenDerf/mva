import React from "react";
import { Metadata } from "next";
import {
  getDashboardSummaryCounts,
  getRecentRegistrations,
  RecentRegistrationItem,
} from "@/lib/admin/dashboard";
import { Badge } from "@/components/ui/Badge";

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

function getRegistrationStatusBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return (
        <Badge variant="green" size="sm">
          Verified
        </Badge>
      );
    case "PENDING_PAYMENT":
      return (
        <Badge variant="gold" size="sm">
          Pending Payment
        </Badge>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          Rejected
        </span>
      );
    case "CANCELLED":
      return (
        <Badge variant="muted" size="sm">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="muted" size="sm">
          {status}
        </Badge>
      );
  }
}

function getPaymentStatusBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          Verified
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          Pending
        </span>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          Rejected
        </span>
      );
    case "REFUNDED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
          Refunded
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
          Unassessed
        </span>
      );
  }
}

export default async function AdminDashboardPage() {
  const summary = await getDashboardSummaryCounts();
  const recentRegistrations = await getRecentRegistrations(5);

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
              Read-Only
            </span>
          </div>
          <p className="text-sm text-[#5F6B61] mt-1">
            Real-time overview of association team registrations, payment verifications, and submissions.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-[#5F6B61]">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>Live Development Database</span>
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION B: SUMMARY METRICS CARDS */}
      {/* ============================================================ */}
      <section aria-label="Registration and Payment Metrics">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {/* Card 1: Pending Registrations */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#F5D025]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Pending Registrations
              </span>
              <span className="p-2 rounded-lg bg-amber-50 text-[#B99531]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-[#172019] tracking-tight">
                {summary.pendingRegistrations}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                Awaiting payment or initial review
              </p>
            </div>
          </div>

          {/* Card 2: Verified Registrations */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#205823]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Verified Registrations
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
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-[#205823] tracking-tight">
                {summary.verifiedRegistrations}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                Officially confirmed tournament entries
              </p>
            </div>
          </div>

          {/* Card 3: Pending Payments */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Pending Payments
              </span>
              <span className="p-2 rounded-lg bg-amber-50 text-amber-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-[#172019] tracking-tight">
                {summary.pendingPayments}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                Payment records pending confirmation
              </p>
            </div>
          </div>

          {/* Card 4: Total Submissions */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs flex flex-col justify-between relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-[#172019]" />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Total Registrations
              </span>
              <span className="p-2 rounded-lg bg-neutral-100 text-[#172019]">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </span>
            </div>
            <div className="mt-4">
              <span className="text-3xl font-extrabold text-[#172019] tracking-tight">
                {summary.totalRegistrations}
              </span>
              <p className="text-xs text-[#5F6B61] mt-1">
                All-time tournament registration entries
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* SECTION C & D: RECENT REGISTRATIONS (Table / Mobile Cards / Empty State) */}
      {/* ============================================================ */}
      <section aria-label="Recent Registrations">
        <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
          {/* Section Header */}
          <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-lg font-bold text-[#172019]">
                Recent Registrations
              </h2>
              <p className="text-xs text-[#5F6B61] mt-0.5">
                Showing the latest 5 tournament team entries submitted to the platform.
              </p>
            </div>
            <span className="text-xs font-medium text-[#5F6B61] bg-[#FAFAF8] px-3 py-1 rounded-full border border-[#DDE3DE] self-start sm:self-auto">
              Ordered: Newest First
            </span>
          </div>

          {/* Content: Empty State vs Records */}
          {recentRegistrations.length === 0 ? (
            /* SECTION D: EMPTY STATE */
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
                When teams submit their tournament entries through the public registration portal, their submissions, roster player counts, and payment statuses will appear here.
              </p>
              <div className="mt-4">
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#205823] bg-[#eef5ef] px-3 py-1 rounded-full border border-[#205823]/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#205823]" />
                  Awaiting public submissions
                </span>
              </div>
            </div>
          ) : (
            <div>
              {/* DESKTOP TABLE VIEW (md:block, hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAFAF8] text-[#5F6B61] text-xs uppercase font-bold tracking-wider border-b border-[#DDE3DE]">
                    <tr>
                      <th scope="col" className="py-3.5 px-6">
                        Reference Code
                      </th>
                      <th scope="col" className="py-3.5 px-6">
                        Team
                      </th>
                      <th scope="col" className="py-3.5 px-6">
                        Category
                      </th>
                      <th scope="col" className="py-3.5 px-4 text-center">
                        Roster
                      </th>
                      <th scope="col" className="py-3.5 px-6">
                        Registration
                      </th>
                      <th scope="col" className="py-3.5 px-6">
                        Payment
                      </th>
                      <th scope="col" className="py-3.5 px-6 text-right">
                        Submitted
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDE3DE] text-[#172019]">
                    {recentRegistrations.map((item: RecentRegistrationItem) => (
                      <tr key={item.id} className="hover:bg-[#FAFAF8]/80 transition-colors">
                        <td className="py-4 px-6 font-mono font-semibold text-xs text-[#205823]">
                          {item.registrationCode}
                        </td>
                        <td className="py-4 px-6 font-bold text-[#172019]">
                          {item.teamName}
                        </td>
                        <td className="py-4 px-6 text-[#5F6B61] text-xs">
                          {item.categoryName}
                        </td>
                        <td className="py-4 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-[#FAFAF8] text-[#172019] border border-[#DDE3DE]">
                            {item.playerCount} {item.playerCount === 1 ? "player" : "players"}
                          </span>
                        </td>
                        <td className="py-4 px-6">
                          {getRegistrationStatusBadge(item.registrationStatus)}
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex flex-col gap-0.5">
                            {getPaymentStatusBadge(item.paymentStatus)}
                            {item.paymentAmount > 0 && (
                              <span className="text-[11px] text-[#5F6B61]">
                                {formatCurrency(item.paymentAmount)}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-6 text-right text-xs text-[#5F6B61] whitespace-nowrap">
                          {formatDate(item.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* MOBILE CARD VIEW (block on mobile, hidden on md+) */}
              <div className="md:hidden divide-y divide-[#DDE3DE]">
                {recentRegistrations.map((item: RecentRegistrationItem) => (
                  <div key={item.id} className="p-4 space-y-3">
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
                        {item.teamName}
                      </h4>
                      <p className="text-xs text-[#5F6B61] mt-0.5">
                        {item.categoryName} • {item.playerCount} {item.playerCount === 1 ? "player" : "players"}
                      </p>
                    </div>

                    <div className="pt-2 flex items-center justify-between border-t border-[#DDE3DE]/60 text-xs">
                      <div>
                        <span className="text-[10px] text-[#5F6B61] uppercase tracking-wider block mb-1">
                          Registration
                        </span>
                        {getRegistrationStatusBadge(item.registrationStatus)}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-[#5F6B61] uppercase tracking-wider block mb-1">
                          Payment
                        </span>
                        {getPaymentStatusBadge(item.paymentStatus)}
                      </div>
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
