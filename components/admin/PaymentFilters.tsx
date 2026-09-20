"use client";

import React, { useTransition } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

export interface FilterCategoryItem {
  id: string;
  name: string;
  leagueName: string;
}

interface PaymentFiltersProps {
  categories: FilterCategoryItem[];
  currentQuery?: string;
  currentStatus?: string;
  currentMethod?: string;
  currentCategoryId?: string;
  currentCompleteness?: string;
  currentVerifiedOnly?: boolean;
}

export function PaymentFilters({
  categories,
  currentQuery = "",
  currentStatus = "",
  currentMethod = "",
  currentCategoryId = "",
  currentCompleteness = "",
  currentVerifiedOnly = false,
}: PaymentFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [prevQuery, setPrevQuery] = React.useState(currentQuery);
  const [searchVal, setSearchVal] = React.useState(currentQuery);

  // Sync state if URL search query changes externally
  if (prevQuery !== currentQuery) {
    setPrevQuery(currentQuery);
    setSearchVal(currentQuery);
  }

  const hasActiveFilters = Boolean(
    currentQuery ||
      currentStatus ||
      currentMethod ||
      currentCategoryId ||
      currentCompleteness ||
      currentVerifiedOnly
  );

  const applyFilters = (updates: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());

    // Reset pagination to page 1 whenever filters change (Section T)
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
      {/* Search and Primary Filters */}
      <form
        onSubmit={handleSearchSubmit}
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center"
        role="search"
        aria-label="Filter payments"
      >
        {/* Search Input (Takes 4 cols on lg) */}
        <div className="lg:col-span-4 relative">
          <label htmlFor="payment-search" className="sr-only">
            Search payments by player, team, code, or reference
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#5F6B61]">
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
              id="payment-search"
              type="search"
              value={searchVal}
              onChange={(e) => setSearchVal(e.target.value)}
              placeholder="Search player, team, code, ref..."
              className="w-full pl-9 pr-8 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-[#FAFAF8] text-[#172019] placeholder:text-[#5F6B61]/60 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
            />
            {searchVal && (
              <button
                type="button"
                onClick={handleClearSearch}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-[#5F6B61] hover:text-[#172019]"
                aria-label="Clear search input"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Status Filter (Takes 2 cols on lg) */}
        <div className="lg:col-span-2">
          <label htmlFor="payment-status-filter" className="sr-only">
            Filter by payment status
          </label>
          <select
            id="payment-status-filter"
            value={currentStatus}
            onChange={(e) => applyFilters({ status: e.target.value || null })}
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-white text-[#172019] focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
          >
            <option value="">All Statuses</option>
            <option value="PENDING">Pending</option>
            <option value="VERIFIED">Verified</option>
            <option value="REJECTED">Rejected</option>
            <option value="REFUNDED">Refunded</option>
          </select>
        </div>

        {/* Method Filter (Takes 2 cols on lg) */}
        <div className="lg:col-span-2">
          <label htmlFor="payment-method-filter" className="sr-only">
            Filter by payment method
          </label>
          <select
            id="payment-method-filter"
            value={currentMethod}
            onChange={(e) => applyFilters({ method: e.target.value || null })}
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-white text-[#172019] focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
          >
            <option value="">All Methods</option>
            <option value="CASH">Cash</option>
            <option value="GCASH">GCash</option>
            <option value="BANK_TRANSFER">Bank Transfer</option>
            <option value="OTHER">Other</option>
          </select>
        </div>

        {/* Category / Division Filter (Takes 2 cols on lg) */}
        <div className="lg:col-span-2">
          <label htmlFor="payment-category-filter" className="sr-only">
            Filter by division / category
          </label>
          <select
            id="payment-category-filter"
            value={currentCategoryId}
            onChange={(e) => applyFilters({ category: e.target.value || null })}
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-white text-[#172019] focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
          >
            <option value="">All Divisions</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.leagueName} — {c.name}
              </option>
            ))}
          </select>
        </div>

        {/* Completeness Filter (Takes 2 cols on lg) */}
        <div className="lg:col-span-2">
          <label htmlFor="payment-completeness-filter" className="sr-only">
            Filter by team payment completeness
          </label>
          <select
            id="payment-completeness-filter"
            value={currentCompleteness}
            onChange={(e) =>
              applyFilters({ completeness: e.target.value || null })
            }
            className="w-full px-3 py-2 text-xs rounded-xl border border-[#DDE3DE] bg-white text-[#172019] focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
          >
            <option value="">All Completeness</option>
            <option value="COMPLETE">Payment Complete</option>
            <option value="INCOMPLETE">Payment Incomplete</option>
          </select>
        </div>
      </form>

      {/* Secondary Bar: Verified-registration-only toggle and Reset Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#DDE3DE]/60 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={currentVerifiedOnly}
            onChange={(e) =>
              applyFilters({ verifiedOnly: e.target.checked ? "true" : null })
            }
            className="w-4 h-4 rounded text-[#205823] border-[#DDE3DE] focus:ring-[#205823] focus:ring-offset-0 transition-colors"
          />
          <span className="font-medium text-[#172019]">
            Verified registrations only
          </span>
        </label>

        <div className="flex items-center gap-3">
          {isPending && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[#5F6B61]">
              <svg
                className="w-3.5 h-3.5 animate-spin text-[#205823]"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
              <span>Updating...</span>
            </span>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 text-xs font-semibold text-[#5F6B61] hover:text-red-700 hover:underline transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-md px-1.5 py-0.5"
            >
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
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>Clear filters</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
