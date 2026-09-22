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

  // Sync search input state if query parameter changes in URL
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

    Object.entries(updates).forEach(([key, value]) => {
      if (value && value.trim()) {
        params.set(key, value.trim());
      } else {
        params.delete(key);
      }
    });

    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ q: searchVal });
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
    <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs space-y-4">
      <form
        onSubmit={handleSearchSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center"
        role="search"
        aria-label="Filter registrations"
      >
        {/* Search Input (Takes 5 cols on lg) */}
        <div className="lg:col-span-4 relative">
          <label htmlFor="reg-search" className="sr-only">
            Search registrations by team name, reference code, or registrant
          </label>
          <div className="relative">
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
              className="w-full min-h-[44px] pl-10 pr-9 py-2 text-sm rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] text-[#172019] placeholder-[#5F6B61]/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-colors"
            />
            {searchVal && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-[#5F6B61] hover:text-[#172019] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-lg"
                aria-label="Clear search text"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Registration Status Filter */}
        <div className="lg:col-span-3">
          <label htmlFor="filter-status" className="sr-only">
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

        {/* Payment Status Filter */}
        <div className="lg:col-span-2">
          <label htmlFor="filter-payment" className="sr-only">
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

        {/* Category Filter */}
        <div className="lg:col-span-2">
          <label htmlFor="filter-category" className="sr-only">
            Category Division
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
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Actions / Submit */}
        <div className="lg:col-span-1 flex items-center gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="w-full min-h-[44px] py-2.5 px-3 bg-[#205823] hover:bg-[#18441a] text-white text-xs font-bold rounded-xl shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] flex items-center justify-center disabled:opacity-50 cursor-pointer"
          >
            {isPending ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              "Filter"
            )}
          </button>
        </div>
      </form>

      {/* Active Filter Tags & Reset Bar */}
      {hasActiveFilters && (
        <div className="pt-3 border-t border-[#DDE3DE]/60 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[#5F6B61] font-medium">Active filters:</span>
            {currentQuery && (
              <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                <span>Query: &ldquo;{currentQuery}&rdquo;</span>
                <button
                  type="button"
                  onClick={() => applyFilters({ q: null })}
                  className="w-6 h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  aria-label="Remove search query filter"
                >
                  <span className="text-base leading-none">&times;</span>
                </button>
              </span>
            )}
            {currentStatus && (
              <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                <span>Status: {currentStatus.replace("_", " ")}</span>
                <button
                  type="button"
                  onClick={() => applyFilters({ status: null })}
                  className="w-6 h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  aria-label="Remove status filter"
                >
                  <span className="text-base leading-none">&times;</span>
                </button>
              </span>
            )}
            {currentPaymentStatus && (
              <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                <span>Payment: {currentPaymentStatus}</span>
                <button
                  type="button"
                  onClick={() => applyFilters({ paymentStatus: null })}
                  className="w-6 h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  aria-label="Remove payment status filter"
                >
                  <span className="text-base leading-none">&times;</span>
                </button>
              </span>
            )}
            {currentCategoryId && (
              <span className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-[#172019] font-medium">
                <span>
                  Category:{" "}
                  {categories.find((c) => c.id === currentCategoryId)?.name || "Selected"}
                </span>
                <button
                  type="button"
                  onClick={() => applyFilters({ categoryId: null })}
                  className="w-6 h-6 flex items-center justify-center text-[#5F6B61] hover:text-[#172019] hover:bg-[#DDE3DE]/50 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                  aria-label="Remove category filter"
                >
                  <span className="text-base leading-none">&times;</span>
                </button>
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={handleResetAll}
            className="min-h-[36px] px-3 py-1.5 rounded-lg border border-[#DDE3DE] bg-[#FAFAF8] hover:bg-white text-xs font-semibold text-[#205823] hover:text-[#18441a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer"
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
}
