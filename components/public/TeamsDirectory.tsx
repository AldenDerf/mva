"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { PublicTeamListItem, PublicCategoryFilter } from "@/lib/public/teams";
import { TeamLogoFallback } from "./TeamLogoFallback";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

interface TeamsDirectoryProps {
  teams: PublicTeamListItem[];
  categories: PublicCategoryFilter[];
}

export const TeamsDirectory: React.FC<TeamsDirectoryProps> = ({
  teams,
  categories,
}) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("ALL");

  // Case-insensitive, whitespace-trimmed search & category filtering
  const filteredTeams = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return teams.filter((team) => {
      const matchesCategory =
        selectedCategoryId === "ALL" || team.category_id === selectedCategoryId;

      if (!matchesCategory) return false;

      if (!query) return true;

      const nameMatch = team.team_name.toLowerCase().includes(query);
      const catMatch = team.category_name.toLowerCase().includes(query);
      return nameMatch || catMatch;
    });
  }, [teams, searchQuery, selectedCategoryId]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setSelectedCategoryId("ALL");
  };

  return (
    <div className="w-full space-y-6">
      {/* Controls Container: Division Filter & Search */}
      <div className="flex flex-col gap-4 bg-white p-4 sm:p-5 rounded-2xl border border-[#DDE3DE] shadow-xs">
        {/* Division Filter Chips (Scrollable if many, no page overflow) */}
        <div className="w-full">
          <label className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61] mb-2 block">
            Filter by Division
          </label>
          <div
            className="flex items-center gap-2 overflow-x-auto pb-1 -mb-1 scrollbar-none"
            role="tablist"
            aria-label="Division categories"
          >
            <button
              type="button"
              role="tab"
              aria-selected={selectedCategoryId === "ALL"}
              onClick={() => setSelectedCategoryId("ALL")}
              className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer ${
                selectedCategoryId === "ALL"
                  ? "bg-[#205823] text-white shadow-xs"
                  : "bg-[#FAFAF8] text-[#172019] hover:bg-[#eef5ef] hover:text-[#205823] border border-[#DDE3DE]"
              }`}
            >
              All Divisions ({teams.length})
            </button>

            {categories.map((cat) => {
              const count = teams.filter((t) => t.category_id === cat.id).length;
              const isSelected = selectedCategoryId === cat.id;

              return (
                <button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setSelectedCategoryId(cat.id)}
                  className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold transition-colors shrink-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer ${
                    isSelected
                      ? "bg-[#205823] text-white shadow-xs"
                      : "bg-[#FAFAF8] text-[#172019] hover:bg-[#eef5ef] hover:text-[#205823] border border-[#DDE3DE]"
                  }`}
                >
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Search Input with Clear Button */}
        <div className="w-full">
          <label
            htmlFor="team-search"
            className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61] mb-2 block"
          >
            Search Teams
          </label>
          <div className="relative flex items-center">
            <div className="absolute left-3.5 text-[#5F6B61] pointer-events-none" aria-hidden="true">
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>

            <input
              id="team-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by team name..."
              className="w-full min-h-[44px] pl-10 pr-10 py-2.5 bg-[#FAFAF8] border border-[#DDE3DE] rounded-xl text-sm text-[#172019] placeholder:text-[#5F6B61] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#205823] focus:border-transparent transition-all"
            />

            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 p-1.5 text-[#5F6B61] hover:text-[#172019] rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] min-h-[36px] min-w-[36px] flex items-center justify-center cursor-pointer"
                aria-label="Clear search query"
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
                    strokeWidth="2"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Results Meta info */}
      <div className="flex items-center justify-between text-xs text-[#5F6B61] px-1">
        <span>
          Showing{" "}
          <strong className="text-[#172019] font-semibold">
            {filteredTeams.length}
          </strong>{" "}
          {filteredTeams.length === 1 ? "team" : "teams"}
          {selectedCategoryId !== "ALL" && " in selected division"}
        </span>
        {(searchQuery || selectedCategoryId !== "ALL") && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="text-[#205823] hover:underline font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded cursor-pointer"
          >
            Reset filters
          </button>
        )}
      </div>

      {/* Teams Grid / List */}
      {filteredTeams.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {filteredTeams.map((team) => (
            <Link
              key={team.id}
              href={`/teams/${team.slug}`}
              className="group block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-2xl"
            >
              <div className="h-full bg-white border border-[#DDE3DE] group-hover:border-[#205823]/50 group-hover:shadow-md transition-all duration-200 rounded-2xl p-5 flex flex-col justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <TeamLogoFallback
                    teamName={team.team_name}
                    logoUrl={team.logo_url}
                    size="md"
                  />
                  <div className="min-w-0 flex-1">
                    <h3 className="text-base sm:text-lg font-bold text-[#172019] group-hover:text-[#205823] transition-colors leading-snug break-words">
                      {team.team_name}
                    </h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <Badge variant="green" size="sm">
                        {team.category_name}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-[#DDE3DE]/60 flex items-center justify-between text-xs">
                  <span className="text-[#5F6B61] flex items-center gap-1.5">
                    <svg
                      className="w-4 h-4 text-[#205823]"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                      />
                    </svg>
                    <strong className="text-[#172019] font-semibold">
                      {team.roster_count}
                    </strong>{" "}
                    {team.roster_count === 1 ? "Player" : "Players"}
                  </span>

                  <span className="font-semibold text-[#205823] group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                    View Roster
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        /* Empty States */
        <div className="bg-white border border-[#DDE3DE] rounded-2xl p-8 sm:p-12 text-center flex flex-col items-center justify-center max-w-md mx-auto shadow-2xs">
          <div className="w-14 h-14 rounded-full bg-[#FAFAF8] border border-[#DDE3DE] flex items-center justify-center text-[#5F6B61] mb-4">
            <svg
              className="w-7 h-7"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>

          <h3 className="text-lg font-bold text-[#172019]">
            {searchQuery || selectedCategoryId !== "ALL"
              ? "No matching teams found"
              : "No official teams yet"}
          </h3>

          <p className="text-sm text-[#5F6B61] mt-2 mb-6">
            {searchQuery || selectedCategoryId !== "ALL"
              ? `We couldn't find any teams matching "${searchQuery || "the selected division"}". Try adjusting your filters or search term.`
              : "Official team registrations are currently being processed. Check back soon for the verified team directory."}
          </p>

          {searchQuery || selectedCategoryId !== "ALL" ? (
            <Button
              variant="secondary"
              size="md"
              onClick={handleResetFilters}
            >
              Reset Filters
            </Button>
          ) : (
            <Link href="/register">
              <Button variant="primary" size="md">
                Register Your Team
              </Button>
            </Link>
          )}
        </div>
      )}
    </div>
  );
};
