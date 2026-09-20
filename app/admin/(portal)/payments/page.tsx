import React from "react";
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
    completeness?: string;
    verifiedOnly?: string;
    page?: string;
  }>;
}

export default async function AdminPaymentsPage({ searchParams }: PageProps) {
  // Enforce strict administrative authorization boundary
  await requireAdmin();

  const params = await searchParams;

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
    categoryId: params.category,
    verifiedRegistrationOnly: verifiedOnly,
    completeness: parsedCompleteness,
    page: isNaN(parsedPage) ? 1 : parsedPage,
    pageSize: 20,
  };

  const [paymentsData, filterCategories] = await Promise.all([
    getAdminPaymentsList(queryParams),
    getAdminPaymentFilterCategories(),
  ]);

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

      {/* Filter Component (Section R) */}
      <PaymentFilters
        categories={filterCategories}
        currentQuery={params.q}
        currentStatus={params.status}
        currentMethod={params.method}
        currentCategoryId={params.category}
        currentCompleteness={params.completeness}
        currentVerifiedOnly={verifiedOnly}
      />

      {/* Payment List & Pagination Component (Sections I, J, T) */}
      <PaymentListView
        items={paymentsData.items}
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
