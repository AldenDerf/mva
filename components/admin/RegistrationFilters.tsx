"use client";

import React, { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { FilterCategoryOption } from "@/lib/admin/registrations";

interface RegistrationFiltersProps {
  categories: FilterCategoryOption[];
  currentQuery?: string;
  currentStatus?: string;
  currentPaymentStatus?: string;
  currentCategoryId?: string;
}

const REGISTRATION_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending Payment",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  REFUNDED: "Refunded",
};

export function RegistrationFilters({
  categories,
  currentQuery = "",
  currentStatus = "",
  currentPaymentStatus = "",
  currentCategoryId = "",
}: RegistrationFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [prevQuery, setPrevQuery] = React.useState(currentQuery);
  const [searchVal, setSearchVal] = React.useState(currentQuery);

  // Sync search input state if query parameter changes in URL (e.g. Back/Forward navigation)
  if (prevQuery !== currentQuery) {
    setPrevQuery(currentQuery);
    setSearchVal(currentQuery);
  }

  const hasActiveFilters = Boolean(
    currentQuery || currentStatus || currentPaymentStatus || currentCategoryId
  );

  const applyFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    // Reset pagination to page 1 whenever filters change
    params.delete("page");

    // Preserve the typed search unless an explicit search update is provided
    if (!("q" in updates)) {
      if (searchVal.trim()) {
        params.set("q", searchVal.trim());
      } else {
        params.delete("q");
      }
    }

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value.trim()) {
        params.set(key, value.trim());
      } else {
        params.delete(key);
      }
    });

    startTransition(() => {
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ q: searchVal.trim() || null });
  };

  const handleClearSearch = () => {
    setSearchVal("");
    applyFilters({ q: null });
  };

  const handleResetAll = () => {
    setSearchVal("");
    startTransition(() => {
      router.push(pathname);
    });
  };

  return (
    <div className="relative bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
      {/* Subtle Progress Bar during server transitions */}
      {isPending && (
        <div
          className="absolute top-0 inset-x-0 h-1 bg-[#205823]/20 overflow-hidden z-10"
          role="status"
          aria-live="polite"
        >
          <span className="sr-only">Updating registrations...</span>
          <div className="h-full bg-[#205823] w-1/3 animate-pulse rounded-full" />
        </div>
      )}

      <div className="p-4 sm:p-5 space-y-4">
        <form
          onSubmit={handleSearchSubmit}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-end"
          role="search"
          aria-label="Filter registrations"
        >
          {/* Search Input Unit (5 cols on lg, full width on sm) */}
          <div className="sm:col-span-2 lg:col-span-5">
            <label htmlFor="reg-search" className="block text-xs font-semibold text-[#5F6B61] mb-1.5">
              Search Registrations
            </label>
            <div className="flex rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#205823] focus-within:border-transparent transition-colors overflow-hidden">
              <div className="relative flex-1 flex items-center min-w-0">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#5F6B61]">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </span>
                <input
                  id="reg-search"
                  type="search"
                  value={searchVal}
                  onChange={(e) => setSearchVal(e.target.value)}
                  placeholder="Search team, code, or registrant..."
                  className="w-full min-h-[44px] pl-10 pr-9 py-2 text-sm bg-transparent text-[#172019] placeholder-[#5F6B61]/70 focus:outline-none"
                />
                {searchVal && (
                  <button
                    type="button"
                    onClick={handleClearSearch}
                    className="absolute inset-y-0 right-0 w-9 h-full flex items-center justify-center text-[#5F6B61] hover:text-[#172019] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-md"
                    aria-label="Clear search text"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
              <button
                type="submit"
                className="px-4 min-h-[44px] bg-[#205823] hover:bg-[#18441a] text-white text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] flex items-center justify-center shrink-0 cursor-pointer"
                aria-label="Submit search"
              >
                {isPending && searchVal.trim() !== currentQuery ? (
                  <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                ) : (
                  "Search"
                )}
              </button>
            </div>
          </div>

          {/* Registration Status Filter (3 cols on lg, 1 on sm) */}
          <div className="sm:col-span-1 lg:col-span-3">
            <label htmlFor="filter-status" className="block text-xs font-semibold text-[#5F6B61] mb-1.5">
              Registration Status
            </label>
            <select
              id="filter-status"
              value={currentStatus}
              onChange={(e) => applyFilters({ status: e.target.value || null })}
              className="w-full min-h-[44px] py-2.5 px-3 text-sm rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] text-[#172019] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-colors cursor-pointer"
            >
              <option value="">All Registration Statuses</option>
              <option value="PENDING_PAYMENT">Pending Payment</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>

          {/* Payment Status Filter (2 cols on lg, 1 on sm) */}
          <div className="sm:col-span-1 lg:col-span-2">
            <label htmlFor="filter-payment" className="block text-xs font-semibold text-[#5F6B61] mb-1.5">
              Payment Status
            </label>
            <select
              id="filter-payment"
              value={currentPaymentStatus}
              onChange={(e) => applyFilters({ paymentStatus: e.target.value || null })}
              className="w-full min-h-[44px] py-2.5 px-3 text-sm rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] text-[#172019] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-colors cursor-pointer"
            >
              <option value="">All Payments</option>
              <option value="PENDING">Pending</option>
              <option value="VERIFIED">Verified</option>
              <option value="REJECTED">Rejected</option>
              <option value="REFUNDED">Refunded</option>
            </select>
          </div>

          {/* Category Filter (2 cols on lg, 2 on sm) */}
          <div className="sm:col-span-2 lg:col-span-2">
            <label htmlFor="filter-category" className="block text-xs font-semibold text-[#5F6B61] mb-1.5">
              Division / Category
            </label>
            <select
              id="filter-category"
              value={currentCategoryId}
              onChange={(e) => applyFilters({ categoryId: e.target.value || null })}
              className="w-full min-h-[44px] py-2.5 px-3 text-sm rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] text-[#172019] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-colors cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} {cat.leagueName ? `(${cat.leagueName})` : ""}
                </option>
              ))}
            </select>
          </div>
        </form>

        {/* Active Filter Chips & Reset Bar */}
        {hasActiveFilters && (
          <div className="pt-3 border-t border-[#DDE3DE]/60 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[#5F6B61] font-semibold flex items-center gap-1.5">
                <span>Active filters:</span>
                {isPending && (
                  <span
                    className="w-3 h-3 border-2 border-[#205823]/30 border-t-[#205823] rounded-full animate-spin"
                    aria-label="Updating results"
                  />
                )}
              </span>

              {/* Search Query Chip */}
              {currentQuery && (
                <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                  <span>Search: &ldquo;{currentQuery}&rdquo;</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSearchVal("");
                      applyFilters({ q: null });
                    }}
                    className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                    aria-label={`Remove search filter for "${currentQuery}"`}
                  >
                    <span className="text-base leading-none" aria-hidden="true">&times;</span>
                  </button>
                </span>
              )}

              {/* Registration Status Chip */}
              {currentStatus && (
                <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                  <span>Status: {REGISTRATION_STATUS_LABELS[currentStatus] || currentStatus}</span>
                  <button
                    type="button"
                    onClick={() => applyFilters({ status: null })}
                    className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                    aria-label={`Remove Registration Status: ${REGISTRATION_STATUS_LABELS[currentStatus] || currentStatus} filter`}
                  >
                    <span className="text-base leading-none" aria-hidden="true">&times;</span>
                  </button>
                </span>
              )}

              {/* Payment Status Chip */}
              {currentPaymentStatus && (
                <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                  <span>Payment: {PAYMENT_STATUS_LABELS[currentPaymentStatus] || currentPaymentStatus}</span>
                  <button
                    type="button"
                    onClick={() => applyFilters({ paymentStatus: null })}
                    className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                    aria-label={`Remove Payment Status: ${PAYMENT_STATUS_LABELS[currentPaymentStatus] || currentPaymentStatus} filter`}
                  >
                    <span className="text-base leading-none" aria-hidden="true">&times;</span>
                  </button>
                </span>
              )}

              {/* Category Chip */}
              {currentCategoryId && (
                <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                  <span>
                    Category: {categories.find((c) => c.id === currentCategoryId)?.name || "Selected"}
                  </span>
                  <button
                    type="button"
                    onClick={() => applyFilters({ categoryId: null })}
                    className="w-7 h-7 sm:w-6 sm:h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                    aria-label={`Remove Category: ${categories.find((c) => c.id === currentCategoryId)?.name || "Selected"} filter`}
                  >
                    <span className="text-base leading-none" aria-hidden="true">&times;</span>
                  </button>
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={handleResetAll}
              className="self-start sm:self-auto min-h-[40px] px-3.5 py-2 rounded-lg border border-[#DDE3DE] bg-[#FAFAF8] hover:bg-white text-xs font-bold text-[#205823] hover:text-[#18441a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer inline-flex items-center gap-1.5 shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
              <span>Clear all filters</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
