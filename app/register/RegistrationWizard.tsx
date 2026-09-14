"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
  calculateRosterAction,
  type SerializedOpenLeague,
  type SerializedLeagueCategory,
} from "@/app/actions/registration";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface RegistrationWizardProps {
  initialLeagues: SerializedOpenLeague[];
  initialCategories?: SerializedLeagueCategory[];
}

interface RosterPlayer {
  id: string;
  firstName: string;
  lastName: string;
  jerseyNumber?: string;
  position?: string;
}

const DEFAULT_SAMPLE_PLAYERS: RosterPlayer[] = [
  { id: "p-1", firstName: "Juan", lastName: "Dela Cruz", jerseyNumber: "1", position: "Outside Hitter" },
  { id: "p-2", firstName: "Pedro", lastName: "Santos", jerseyNumber: "4", position: "Middle Blocker" },
  { id: "p-3", firstName: "Mark", lastName: "Reyes", jerseyNumber: "7", position: "Setter" },
  { id: "p-4", firstName: "Christian", lastName: "Ramos", jerseyNumber: "10", position: "Opposite" },
  { id: "p-5", firstName: "Angelo", lastName: "Batan", jerseyNumber: "12", position: "Libero" },
  { id: "p-6", firstName: "Joshua", lastName: "Garcia", jerseyNumber: "3", position: "Outside Hitter" },
  { id: "p-7", firstName: "Gabriel", lastName: "Flores", jerseyNumber: "8", position: "Middle Blocker" },
  { id: "p-8", firstName: "Daniel", lastName: "Ibanes", jerseyNumber: "5", position: "Utility" },
];

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({
  initialLeagues,
  initialCategories = [],
}) => {
  // If exactly 1 open league, pre-select it
  const hasSingleLeague = initialLeagues.length === 1;
  const defaultLeagueId = hasSingleLeague ? initialLeagues[0].id : null;

  // Step state: 'selection' | 'roster' | 'review'
  const [currentStep, setCurrentStep] = useState<"selection" | "roster" | "review">("selection");

  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(defaultLeagueId);
  const [categories, setCategories] = useState<SerializedLeagueCategory[]>(
    defaultLeagueId ? initialCategories : []
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);

  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [confirmedData, setConfirmedData] = useState<{
    league: SerializedOpenLeague;
    category: SerializedLeagueCategory;
  } | null>(null);

  // Roster state
  const [roster, setRoster] = useState<RosterPlayer[]>(DEFAULT_SAMPLE_PLAYERS);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newJersey, setNewJersey] = useState("");
  const [newPosition, setNewPosition] = useState("Outside Hitter");
  const [addPlayerError, setAddPlayerError] = useState<string | null>(null);

  // When league selection changes
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

  // Step 1: Proceed to Roster Step
  const handleConfirmStep1 = async () => {
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
        setCurrentStep("roster");
      } else {
        setValidationError(result.error ?? "Selection validation failed.");
      }
    } catch {
      setValidationError("A network or server error occurred during validation.");
    } finally {
      setIsValidating(false);
    }
  };

  // Add player to roster
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim()) {
      setAddPlayerError("First and last name are required.");
      return;
    }

    const activeCat = confirmedData ? confirmedData.category : selectedCategory;
    const maxPlayers = activeCat ? activeCat.max_players : 20;

    if (roster.length >= maxPlayers) {
      setAddPlayerError(
        `Roster limit reached. Maximum allowed players for this category is ${maxPlayers}.`
      );
      return;
    }

    const newPlayer: RosterPlayer = {
      id: `player-${Date.now()}`,
      firstName: newFirstName.trim(),
      lastName: newLastName.trim(),
      jerseyNumber: newJersey.trim() || undefined,
      position: newPosition,
    };

    setRoster((prev) => [...prev, newPlayer]);
    setNewFirstName("");
    setNewLastName("");
    setNewJersey("");
    setAddPlayerError(null);
  };

  // Remove player from roster
  const handleRemovePlayer = (id: string) => {
    setRoster((prev) => prev.filter((p) => p.id !== id));
  };

  // Proceed to review
  const handleProceedToReview = async () => {
    if (!confirmedData) return;
    setIsValidating(true);
    try {
      // Validate fee and status on the server
      const calcResult = await calculateRosterAction(
        confirmedData.league.id,
        confirmedData.category.id,
        roster.length
      );
      if (calcResult.success) {
        setCurrentStep("review");
      } else {
        setValidationError(calcResult.error ?? "Calculation verification failed.");
      }
    } catch {
      setValidationError("Server validation failed. Please try again.");
    } finally {
      setIsValidating(false);
    }
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

  // Dynamic fee calculation for active roster based on selected category in DB
  const activeCategory = confirmedData ? confirmedData.category : selectedCategory;
  const feeRate = activeCategory ? activeCategory.registration_fee : 300;
  const minRequiredPlayers = activeCategory ? activeCategory.min_players : 12;
  const maxAllowedPlayers = activeCategory ? activeCategory.max_players : 20;

  const currentRosterCount = roster.length;
  const isRosterComplete = currentRosterCount >= minRequiredPlayers;
  const totalRegistrationFee = currentRosterCount * feeRate;

  // 2. STEP: ROSTER & PER-PLAYER FEE CALCULATION
  if (currentStep === "roster" && confirmedData) {
    const division = getCategoryDivisionInfo(confirmedData.category.name);

    return (
      <div className="space-y-8 max-w-3xl mx-auto animate-in fade-in duration-200">
        {/* Step Progress Tracker */}
        <nav aria-label="Registration Progress" className="w-full">
          <ol className="grid grid-cols-4 gap-2 text-center">
            <li className="flex flex-col items-center">
              <span className="w-8 h-8 rounded-full bg-[#eef5ef] text-[#205823] border border-[#205823] flex items-center justify-center text-xs font-bold">
                ✓
              </span>
              <span className="text-xs font-semibold text-[#205823] mt-1.5 line-clamp-1">
                League & Cat
              </span>
            </li>
            <li className="flex flex-col items-center">
              <span className="w-8 h-8 rounded-full bg-[#205823] text-white flex items-center justify-center text-xs font-bold ring-4 ring-[#205823]/15">
                2
              </span>
              <span className="text-xs font-bold text-[#205823] mt-1.5 line-clamp-1">
                Team Roster
              </span>
            </li>
            <li className="flex flex-col items-center opacity-50">
              <span className="w-8 h-8 rounded-full bg-white border border-[#DDE3DE] text-[#5F6B61] flex items-center justify-center text-xs font-medium">
                3
              </span>
              <span className="text-xs text-[#5F6B61] mt-1.5 line-clamp-1">
                Team Details
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

        {/* Header with Selected League & Category */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE3DE]">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#205823]">
                {confirmedData.league.name}
              </span>
              <span className="text-[#5F6B61]">•</span>
              <span className="text-xs font-bold text-[#172019]">
                {confirmedData.category.name}
              </span>
              {division && (
                <Badge variant="outline" size="sm">
                  {division.label}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#172019]">
              Team Roster & Player Entry
            </h2>
            <p className="text-xs sm:text-sm text-[#5F6B61] mt-0.5">
              Registration rate is{" "}
              <strong className="text-[#205823]">
                {formatCurrency(feeRate)} per player
              </strong>
              . Roster must ultimately reach at least {minRequiredPlayers} players.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStep("selection")}
            className="shrink-0 self-start sm:self-auto"
          >
            Change Category
          </Button>
        </div>

        {/* Dynamic Calculation & Roster Status Card */}
        <Card className="border-[#205823]/30 shadow-xs overflow-hidden">
          <div className="bg-[#FAFAF8] p-5 sm:p-6 border-b border-[#DDE3DE] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                Current Roster
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#172019] mt-0.5">
                {currentRosterCount}{" "}
                <span className="text-sm font-normal text-[#5F6B61]">players</span>
              </p>
              <p className="text-xs text-[#5F6B61] mt-1">
                Final requirement: <strong>Min. {minRequiredPlayers} players</strong>{" "}
                <span className="text-[#5F6B61]">(Max {maxAllowedPlayers})</span>
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                Roster Status
              </p>
              <div className="mt-1.5">
                {isRosterComplete ? (
                  <Badge variant="green" size="md" className="font-bold">
                    Complete — {currentRosterCount}/{minRequiredPlayers} players
                  </Badge>
                ) : (
                  <Badge variant="gold" size="md" className="font-bold">
                    Incomplete — {currentRosterCount}/{minRequiredPlayers} players
                  </Badge>
                )}
              </div>
              <p className="text-xs text-[#5F6B61] mt-1.5">
                {isRosterComplete
                  ? "Meets final roster requirement"
                  : "Registration allowed with fewer"}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                Registration Fee
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#205823] mt-0.5">
                {formatCurrency(totalRegistrationFee)}
              </p>
              <p className="text-xs text-[#5F6B61] mt-1 font-mono">
                {currentRosterCount} × {formatCurrency(feeRate)}
              </p>
            </div>
          </div>

          {/* Status Message Box */}
          <div className="p-4 sm:p-5">
            {isRosterComplete ? (
              <div className="p-3.5 rounded-lg bg-[#eef5ef] border border-[#205823]/20 flex items-start gap-3">
                <span className="text-[#205823] text-lg mt-0.5" aria-hidden="true">
                  ✓
                </span>
                <div className="text-xs sm:text-sm text-[#205823] leading-relaxed">
                  <span className="font-bold">Complete Roster:</span> Your team has{" "}
                  {currentRosterCount} registered players, meeting the official category {minRequiredPlayers}-player minimum
                  requirement.
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-[#fef9e8] border border-[#F5D025]/40 flex items-start gap-3">
                <span className="text-[#876a16] text-lg mt-0.5" aria-hidden="true">
                  ⚠️
                </span>
                <div className="text-xs sm:text-sm text-[#876a16] leading-relaxed">
                  <span className="font-bold">
                    Incomplete Roster ({currentRosterCount}/{minRequiredPlayers} players):
                  </span>{" "}
                  You are permitted to submit your registration with fewer than {minRequiredPlayers} players.
                  However, your team must reach at least {minRequiredPlayers} players before final roster lock and
                  tournament play.
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Player Entry Form */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#DDE3DE]">
            <div>
              <h3 className="text-base font-bold text-[#172019]">Add Team Player</h3>
              <p className="text-xs text-[#5F6B61]">
                Enter player details to add them to your registration roster.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRoster(DEFAULT_SAMPLE_PLAYERS)}
              className="text-xs text-[#5F6B61] self-start sm:self-auto"
            >
              Reset to 8 Sample Players
            </Button>
          </div>

          <form onSubmit={handleAddPlayer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <Input
                label="First Name"
                placeholder="e.g. Juan"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                required
              />
              <Input
                label="Last Name"
                placeholder="e.g. Dela Cruz"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                required
              />
              <Input
                label="Jersey Number"
                placeholder="e.g. 7"
                value={newJersey}
                onChange={(e) => setNewJersey(e.target.value)}
              />
              <div>
                <label className="block text-sm font-medium text-[#172019] mb-1.5">
                  Position
                </label>
                <select
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  className="w-full rounded-lg border border-[#DDE3DE] bg-white px-3.5 py-2.5 text-sm text-[#172019] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
                >
                  <option value="Outside Hitter">Outside Hitter</option>
                  <option value="Middle Blocker">Middle Blocker</option>
                  <option value="Setter">Setter</option>
                  <option value="Opposite">Opposite</option>
                  <option value="Libero">Libero</option>
                  <option value="Utility">Utility</option>
                </select>
              </div>
            </div>

            {addPlayerError && (
              <p className="text-xs text-red-600 font-medium">{addPlayerError}</p>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" size="md">
                + Add Player to Roster
              </Button>
            </div>
          </form>
        </Card>

        {/* Current Roster List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#172019]">
              Registered Roster ({currentRosterCount} Players)
            </h3>
            <span className="text-xs text-[#5F6B61]">
              Subtotal: {formatCurrency(totalRegistrationFee)}
            </span>
          </div>

          {roster.length === 0 ? (
            <Card className="p-8 text-center bg-[#FAFAF8] border-dashed border-[#DDE3DE]">
              <p className="text-sm text-[#5F6B61]">
                No players added yet. Use the form above to add your players.
              </p>
            </Card>
          ) : (
            <div className="bg-white rounded-xl border border-[#DDE3DE] overflow-hidden divide-y divide-[#DDE3DE]">
              {roster.map((player, index) => (
                <div
                  key={player.id}
                  className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-[#FAFAF8] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-[#eef5ef] text-[#205823] flex items-center justify-center text-xs font-bold shrink-0">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-bold text-[#172019]">
                        {player.firstName} {player.lastName}
                      </p>
                      <p className="text-xs text-[#5F6B61] flex items-center gap-2">
                        {player.jerseyNumber && (
                          <span>Jersey #{player.jerseyNumber}</span>
                        )}
                        {player.jerseyNumber && player.position && <span>•</span>}
                        {player.position && <span>{player.position}</span>}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="text-xs font-semibold text-[#205823]">
                      +{formatCurrency(feeRate)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemovePlayer(player.id)}
                      className="text-xs text-red-600 hover:text-red-800 p-1.5 rounded hover:bg-red-50 transition-colors"
                      title={`Remove ${player.firstName} ${player.lastName}`}
                      aria-label={`Remove ${player.firstName} ${player.lastName}`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Action Footer */}
        <div className="pt-4 border-t border-[#DDE3DE] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs text-[#5F6B61] text-center sm:text-left">
            Total:{" "}
            <strong className="text-base text-[#205823]">
              {formatCurrency(totalRegistrationFee)}
            </strong>{" "}
            ({currentRosterCount} players × {formatCurrency(feeRate)})
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setCurrentStep("selection")}
              className="w-full sm:w-auto"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleProceedToReview}
              disabled={roster.length === 0 || isValidating}
              className="w-full sm:w-auto min-w-[180px]"
            >
              {isValidating ? "Verifying..." : "Continue to Review"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. STEP: REVIEW / CONFIRMATION
  if (currentStep === "review" && confirmedData) {
    const division = getCategoryDivisionInfo(confirmedData.category.name);

    return (
      <div className="max-w-2xl mx-auto animate-in fade-in duration-200 space-y-6">
        <Card className="border-[#205823]/30 shadow-sm overflow-hidden">
          <div className="bg-[#205823] px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                ✓
              </span>
              <span className="font-semibold text-sm sm:text-base">
                Registration Summary
              </span>
            </div>
            {isRosterComplete ? (
              <Badge variant="green" size="sm" className="bg-white text-[#205823]">
                Roster Complete
              </Badge>
            ) : (
              <Badge variant="gold" size="sm">
                Roster Incomplete
              </Badge>
            )}
          </div>

          <CardContent className="p-6 sm:p-8 space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61] mb-1">
                Tournament League
              </p>
              <h3 className="text-xl sm:text-2xl font-black text-[#172019]">
                {confirmedData.league.name}
              </h3>
            </div>

            <div className="p-4 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                    Category / Division
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <h4 className="text-lg font-bold text-[#172019]">
                      {confirmedData.category.name}
                    </h4>
                    {division && (
                      <Badge variant="outline" size="sm">
                        {division.label}
                      </Badge>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                    Rate
                  </p>
                  <p className="text-base font-bold text-[#172019]">
                    {formatCurrency(feeRate)} / player
                  </p>
                </div>
              </div>

              {division?.note && (
                <p className="text-xs text-[#205823] font-medium pt-1">
                  {division.note}
                </p>
              )}
            </div>

            {/* Roster & Fee Summary */}
            <div className="p-4 rounded-lg border border-[#DDE3DE] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#172019]">
                  Registered Players
                </span>
                <span className="text-sm font-bold text-[#172019]">
                  {currentRosterCount} players
                </span>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[#172019]">
                  Roster Status
                </span>
                {isRosterComplete ? (
                  <Badge variant="green" size="sm">
                    Complete ({currentRosterCount}/{minRequiredPlayers})
                  </Badge>
                ) : (
                  <Badge variant="gold" size="sm">
                    Incomplete ({currentRosterCount}/{minRequiredPlayers})
                  </Badge>
                )}
              </div>

              <div className="pt-3 border-t border-[#DDE3DE] flex items-center justify-between">
                <div>
                  <span className="text-base font-extrabold text-[#172019]">
                    Total Registration Amount
                  </span>
                  <p className="text-xs text-[#5F6B61]">
                    {currentRosterCount} players × {formatCurrency(feeRate)}
                  </p>
                </div>
                <span className="text-2xl font-black text-[#205823]">
                  {formatCurrency(totalRegistrationFee)}
                </span>
              </div>
            </div>

            {/* Incomplete Warning if < minRequiredPlayers */}
            {!isRosterComplete && (
              <div className="p-3.5 rounded-lg bg-[#fef9e8] border border-[#F5D025]/40 text-xs text-[#876a16] leading-relaxed">
                <strong>Incomplete Roster Notice:</strong> Your team is registering with{" "}
                {currentRosterCount} players. Registration will be accepted, but your team is required
                to submit at least {minRequiredPlayers} players prior to the official competition roster lock.
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                variant="secondary"
                size="md"
                onClick={() => setCurrentStep("roster")}
                className="w-full sm:w-auto"
              >
                ← Back to Roster
              </Button>
              <Button
                variant="primary"
                size="md"
                disabled
                aria-disabled="true"
                className="w-full sm:flex-1 opacity-75 cursor-not-allowed"
                title="Registration submission will be finalized in later increments"
              >
                {isRosterComplete
                  ? "Submit Registration (Complete Roster)"
                  : "Submit Registration (Incomplete Roster Allowed)"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // 4. STEP 1: LEAGUE & CATEGORY SELECTION FORM
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
              Team Roster
            </span>
          </li>
          <li className="flex flex-col items-center opacity-50">
            <span className="w-8 h-8 rounded-full bg-white border border-[#DDE3DE] text-[#5F6B61] flex items-center justify-center text-xs font-medium">
              3
            </span>
            <span className="text-xs text-[#5F6B61] mt-1.5 line-clamp-1">
              Team Details
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
                      <span className="text-[#5F6B61]">Registration Rate:</span>
                      <span className="font-extrabold text-[#205823] text-sm">
                        {formatCurrency(category.registration_fee)}{" "}
                        <span className="font-normal text-xs text-[#5F6B61]">
                          / player
                        </span>
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5F6B61]">Final Roster:</span>
                      <span className="font-semibold text-[#172019]">
                        Min. {category.min_players} players{" "}
                        <span className="font-normal text-[#5F6B61]">
                          (fewer allowed to register)
                        </span>
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
              <strong className="text-[#205823]">{selectedCategory.name}</strong> • Rate:{" "}
              <strong>{formatCurrency(selectedCategory.registration_fee)} / player</strong>
            </span>
          ) : (
            <span>Select both a league and category to proceed</span>
          )}
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleConfirmStep1}
          disabled={!selectedLeagueId || !selectedCategoryId || isValidating}
          className="w-full sm:w-auto min-w-[160px]"
        >
          {isValidating ? "Validating..." : "Continue to Roster"}
        </Button>
      </div>
    </div>
  );
};
