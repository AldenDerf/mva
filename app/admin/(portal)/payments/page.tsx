import React from "react";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import {
  getAdminPaymentsList,
  getAdminPaymentFilterCategories,
  AdminPaymentsQueryParams,
} from "@/lib/admin/payments";
import { PaymentFilters } from "@/components/admin/PaymentFilters";
import { PaymentListView } from "@/components/admin/PaymentListView";
import {
  payment_status,
  payment_method,
} from "@prisma/client";
import { PaymentCompletionStatus } from "@/lib/admin/accounting";
import { getMonitoringTournaments, resolveDivisionId, resolveTournamentId } from "@/lib/admin/monitoring";
import { getTournamentPaymentSummary } from "@/lib/admin/tournament-monitoring";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Payment Monitoring | MVA Admin",
  description: "Monitor, filter, and correct tournament payments with team accounting context.",
};

interface PageProps {
  searchParams: Promise<{
    q?: string;
    status?: string;
    method?: string;
    category?: string;
    tournamentId?: string;
    completeness?: string;
    verifiedOnly?: string;
    page?: string;
  }>;
}

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  // Enforce strict administrative authorization boundary
  await requireAdmin();

  const params = await searchParams;
  const tournaments = await getMonitoringTournaments();
  const tournamentId = resolveTournamentId(params.tournamentId, tournaments);
  const categoryId = resolveDivisionId(params.category, tournamentId, tournaments);
  if ((params.tournamentId && !tournamentId) || (params.category && !categoryId)) {
    const clean = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) if (value && key !== "page" && key !== "tournamentId" && key !== "category") clean.set(key, value);
    if (tournamentId) clean.set("tournamentId", tournamentId);
    if (categoryId) clean.set("category", categoryId);
    redirect(`/admin/payments${clean.size ? `?${clean}` : ""}`);
  }

  // Validate and parse query parameters
  const validStatuses: payment_status[] = [
    "PENDING",
    "VERIFIED",
    "REJECTED",
    "REFUNDED",
  ];
  const validMethods: payment_method[] = [
    "CASH",
    "GCASH",
    "BANK_TRANSFER",
    "OTHER",
  ];
  const validCompleteness: PaymentCompletionStatus[] = [
    "COMPLETE",
    "INCOMPLETE",
  ];

  const parsedStatus = validStatuses.includes(params.status as payment_status)
    ? (params.status as payment_status)
    : undefined;

  const parsedMethod = validMethods.includes(params.method as payment_method)
    ? (params.method as payment_method)
    : undefined;

  const parsedCompleteness = validCompleteness.includes(
    params.completeness as PaymentCompletionStatus
  )
    ? (params.completeness as PaymentCompletionStatus)
    : undefined;

  const parsedPage = params.page ? parseInt(params.page, 10) : 1;
  const verifiedOnly = params.verifiedOnly === "true";

  const queryParams: AdminPaymentsQueryParams = {
    search: params.q,
    status: parsedStatus,
    paymentMethod: parsedMethod,
    categoryId,
    tournamentId,
    verifiedRegistrationOnly: verifiedOnly,
    completeness: parsedCompleteness,
    page: isNaN(parsedPage) ? 1 : parsedPage,
    pageSize: 20,
  };

  const [paymentsData, filterCategories, tournamentSummary] = await Promise.all([
    getAdminPaymentsList(queryParams),
    getAdminPaymentFilterCategories(),
    tournamentId ? getTournamentPaymentSummary(tournamentId) : Promise.resolve(null),
  ]);
  const money = (amount: number) => new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP" }).format(amount);

  return (
    <div className="space-y-6 pb-16">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase font-bold tracking-wider text-[#205823] bg-[#205823]/10 px-2 py-0.5 rounded-md border border-[#205823]/20">
              Finance & Accounting
            </span>
            <span className="text-xs text-[#5F6B61]">Phase 05.7B</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172019] mt-1.5">
            Payment Monitoring
          </h1>
          <p className="text-xs sm:text-sm text-[#5F6B61] mt-0.5">
            Search, filter, and correct payment transactions with canonical team accounting reconciliation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="px-4 py-2 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] text-right">
            <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
              Filtered Records
            </span>
            <span className="text-lg font-mono font-extrabold text-[#172019]">
              {paymentsData.totalCount}
            </span>
          </div>
        </div>
      </div>

      {tournamentId && tournamentSummary && <section aria-label="Tournament payment summary" className="space-y-3">
        <h2 className="text-lg font-bold text-[#205823]">{tournaments.find(item => item.id === tournamentId)?.name} · Payment overview</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[["Expected", money(tournamentSummary.totals.expected)], ["Verified paid toward active roster", money(tournamentSummary.totals.paid)], ["Outstanding", money(tournamentSummary.totals.balance)], ["Payment-complete teams", tournamentSummary.totals.complete], ["Payment-incomplete teams", tournamentSummary.totals.incomplete], ["Teams needing legacy payment review", tournamentSummary.totals.needingReview]].map(([label, value]) => <div key={label} className="rounded-xl border border-[#DDE3DE] bg-white p-4"><p className="text-xs font-semibold text-[#5F6B61]">{label}</p><p className="mt-1 font-bold text-[#172019]">{value}</p></div>)}
        </div>
        <div className="space-y-2">{tournamentSummary.divisions.map(division => <div key={division.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#DDE3DE] bg-white p-3 text-sm"><h3 className="font-bold text-[#205823]">{division.name}</h3><p>{division.teams} teams · Expected {money(division.expected)} · Verified paid {money(division.paid)} · Balance {money(division.balance)}</p></div>)}</div>
        {tournamentSummary.divisions.length === 0 && <div className="rounded-xl border border-dashed border-[#B7C7B9] bg-white p-4"><p className="font-semibold">No divisions configured yet</p><p className="text-sm text-[#5F6B61]">Create a division before registering teams.</p><Link href={`/admin/tournaments/${tournamentId}/divisions/new`} className="inline-flex min-h-11 items-center font-bold text-[#205823] underline">Add Division</Link></div>}
        {tournamentSummary.paymentRecords === 0 && <p className="text-sm text-[#5F6B61]">No payment activity has been recorded for this tournament yet.</p>}
      </section>}

      {/* Filter Component (Section R) */}
      <PaymentFilters
        categories={filterCategories}
        tournaments={tournaments}
        currentTournamentId={tournamentId}
        currentQuery={params.q}
        currentStatus={params.status}
        currentMethod={params.method}
        currentCategoryId={categoryId}
        currentCompleteness={params.completeness}
        currentVerifiedOnly={verifiedOnly}
      />

      {/* Payment List & Pagination Component (Sections I, J, T) */}
      <PaymentListView
        items={paymentsData.items}
        tournamentId={tournamentId}
        totalCount={paymentsData.totalCount}
        page={paymentsData.page}
        pageSize={paymentsData.pageSize}
        totalPages={paymentsData.totalPages}
        hasPreviousPage={paymentsData.hasPreviousPage}
        hasNextPage={paymentsData.hasNextPage}
      />
    </div>
  );
}
