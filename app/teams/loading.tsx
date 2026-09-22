import React from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";

export default function TeamsLoading() {
  return (
    <div
      className="w-full min-h-[calc(100vh-5rem)] bg-[#FAFAF8] flex flex-col animate-pulse motion-reduce:animate-none"
      role="status"
      aria-busy="true"
      aria-label="Loading official teams directory"
    >
      <span className="sr-only">Loading official teams directory...</span>

      {/* Compact Page Header (Preserved real structure) */}
      <Section spacing="sm" className="bg-white border-b border-[#DDE3DE]">
        <Container size="lg">
          <div className="flex flex-col items-start max-w-3xl">
            <Badge variant="gold" size="sm" className="mb-2.5 font-semibold">
              MVA Tournament Directory
            </Badge>
            <div className="h-9 sm:h-11 w-48 sm:w-64 bg-[#DDE3DE]/80 rounded-xl" />
            <div className="h-4 sm:h-5 w-64 sm:w-96 bg-[#DDE3DE]/50 rounded-md mt-2" />
          </div>
        </Container>
      </Section>

      {/* Main Directory Body Skeleton */}
      <Section spacing="md" className="flex-1">
        <Container size="lg">
          <div className="w-full space-y-6">
            {/* Controls Container: Division Filter & Search Skeleton */}
            <div className="flex flex-col gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#DDE3DE] shadow-xs">
              {/* Division Filter Chips Skeleton */}
              <div className="w-full">
                <div className="h-3.5 w-32 bg-[#DDE3DE]/60 rounded-md mb-2.5" />
                <div className="flex items-center gap-2 overflow-x-hidden pb-1 -mb-1">
                  <div className="min-h-[44px] w-36 bg-[#205823]/20 rounded-xl shrink-0" />
                  <div className="min-h-[44px] w-28 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl shrink-0" />
                  <div className="min-h-[44px] w-32 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl shrink-0" />
                  <div className="min-h-[44px] w-28 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl shrink-0" />
                </div>
              </div>

              {/* Search Input Skeleton */}
              <div className="w-full">
                <div className="h-3.5 w-28 bg-[#DDE3DE]/60 rounded-md mb-2.5" />
                <div className="w-full min-h-[44px] bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl" />
              </div>
            </div>

            {/* Results Count Meta Placeholder */}
            <div className="flex items-center justify-between px-1">
              <div className="h-3.5 w-32 bg-[#DDE3DE]/50 rounded-md" />
            </div>

            {/* Teams Grid Skeleton */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-[#DDE3DE] rounded-2xl p-5 flex flex-col justify-between gap-4 shadow-xs"
                >
                  <div className="flex items-start gap-3.5">
                    {/* Team Logo Skeleton (48x48) */}
                    <div className="w-12 h-12 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] shrink-0" />
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Team Name Skeleton */}
                      <div className="h-5 w-36 bg-[#DDE3DE]/80 rounded-md" />
                      {/* Division Badge Skeleton */}
                      <div className="h-5 w-20 bg-[#205823]/10 rounded-full" />
                    </div>
                  </div>

                  {/* Card Bottom: Roster Count + View Roster Link */}
                  <div className="pt-3 border-t border-[#DDE3DE]/60 flex items-center justify-between">
                    <div className="h-4 w-20 bg-[#DDE3DE]/50 rounded-md" />
                    <div className="h-4 w-24 bg-[#205823]/20 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </Section>
    </div>
  );
}
