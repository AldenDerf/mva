import React from "react";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export default function TeamProfileLoading() {
  return (
    <div
      className="w-full min-h-[calc(100vh-5rem)] bg-[#FAFAF8] flex flex-col animate-pulse motion-reduce:animate-none"
      role="status"
      aria-busy="true"
      aria-label="Loading team profile and roster"
    >
      <span className="sr-only">Loading team profile and roster...</span>

      {/* Top Navigation Bar Skeleton */}
      <div className="bg-white border-b border-[#DDE3DE]">
        <Container size="lg" className="py-3">
          <div className="h-6 w-36 bg-[#205823]/15 rounded-lg" />
        </Container>
      </div>

      {/* Team Header Section Skeleton */}
      <Section spacing="sm" className="bg-white border-b border-[#DDE3DE]">
        <Container size="lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
            {/* Team Logo Skeleton (size="lg", 80x80) */}
            <div className="w-20 h-20 rounded-2xl bg-[#FAFAF8] border border-[#DDE3DE] shrink-0" />

            <div className="flex-1 min-w-0 space-y-2">
              <div className="h-5 w-24 bg-[#205823]/10 rounded-full" />
              <div className="h-8 sm:h-10 w-56 sm:w-80 bg-[#DDE3DE]/80 rounded-xl" />
              <div className="h-4 w-40 sm:w-60 bg-[#DDE3DE]/50 rounded-md" />
            </div>

            <div className="flex sm:flex-col items-start sm:items-end gap-2 pt-2 sm:pt-0">
              <div className="h-6 w-28 bg-[#FAFAF8] border border-[#DDE3DE] rounded-md" />
              <div className="h-6 w-24 bg-[#205823]/10 rounded-full" />
            </div>
          </div>
        </Container>
      </Section>

      {/* Roster Section Skeleton */}
      <Section spacing="md" className="flex-1">
        <Container size="lg">
          <div className="space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-[#DDE3DE]">
              <div className="h-6 w-44 bg-[#DDE3DE]/80 rounded-md" />
              <div className="h-4 w-28 bg-[#DDE3DE]/50 rounded-md" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  className="bg-white border border-[#DDE3DE] rounded-2xl p-4 space-y-3 shadow-xs"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] shrink-0" />
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="h-4 w-28 bg-[#DDE3DE]/80 rounded-md" />
                      <div className="h-3 w-16 bg-[#DDE3DE]/50 rounded-md" />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-[#DDE3DE]/60 flex items-center justify-between">
                    <div className="h-3.5 w-14 bg-[#DDE3DE]/40 rounded-md" />
                    <div className="h-3.5 w-10 bg-[#DDE3DE]/40 rounded-md" />
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
