import React from "react";

export default function AdminRegistrationsLoading() {
  return (
    <div
      className="space-y-6 pb-12 animate-pulse motion-reduce:animate-none"
      role="status"
      aria-busy="true"
      aria-label="Loading team registrations"
    >
      <span className="sr-only">Loading team registrations...</span>

      {/* ============================================================ */}
      {/* SECTION A: PAGE HEADING SKELETON */}
      {/* ============================================================ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#DDE3DE]">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-56 bg-[#DDE3DE]/80 rounded-lg" />
            <div className="h-5 w-20 bg-[#205823]/10 rounded-full" />
          </div>
          <div className="h-4 w-72 sm:w-96 bg-[#DDE3DE]/50 rounded-md" />
        </div>
        <div className="h-8 w-32 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg" />
      </div>

      {/* ============================================================ */}
      {/* SECTION B: SEARCH & FILTERS BAR SKELETON */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-4 h-11 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-3 h-11 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-2 h-11 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-2 h-11 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-1 h-11 bg-[#205823]/20 rounded-xl" />
        </div>
      </div>

      {/* ============================================================ */}
      {/* SECTION C: REGISTRATION LIST SKELETON (TABLE / CARDS) */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
        {/* DESKTOP TABLE SKELETON (lg:block, hidden on mobile) */}
        <div className="hidden lg:block overflow-x-auto">
          <div className="bg-[#FAFAF8] py-3.5 px-5 border-b border-[#DDE3DE] flex items-center justify-between">
            <div className="h-4 w-28 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-36 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-16 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-24 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-20 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-20 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-20 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-24 bg-[#DDE3DE]/60 rounded-md" />
            <div className="h-4 w-16 bg-[#DDE3DE]/60 rounded-md" />
          </div>

          <div className="divide-y divide-[#DDE3DE]">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="py-4 px-5 flex items-center justify-between gap-4">
                {/* Reference Code */}
                <div className="w-24 h-6 bg-[#205823]/10 rounded-md" />

                {/* Team & Division */}
                <div className="w-48 space-y-1.5">
                  <div className="h-4 w-36 bg-[#DDE3DE]/80 rounded-md" />
                  <div className="h-3 w-28 bg-[#DDE3DE]/50 rounded-md" />
                </div>

                {/* Roster */}
                <div className="w-16 h-5 bg-[#FAFAF8] border border-[#DDE3DE] rounded-md" />

                {/* Payment Completeness */}
                <div className="w-32 flex flex-col items-center gap-1">
                  <div className="h-5 w-28 bg-[#DDE3DE]/70 rounded-full" />
                  <div className="h-3 w-20 bg-[#DDE3DE]/40 rounded-md" />
                </div>

                {/* Expected */}
                <div className="w-20 h-4 bg-[#DDE3DE]/50 rounded-md" />

                {/* Paid */}
                <div className="w-20 h-4 bg-[#205823]/20 rounded-md" />

                {/* Balance */}
                <div className="w-20 space-y-1 text-right">
                  <div className="h-4 w-16 bg-[#DDE3DE]/80 rounded-md ml-auto" />
                  <div className="h-2.5 w-10 bg-[#DDE3DE]/40 rounded-md ml-auto" />
                </div>

                {/* Registration Status */}
                <div className="w-24 h-5 bg-[#DDE3DE]/60 rounded-full" />

                {/* Action */}
                <div className="w-24 h-9 bg-[#eef5ef] rounded-lg" />
              </div>
            ))}
          </div>
        </div>

        {/* MOBILE & TABLET CARDS SKELETON (block lg:hidden) */}
        <div className="lg:hidden divide-y divide-[#DDE3DE]">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="p-4 sm:p-5 space-y-3.5">
              {/* Card Top: Team Name & Status Badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1.5 flex-1">
                  <div className="h-5 w-44 bg-[#DDE3DE]/80 rounded-md" />
                  <div className="h-3.5 w-32 bg-[#DDE3DE]/50 rounded-md" />
                </div>
                <div className="h-6 w-20 bg-[#DDE3DE]/60 rounded-full shrink-0" />
              </div>

              {/* Reference & Date */}
              <div className="flex items-center justify-between text-xs">
                <div className="h-5 w-24 bg-[#205823]/10 rounded-md" />
                <div className="h-3.5 w-28 bg-[#DDE3DE]/50 rounded-md" />
              </div>

              {/* Payment Status & Balance Box */}
              <div className="space-y-2 pt-1 border-t border-[#DDE3DE]/60">
                <div className="flex items-center justify-between">
                  <div className="h-5 w-32 bg-[#DDE3DE]/70 rounded-full" />
                  <div className="h-3.5 w-24 bg-[#DDE3DE]/50 rounded-md" />
                </div>

                <div className="rounded-xl p-3 border border-[#DDE3DE] bg-[#FAFAF8] space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3.5 w-16 bg-[#DDE3DE]/50 rounded-md" />
                    <div className="h-4 w-28 bg-[#DDE3DE]/80 rounded-md" />
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-[#DDE3DE]/60">
                    <div className="h-3 w-24 bg-[#DDE3DE]/40 rounded-md" />
                    <div className="h-3 w-20 bg-[#DDE3DE]/40 rounded-md" />
                  </div>
                </div>
              </div>

              {/* Registrant & Roster */}
              <div className="flex items-center justify-between text-xs pt-1">
                <div className="h-3.5 w-32 bg-[#DDE3DE]/50 rounded-md" />
                <div className="h-3.5 w-16 bg-[#DDE3DE]/50 rounded-md" />
              </div>

              {/* Card Action Button */}
              <div className="pt-2">
                <div className="w-full h-11 bg-[#eef5ef] rounded-xl" />
              </div>
            </div>
          ))}
        </div>

        {/* PAGINATION BAR SKELETON */}
        <div className="p-4 sm:px-6 sm:py-4 border-t border-[#DDE3DE] bg-[#FAFAF8] flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="h-4 w-48 bg-[#DDE3DE]/60 rounded-md" />
          <div className="flex items-center gap-2">
            <div className="h-8 w-20 bg-white border border-[#DDE3DE] rounded-lg" />
            <div className="h-8 w-24 bg-white border border-[#DDE3DE] rounded-lg" />
            <div className="h-8 w-16 bg-white border border-[#DDE3DE] rounded-lg" />
          </div>
        </div>
      </div>
    </div>
  );
}
