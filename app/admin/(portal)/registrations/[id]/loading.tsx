import React from "react";

export default function AdminRegistrationDetailLoading() {
  return (
    <div
      className="space-y-6 pb-16 animate-pulse motion-reduce:animate-none"
      role="status"
      aria-busy="true"
      aria-label="Loading registration details"
    >
      <span className="sr-only">Loading registration details...</span>

      {/* Back link skeleton */}
      <div className="h-5 w-36 bg-[#DDE3DE]/70 rounded-md" />

      {/* ============================================================ */}
      {/* HEADER SKELETON */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div className="space-y-2">
            {/* Team Name Skeleton */}
            <div className="h-8 sm:h-9 w-64 sm:w-80 bg-[#DDE3DE]/80 rounded-lg" />
            {/* League & Category Skeleton */}
            <div className="h-4 w-48 sm:w-60 bg-[#DDE3DE]/50 rounded-md" />
            {/* Badges and Ref Code Skeleton */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <div className="h-6 w-28 bg-[#205823]/10 rounded-md" />
              <div className="h-6 w-24 bg-[#DDE3DE]/60 rounded-full" />
              <div className="h-6 w-32 bg-[#DDE3DE]/60 rounded-full" />
            </div>
          </div>

          <div className="flex flex-col md:items-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-[#DDE3DE]">
            <div className="space-y-1 md:text-right">
              <div className="h-3 w-40 bg-[#DDE3DE]/60 rounded-md ml-0 md:ml-auto" />
              <div className="h-3 w-28 bg-[#DDE3DE]/40 rounded-md ml-0 md:ml-auto" />
            </div>
            <div className="h-9 w-32 bg-[#205823]/15 rounded-xl" />
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* PAYMENT SUMMARY CARDS SKELETON */}
      {/* ============================================================ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs space-y-2"
          >
            <div className="h-3 w-20 bg-[#DDE3DE]/50 rounded-md" />
            <div className="h-6 sm:h-7 w-28 bg-[#DDE3DE]/80 rounded-md" />
            <div className="h-3 w-32 bg-[#DDE3DE]/40 rounded-md" />
          </div>
        ))}
      </div>

      {/* ============================================================ */}
      {/* MAIN TWO-COLUMN LAYOUT SKELETON */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: ROSTER & PAYMENTS */}
        <div className="lg:col-span-2 space-y-6">
          {/* Roster Skeleton Container */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between">
              <div className="space-y-1.5">
                <div className="h-5 w-36 bg-[#DDE3DE]/80 rounded-md" />
                <div className="h-3 w-52 bg-[#DDE3DE]/50 rounded-md" />
              </div>
              <div className="h-6 w-20 bg-[#FAFAF8] border border-[#DDE3DE] rounded-full" />
            </div>

            {/* Mobile Cards Skeleton (hidden on md:block) */}
            <div className="p-4 space-y-3 md:hidden">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="p-3.5 bg-[#FAFAF8] rounded-xl border border-[#DDE3DE] space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-32 bg-[#DDE3DE]/80 rounded-md" />
                    <div className="h-5 w-16 bg-[#DDE3DE]/60 rounded-md" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <div className="h-3 w-24 bg-[#DDE3DE]/50 rounded-md" />
                    <div className="h-7 w-20 bg-[#205823]/15 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table Rows Skeleton (hidden on mobile) */}
            <div className="hidden md:block">
              <div className="bg-[#FAFAF8] py-3 px-6 border-b border-[#DDE3DE] flex items-center justify-between">
                <div className="h-3 w-8 bg-[#DDE3DE]/60 rounded-md" />
                <div className="h-3 w-32 bg-[#DDE3DE]/60 rounded-md" />
                <div className="h-3 w-16 bg-[#DDE3DE]/60 rounded-md" />
                <div className="h-3 w-12 bg-[#DDE3DE]/60 rounded-md" />
                <div className="h-3 w-20 bg-[#DDE3DE]/60 rounded-md" />
                <div className="h-3 w-24 bg-[#DDE3DE]/60 rounded-md" />
              </div>
              <div className="divide-y divide-[#DDE3DE]">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="py-3.5 px-6 flex items-center justify-between">
                    <div className="h-4 w-6 bg-[#DDE3DE]/40 rounded-md" />
                    <div className="h-4 w-36 bg-[#DDE3DE]/80 rounded-md" />
                    <div className="h-4 w-16 bg-[#DDE3DE]/50 rounded-md" />
                    <div className="h-5 w-10 bg-[#DDE3DE]/40 rounded-md" />
                    <div className="h-4 w-20 bg-[#DDE3DE]/50 rounded-md" />
                    <div className="h-7 w-28 bg-[#205823]/15 rounded-lg" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Payment History Skeleton */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs p-5 sm:p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="h-5 w-40 bg-[#DDE3DE]/80 rounded-md" />
              <div className="h-5 w-24 bg-[#DDE3DE]/50 rounded-full" />
            </div>
            <div className="space-y-3">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 bg-[#FAFAF8] rounded-xl border border-[#DDE3DE] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-4 w-28 bg-[#DDE3DE]/70 rounded-md" />
                    <div className="h-5 w-20 bg-[#205823]/20 rounded-md" />
                  </div>
                  <div className="h-3 w-48 bg-[#DDE3DE]/40 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: REGISTRATION DETAILS & AUDIT */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="h-5 w-40 bg-[#DDE3DE]/80 rounded-md pb-3 border-b border-[#DDE3DE]" />
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex justify-between items-center">
                  <div className="h-3 w-24 bg-[#DDE3DE]/50 rounded-md" />
                  <div className="h-3 w-28 bg-[#DDE3DE]/70 rounded-md" />
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs space-y-4">
            <div className="h-5 w-40 bg-[#DDE3DE]/80 rounded-md pb-3 border-b border-[#DDE3DE]" />
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="space-y-1">
                  <div className="h-2.5 w-16 bg-[#DDE3DE]/40 rounded-md" />
                  <div className="h-4 w-32 bg-[#DDE3DE]/70 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
