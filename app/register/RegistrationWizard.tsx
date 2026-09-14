"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
  type SerializedOpenLeague,
  type SerializedLeagueCategory,
} from "@/app/actions/registration";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardContent,
} from "@/components/ui/Card";

interface RegistrationWizardProps {
  initialLeagues: SerializedOpenLeague[];
  initialCategories?: SerializedLeagueCategory[];
}

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({
  initialLeagues,
  initialCategories = [],
}) => {
  // If exactly 1 open league, pre-select it
  const hasSingleLeague = initialLeagues.length === 1;
  const defaultLeagueId = hasSingleLeague ? initialLeagues[0].id : null;

  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(
    defaultLeagueId
  );
  const [categories, setCategories] = useState<SerializedLeagueCategory[]>(
    defaultLeagueId ? initialCategories : []
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );

  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [isConfirmed, setIsConfirmed] = useState(false);
  const [confirmedData, setConfirmedData] = useState<{
    league: SerializedOpenLeague;
    category: SerializedLeagueCategory;
  } | null>(null);

  // If league selection changes, load corresponding categories
  const handleSelectLeague = async (leagueId: string) => {
    if (leagueId === selectedLeagueId && categories.length > 0) return;

    setSelectedLeagueId(leagueId);
    setSelectedCategoryId(null);
    setValidationError(null);
    setCategoryError(null);
    setIsLoadingCategories(true);

    try {
      const result = await fetchLeagueCategoriesAction(leagueId);
      if (result.success && result.data) {
        setCategories(result.data);
      } else {
        setCategoryError(result.error ?? "Failed to load categories.");
        setCategories([]);
      }
    } catch {
      setCategoryError("An unexpected error occurred while loading categories.");
      setCategories([]);
    } finally {
      setIsLoadingCategories(false);
    }
  };

  const handleSelectCategory = (categoryId: string) => {
    setSelectedCategoryId(categoryId);
    setValidationError(null);
  };

  const handleContinue = async () => {
    if (!selectedLeagueId || !selectedCategoryId) {
      setValidationError("Please select both a league and a category to continue.");
      return;
    }

    setIsValidating(true);
    setValidationError(null);

    try {
      const result = await validateLeagueAndCategoryAction(
        selectedLeagueId,
        selectedCategoryId
      );

      if (result.success && result.data) {
        setConfirmedData(result.data);
        setIsConfirmed(true);
      } else {
        setValidationError(result.error ?? "Selection validation failed.");
      }
    } catch {
      setValidationError("A network or server error occurred during validation.");
    } finally {
      setIsValidating(false);
    }
  };

  const handleResetSelection = () => {
    setIsConfirmed(false);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: "PHP",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getCategoryDivisionInfo = (categoryName: string) => {
    const normalized = categoryName.trim().toLowerCase();
    if (
      normalized.includes("all mahatao") ||
      normalized.includes("mahatao only") ||
      normalized.includes("mahatao")
    ) {
      return {
        label: "Mixed / Co-ed Division",
        note: "Male and female players may be on the same roster.",
      };
    }
    if (normalized.includes("women")) {
      return {
        label: "Women's Division",
        note: null,
      };
    }
    if (normalized.includes("men")) {
      return {
        label: "Men's Division",
        note: null,
      };
    }
    return null;
  };

  // 1. EMPTY STATE: No open leagues
  if (initialLeagues.length === 0) {
    return (
      <Card className="max-w-xl mx-auto text-center p-8 sm:p-12 border-dashed border-[#DDE3DE]">
        <div className="w-14 h-14 rounded-full bg-[#f0f2f0] text-[#5F6B61] mx-auto flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m0 0v2m0-2h2m-2 0H10m11-3.5a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <Badge variant="muted" size="md" className="mb-3">
          Registration Closed
        </Badge>
        <h2 className="text-xl sm:text-2xl font-bold text-[#172019] mb-2">
          Registration is Currently Closed
        </h2>
        <p className="text-sm sm:text-base text-[#5F6B61] mb-6 max-w-md mx-auto leading-relaxed">
          There are currently no active leagues open for public team registration.
          Please check back later or monitor official association announcements.
        </p>
        <Link href="/">
          <Button variant="secondary" size="md">
            Return to Homepage
          </Button>
        </Link>
      </Card>
    );
  }

  const selectedLeague = initialLeagues.find((l) => l.id === selectedLeagueId);
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);

  // 2. CONFIRMED STATE: League and Category successfully selected
  if (isConfirmed && confirmedData) {
    return (
      <div className="max-w-2xl mx-auto animate-in fade-in duration-200">
        <Card className="border-[#205823]/30 shadow-sm overflow-hidden">
          <div className="bg-[#205823] px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                ✓
              </span>
              <span className="font-semibold text-sm sm:text-base">
                Step 1 Verified: League & Category
              </span>
            </div>
            <Badge variant="gold" size="sm">
              Confirmed
            </Badge>
          </div>

          <CardContent className="p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61] mb-1">
                Selected League
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-[#172019]">
                {confirmedData.league.name}
              </h3>
              {confirmedData.league.description && (
                <p className="text-sm text-[#5F6B61] mt-1">
                  {confirmedData.league.description}
                </p>
              )}
            </div>

            <div className="p-4 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                    Category
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <h4 className="text-lg font-bold text-[#172019]">
                      {confirmedData.category.name}
                    </h4>
                    {getCategoryDivisionInfo(confirmedData.category.name) && (
                      <Badge
                        variant="outline"
                        size="sm"
                        className="bg-white text-[#5F6B61] border-[#DDE3DE]"
                      >
                        {
                          getCategoryDivisionInfo(confirmedData.category.name)
                            ?.label
                        }
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                    Entry Fee
                  </p>
                  <p className="text-lg font-black text-[#205823]">
                    {formatCurrency(confirmedData.category.registration_fee)}
                  </p>
                </div>
              </div>

              {confirmedData.category.description && (
                <p className="text-xs text-[#5F6B61] border-t border-[#DDE3DE] pt-2">
                  {confirmedData.category.description}
                </p>
              )}

              {getCategoryDivisionInfo(confirmedData.category.name)?.note && (
                <p className="text-xs text-[#205823] font-medium flex items-center gap-1.5 pt-0.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#205823] shrink-0" />
                  {getCategoryDivisionInfo(confirmedData.category.name)?.note}
                </p>
              )}

              <div className="pt-2 border-t border-[#DDE3DE] flex items-center justify-between text-xs text-[#5F6B61]">
                <span>Roster Requirement:</span>
                <span className="font-semibold text-[#172019]">
                  {confirmedData.category.min_players}–
                  {confirmedData.category.max_players} players
                </span>
              </div>
            </div>

            <div className="rounded-lg bg-[#eef5ef] p-4 border border-[#205823]/20">
              <div className="flex items-start gap-3">
                <span className="text-[#205823] text-lg mt-0.5" aria-hidden="true">
                  ℹ
                </span>
                <div className="text-xs sm:text-sm text-[#205823] leading-relaxed">
                  <span className="font-bold">Phase 04.2 Selection Complete.</span>{" "}
                  Your league and category boundary have been validated on the server.
                  The subsequent step (Phase 04.3 — Team Information) will continue from
                  this verified selection state.
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={handleResetSelection}
                className="w-full sm:w-auto"
              >
                Change Selection
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled
                aria-disabled="true"
                className="w-full sm:flex-1 opacity-75 cursor-not-allowed"
                title="Team search and creation will be connected in Phase 04.3"
              >
                Proceed to Team Info (Phase 04.3)
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 3. SELECTION FORM
  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Step Progress Tracker */}
      <nav aria-label="Registration Progress" className="w-full">
        <ol className="grid grid-cols-4 gap-2 text-center">
          <li className="flex flex-col items-center">
            <span className="w-8 h-8 rounded-full bg-[#205823] text-white flex items-center justify-center text-xs font-bold ring-4 ring-[#205823]/15">
              1
            </span>
            <span className="text-xs font-bold text-[#205823] mt-1.5 line-clamp-1">
              League & Category
            </span>
          </li>
          <li className="flex flex-col items-center opacity-50">
            <span className="w-8 h-8 rounded-full bg-white border border-[#DDE3DE] text-[#5F6B61] flex items-center justify-center text-xs font-medium">
              2
            </span>
            <span className="text-xs text-[#5F6B61] mt-1.5 line-clamp-1">
              Team Info
            </span>
          </li>
          <li className="flex flex-col items-center opacity-50">
            <span className="w-8 h-8 rounded-full bg-white border border-[#DDE3DE] text-[#5F6B61] flex items-center justify-center text-xs font-medium">
              3
            </span>
            <span className="text-xs text-[#5F6B61] mt-1.5 line-clamp-1">
              Roster
            </span>
          </li>
          <li className="flex flex-col items-center opacity-50">
            <span className="w-8 h-8 rounded-full bg-white border border-[#DDE3DE] text-[#5F6B61] flex items-center justify-center text-xs font-medium">
              4
            </span>
            <span className="text-xs text-[#5F6B61] mt-1.5 line-clamp-1">
              Review
            </span>
          </li>
        </ol>
      </nav>

      {/* STEP A: LEAGUE SELECTION */}
      <section aria-labelledby="league-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2
              id="league-heading"
              className="text-lg sm:text-xl font-bold text-[#172019]"
            >
              1. Select League
            </h2>
            <p className="text-xs sm:text-sm text-[#5F6B61]">
              Choose the tournament or league you wish to register for.
            </p>
          </div>
          {hasSingleLeague && (
            <Badge variant="green" size="sm">
              Current Open League
            </Badge>
          )}
        </div>

        <div
          role="radiogroup"
          aria-label="Available Leagues"
          className="grid grid-cols-1 gap-3.5"
        >
          {initialLeagues.map((league) => {
            const isSelected = selectedLeagueId === league.id;
            return (
              <div
                key={league.id}
                role="radio"
                aria-checked={isSelected}
                tabIndex={0}
                onClick={() => handleSelectLeague(league.id)}
                onKeyDown={(e) => {
                  if (e.key === " " || e.key === "Enter") {
                    e.preventDefault();
                    handleSelectLeague(league.id);
                  }
                }}
                className={`group relative p-5 rounded-xl border transition-all cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-2 ${
                  isSelected
                    ? "bg-[#eef5ef]/40 border-[#205823] shadow-xs"
                    : "bg-white border-[#DDE3DE] hover:border-[#205823]/40"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1.5 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-base sm:text-lg font-bold text-[#172019] group-hover:text-[#205823] transition-colors">
                        {league.name}
                      </span>
                      {isSelected && (
                        <Badge variant="green" size="sm">
                          Selected
                        </Badge>
                      )}
                    </div>

                    {league.description && (
                      <p className="text-xs sm:text-sm text-[#5F6B61] leading-relaxed">
                        {league.description}
                      </p>
                    )}
                  </div>

                  {/* Radio Indicator */}
                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 transition-colors ${
                      isSelected
                        ? "border-[#205823] bg-[#205823] text-white"
                        : "border-[#DDE3DE] bg-white group-hover:border-[#205823]"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && (
                      <span className="w-2 h-2 rounded-full bg-white" />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* STEP B: CATEGORY SELECTION */}
      <section aria-labelledby="category-heading" className="space-y-4">
        <div>
          <h2
            id="category-heading"
            className="text-lg sm:text-xl font-bold text-[#172019]"
          >
            2. Select Category
          </h2>
          <p className="text-xs sm:text-sm text-[#5F6B61]">
            {selectedLeague
              ? `Categories for ${selectedLeague.name}:`
              : "Please select a league above to display available categories."}
          </p>
        </div>

        {/* Category Loading State */}
        {isLoadingCategories && (
          <Card className="p-8 text-center bg-[#FAFAF8] border-dashed border-[#DDE3DE]">
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-[#5F6B61]">
              <div
                className="w-6 h-6 border-2 border-[#205823] border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
              <span>Loading tournament categories...</span>
            </div>
          </Card>
        )}

        {/* Category Error State */}
        {categoryError && !isLoadingCategories && (
          <Card className="p-6 bg-[#fef2f2] border-red-200 text-center">
            <p className="text-sm font-semibold text-red-800 mb-3">
              {categoryError}
            </p>
            {selectedLeagueId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectLeague(selectedLeagueId)}
              >
                Retry Loading Categories
              </Button>
            )}
          </Card>
        )}

        {/* Empty Categories State */}
        {!isLoadingCategories &&
          !categoryError &&
          selectedLeagueId &&
          categories.length === 0 && (
            <Card className="p-6 text-center bg-[#FAFAF8] border-[#DDE3DE]">
              <p className="text-sm text-[#5F6B61]">
                No categories are currently available for this league.
              </p>
            </Card>
          )}

        {/* Categories List */}
        {!isLoadingCategories && !categoryError && categories.length > 0 && (
          <div
            role="radiogroup"
            aria-label="League Categories"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {categories.map((category) => {
              const isSelected = selectedCategoryId === category.id;
              const division = getCategoryDivisionInfo(category.name);
              return (
                <div
                  key={category.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => handleSelectCategory(category.id)}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      handleSelectCategory(category.id);
                    }
                  }}
                  className={`group relative p-5 rounded-xl border flex flex-col justify-between transition-all cursor-pointer select-none outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-2 ${
                    isSelected
                      ? "bg-[#eef5ef]/40 border-[#205823] shadow-xs"
                      : "bg-white border-[#DDE3DE] hover:border-[#205823]/40"
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base sm:text-lg font-bold text-[#172019] group-hover:text-[#205823] transition-colors">
                            {category.name}
                          </h3>
                          {division && (
                            <Badge
                              variant="outline"
                              size="sm"
                              className="bg-[#FAFAF8] text-[#5F6B61] border-[#DDE3DE]"
                            >
                              {division.label}
                            </Badge>
                          )}
                          {isSelected && (
                            <Badge variant="green" size="sm">
                              Selected
                            </Badge>
                          )}
                        </div>
                      </div>

                      {/* Radio Indicator */}
                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected
                            ? "border-[#205823] bg-[#205823] text-white"
                            : "border-[#DDE3DE] bg-white group-hover:border-[#205823]"
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && (
                          <span className="w-2 h-2 rounded-full bg-white" />
                        )}
                      </div>
                    </div>

                    {category.description && (
                      <p className="text-xs text-[#5F6B61] leading-relaxed">
                        {category.description}
                      </p>
                    )}

                    {division?.note && (
                      <p className="text-xs text-[#205823] font-medium flex items-center gap-1.5 pt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#205823] shrink-0" />
                        {division.note}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 mt-4 border-t border-[#DDE3DE]/60 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5F6B61]">Registration Fee:</span>
                      <span className="font-extrabold text-[#205823] text-sm">
                        {formatCurrency(category.registration_fee)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5F6B61]">Roster Limits:</span>
                      <span className="font-semibold text-[#172019]">
                        {category.min_players}–{category.max_players} players
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Validation Error Banner */}
      {validationError && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-[#fef2f2] border border-red-200 text-xs sm:text-sm text-red-800 font-medium flex items-center gap-2.5 animate-in fade-in"
        >
          <span className="shrink-0 text-base" aria-hidden="true">
            ⚠️
          </span>
          <span>{validationError}</span>
        </div>
      )}

      {/* Action Footer */}
      <div className="pt-4 border-t border-[#DDE3DE] flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="text-xs text-[#5F6B61] text-center sm:text-left">
          {selectedLeague && selectedCategory ? (
            <span>
              Selected: <strong className="text-[#172019]">{selectedLeague.name}</strong> /{" "}
              <strong className="text-[#205823]">{selectedCategory.name}</strong>
            </span>
          ) : (
            <span>Select both a league and category to proceed</span>
          )}
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleContinue}
          disabled={!selectedLeagueId || !selectedCategoryId || isValidating}
          className="w-full sm:w-auto min-w-[160px]"
        >
          {isValidating ? "Validating..." : "Continue"}
        </Button>
      </div>
    </div>
  );
};
