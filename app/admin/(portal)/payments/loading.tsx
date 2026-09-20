import React from "react";

export default function AdminPaymentsLoading() {
  return (
    <div className="space-y-6 pb-16 animate-pulse">
      {/* Page Header Skeleton */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-4 w-28 bg-[#DDE3DE]/60 rounded-md" />
          <div className="h-8 w-64 bg-[#DDE3DE]/80 rounded-lg" />
          <div className="h-4 w-80 bg-[#DDE3DE]/50 rounded-md" />
        </div>
        <div className="h-14 w-28 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
      </div>

      {/* Filter Bar Skeleton */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 shadow-xs space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
          <div className="lg:col-span-4 h-9 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-2 h-9 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-2 h-9 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-2 h-9 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
          <div className="lg:col-span-2 h-9 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
        </div>
        <div className="pt-2 border-t border-[#DDE3DE]/60 flex justify-between">
          <div className="h-4 w-40 bg-[#DDE3DE]/50 rounded-md" />
          <div className="h-4 w-20 bg-[#DDE3DE]/50 rounded-md" />
        </div>
      </div>

      {/* Mobile Card Skeletons (< md) */}
      <div className="block md:hidden space-y-3.5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-white rounded-2xl border border-[#DDE3DE] p-4 shadow-xs space-y-3"
          >
            <div className="flex justify-between items-start">
              <div className="space-y-1.5 w-2/3">
                <div className="h-4 w-32 bg-[#DDE3DE]/80 rounded-md" />
                <div className="h-3 w-24 bg-[#DDE3DE]/50 rounded-md" />
                <div className="h-4 w-20 bg-[#DDE3DE]/40 rounded-md" />
              </div>
              <div className="space-y-1.5 text-right w-1/3 flex flex-col items-end">
                <div className="h-5 w-16 bg-[#DDE3DE]/80 rounded-md" />
                <div className="h-4 w-12 bg-[#DDE3DE]/50 rounded-full" />
              </div>
            </div>

            <div className="h-16 bg-[#FAFAF8] border border-[#DDE3DE]/80 rounded-xl" />
            <div className="h-20 bg-white border border-[#DDE3DE] rounded-xl" />

            <div className="flex gap-2 pt-1">
              <div className="flex-1 h-11 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
              <div className="flex-1 h-11 bg-[#DDE3DE]/40 rounded-xl" />
            </div>
          </div>
        ))}
      </div>

      {/* Desktop Table Skeletons (>= md) */}
      <div className="hidden md:block bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#DDE3DE] bg-[#FAFAF8]">
          <div className="h-4 w-48 bg-[#DDE3DE]/60 rounded-md" />
        </div>
        <div className="divide-y divide-[#DDE3DE]">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-4">
              <div className="h-4 w-32 bg-[#DDE3DE]/70 rounded-md" />
              <div className="h-4 w-28 bg-[#DDE3DE]/50 rounded-md" />
              <div className="h-4 w-20 bg-[#DDE3DE]/60 rounded-md" />
              <div className="h-4 w-16 bg-[#DDE3DE]/70 rounded-md" />
              <div className="h-5 w-16 bg-[#DDE3DE]/50 rounded-full" />
              <div className="h-4 w-24 bg-[#DDE3DE]/50 rounded-md" />
              <div className="h-4 w-28 bg-[#DDE3DE]/60 rounded-md" />
              <div className="h-8 w-24 bg-[#DDE3DE]/40 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
