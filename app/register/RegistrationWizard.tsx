"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  fetchLeagueCategoriesAction,
  validateLeagueAndCategoryAction,
  fetchExistingTeamsAction,
  fetchTeamPreviousMembersAction,
  submitTeamRegistrationAction,
  type SerializedOpenLeague,
  type SerializedLeagueCategory,
  type ExistingTeamItem,
  type PreviousTeamMember,
  type CreateRegistrationResult,
} from "@/app/actions/registration";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

interface RegistrationWizardProps {
  initialLeagues: SerializedOpenLeague[];
  initialCategories?: SerializedLeagueCategory[];
}

export interface RosterMember {
  id: string; // Temporary or resolved player ID
  playerId?: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  jerseyNumber?: string;
  position?: string;
  isExisting?: boolean;
}

type WizardStep = "division" | "team" | "registrant" | "captain" | "review" | "success";

export const RegistrationWizard: React.FC<RegistrationWizardProps> = ({
  initialLeagues,
  initialCategories = [],
}) => {
  const router = useRouter();
  const hasSingleLeague = initialLeagues.length === 1;
  const defaultLeagueId = hasSingleLeague ? initialLeagues[0].id : null;

  // Step state
  const [currentStep, setCurrentStep] = useState<WizardStep>("division");

  // Step 1: League & Category
  const [selectedLeagueId, setSelectedLeagueId] = useState<string | null>(defaultLeagueId);
  const [categories, setCategories] = useState<SerializedLeagueCategory[]>(
    defaultLeagueId ? initialCategories : []
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [isLoadingCategories, setIsLoadingCategories] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [confirmedData, setConfirmedData] = useState<{
    league: SerializedOpenLeague;
    category: SerializedLeagueCategory;
  } | null>(null);

  // Step 2: Team Choice & Roster
  const [teamMode, setTeamMode] = useState<"existing" | "new">("new");
  const [existingTeams, setExistingTeams] = useState<ExistingTeamItem[]>([]);
  const [isLoadingExistingTeams, setIsLoadingExistingTeams] = useState(false);
  const [teamSearchQuery, setTeamSearchQuery] = useState("");
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedExistingTeam, setSelectedExistingTeam] = useState<ExistingTeamItem | null>(null);
  const [isLoadingPreviousMembers, setIsLoadingPreviousMembers] = useState(false);
  const [previousMembersLoaded, setPreviousMembersLoaded] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");

  // Roster
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [newFirstName, setNewFirstName] = useState("");
  const [newMiddleName, setNewMiddleName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [rosterError, setRosterError] = useState<string | null>(null);

  // Step 3: Registrant Info
  const [regFirstName, setRegFirstName] = useState("");
  const [regMiddleName, setRegMiddleName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regSuffix, setRegSuffix] = useState("");
  const [regContact, setRegContact] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [registrantError, setRegistrantError] = useState<string | null>(null);

  // Step 4: Captain
  const [captainRosterId, setCaptainRosterId] = useState<string | null>(null);
  const [captainError, setCaptainError] = useState<string | null>(null);

  // Step 5 & 6: Submission
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [submissionResult, setSubmissionResult] = useState<CreateRegistrationResult | null>(null);

  // General Validation Error
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Load existing teams when confirmedData changes
  useEffect(() => {
    let isCancelled = false;
    if (confirmedData?.league.id && confirmedData?.category.id) {
      fetchExistingTeamsAction(confirmedData.league.id, confirmedData.category.id)
        .then((res) => {
          if (!isCancelled && res.success && res.data) {
            setExistingTeams(res.data);
          }
        })
        .finally(() => {
          if (!isCancelled) {
            setIsLoadingExistingTeams(false);
          }
        });
    }
    return () => {
      isCancelled = true;
    };
  }, [confirmedData]);

  // Handle category fetch when league changes
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

  // Step 1 -> Step 2
  const handleConfirmDivision = async () => {
    if (!selectedLeagueId || !selectedCategoryId) {
      setValidationError("Please select both a tournament and a division to continue.");
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
        setCurrentStep("team");
      } else {
        setValidationError(result.error ?? "Division validation failed.");
      }
    } catch {
      setValidationError("Server validation encountered an error. Please try again.");
    } finally {
      setIsValidating(false);
    }
  };

  // Select an existing team
  const handleSelectExistingTeam = async (team: ExistingTeamItem) => {
    if (team.is_registered_in_category) return; // Prevent selection of already registered teams

    setSelectedTeamId(team.id);
    setSelectedExistingTeam(team);
    setRosterError(null);
    setIsLoadingPreviousMembers(true);
    setPreviousMembersLoaded(false);

    try {
      const membersRes = await fetchTeamPreviousMembersAction(team.id);
      if (membersRes.success && membersRes.data) {
        const mappedMembers: RosterMember[] = membersRes.data.map((pm: PreviousTeamMember) => ({
          id: `prev-${pm.player_id}`,
          playerId: pm.player_id,
          firstName: pm.first_name,
          middleName: pm.middle_name ?? undefined,
          lastName: pm.last_name,
          suffix: pm.suffix ?? undefined,
          isExisting: true,
        }));

        setRoster(mappedMembers);
        setPreviousMembersLoaded(true);
        // Do NOT auto-select captain; captain must be explicitly selected by user
      }
    } catch (err) {
      console.error("Failed to load previous members:", err);
      setRosterError("Unable to load previous team members. You can still add players manually.");
    } finally {
      setIsLoadingPreviousMembers(false);
    }
  };

  // Add player to current roster (No maximum limit for initial registration)
  const handleAddPlayer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFirstName.trim() || !newLastName.trim()) {
      setRosterError("Player first name and last name are required.");
      return;
    }

    const newPlayer: RosterMember = {
      id: `player-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      firstName: newFirstName.trim(),
      middleName: newMiddleName.trim() || undefined,
      lastName: newLastName.trim(),
      isExisting: false,
    };

    setRoster((prev) => [...prev, newPlayer]);
    setNewFirstName("");
    setNewMiddleName("");
    setNewLastName("");
    setRosterError(null);
  };

  // Remove player from current tournament roster
  const handleRemovePlayer = (id: string) => {
    setRoster((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      // If removed player was designated captain, clear captain selection
      if (captainRosterId === id) {
        setCaptainRosterId(null);
      }
      return filtered;
    });
  };

  // Step 2 -> Step 3
  const handleProceedToRegistrant = () => {
    setRosterError(null);

    if (teamMode === "existing") {
      if (!selectedTeamId || !selectedExistingTeam) {
        setRosterError("Please select your existing team to continue.");
        return;
      }
    } else {
      if (!newTeamName.trim()) {
        setRosterError("Please enter your team name to continue.");
        return;
      }
    }

    if (roster.length === 0) {
      setRosterError("Please add at least one player to your team roster.");
      return;
    }

    setCurrentStep("registrant");
  };

  // Step 3 -> Step 4
  const handleProceedToCaptain = () => {
    setRegistrantError(null);
    if (!regFirstName.trim() || !regLastName.trim()) {
      setRegistrantError("First name and last name are required.");
      return;
    }
    if (!regContact.trim()) {
      setRegistrantError("Contact number is required.");
      return;
    }

    // Clear captain if previously selected captain is no longer in roster
    if (captainRosterId && !roster.some((p) => p.id === captainRosterId)) {
      setCaptainRosterId(null);
    }

    setCurrentStep("captain");
  };

  // Step 4 -> Step 5
  const handleProceedToReview = () => {
    setCaptainError(null);
    if (!captainRosterId) {
      setCaptainError("Please select a team captain from your roster.");
      return;
    }

    const captainExists = roster.some((p) => p.id === captainRosterId);
    if (!captainExists) {
      setCaptainError("The selected team captain must be a player in your current roster.");
      return;
    }

    setCurrentStep("review");
  };

  // Step 5: Final Submission
  const handleSubmitRegistration = async () => {
    if (!confirmedData) return;
    setIsSubmitting(true);
    setSubmissionError(null);

    const activeTeamName =
      teamMode === "existing" ? selectedExistingTeam?.team_name ?? "" : newTeamName.trim();

    try {
      const payload = {
        league_id: confirmedData.league.id,
        league_category_id: confirmedData.category.id,
        team_mode: teamMode,
        team_id: teamMode === "existing" ? selectedTeamId : null,
        new_team_name: teamMode === "new" ? activeTeamName : null,
        registrant: {
          first_name: regFirstName.trim(),
          middle_name: regMiddleName.trim() || null,
          last_name: regLastName.trim(),
          suffix: regSuffix.trim() || null,
          contact: regContact.trim(),
          email: regEmail.trim() || null,
        },
        players: roster.map((p) => ({
          player_id: p.playerId ?? null,
          first_name: p.firstName,
          middle_name: p.middleName ?? null,
          last_name: p.lastName,
          suffix: p.suffix ?? null,
          jersey_number: p.jerseyNumber ? parseInt(p.jerseyNumber, 10) : null,
          position: p.position ?? null,
          is_captain: p.id === captainRosterId,
        })),
      };

      const res = await submitTeamRegistrationAction(payload);
      if (res.success && res.data) {
        setSubmissionResult(res.data);
        if (res.data.registration_code) {
          router.push(`/register/success?ref=${encodeURIComponent(res.data.registration_code)}`);
          return;
        }
        setCurrentStep("success");
      } else {
        setSubmissionError(res.error ?? "Failed to submit registration. Please try again.");
      }
    } catch {
      setSubmissionError("A server or network error occurred while submitting. Please try again.");
    } finally {
      setIsSubmitting(false);
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

  // Calculations for current category & roster
  const activeCategory = confirmedData ? confirmedData.category : categories.find((c) => c.id === selectedCategoryId);
  const feeRate = activeCategory ? activeCategory.registration_fee : 300;
  const minRequiredPlayers = activeCategory ? activeCategory.min_players : 12;

  const currentRosterCount = roster.length;
  const isRosterComplete = currentRosterCount >= minRequiredPlayers;
  const totalRegistrationFee = currentRosterCount * feeRate;

  const activeTeamName =
    teamMode === "existing"
      ? selectedExistingTeam?.team_name ?? "Selected Team"
      : newTeamName.trim() || "New Team";

  const selectedCaptainPlayer = roster.find((p) => p.id === captainRosterId);

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

  // PROGRESS BAR
  const renderProgressBar = () => {
    const steps = [
      { id: "division", label: "Your Division", number: 1 },
      { id: "team", label: "Your Team", number: 2 },
      { id: "registrant", label: "Your Information", number: 3 },
      { id: "captain", label: "Team Captain", number: 4 },
      { id: "review", label: "Review", number: 5 },
    ];

    const getStepIndex = (s: WizardStep) => {
      switch (s) {
        case "division": return 0;
        case "team": return 1;
        case "registrant": return 2;
        case "captain": return 3;
        case "review": return 4;
        case "success": return 5;
      }
    };

    const currentIdx = getStepIndex(currentStep);

    if (currentStep === "success") return null;

    return (
      <nav aria-label="Registration Progress" className="w-full mb-6">
        <ol className="grid grid-cols-5 gap-1.5 sm:gap-2 text-center">
          {steps.map((step, idx) => {
            const isCompleted = idx < currentIdx;
            const isCurrent = idx === currentIdx;

            return (
              <li key={step.id} className="flex flex-col items-center">
                <span
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                    isCurrent
                      ? "bg-[#205823] text-white ring-4 ring-[#205823]/15"
                      : isCompleted
                      ? "bg-[#eef5ef] text-[#205823] border border-[#205823]"
                      : "bg-white border border-[#DDE3DE] text-[#5F6B61]"
                  }`}
                >
                  {isCompleted ? "✓" : step.number}
                </span>
                <span
                  className={`text-[11px] sm:text-xs mt-1.5 line-clamp-1 ${
                    isCurrent
                      ? "font-bold text-[#205823]"
                      : isCompleted
                      ? "font-semibold text-[#205823]"
                      : "text-[#5F6B61] opacity-70"
                  }`}
                >
                  {step.label}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>
    );
  };

  // ==========================================
  // 6. CONFIRMATION / SUCCESS STATE
  // ==========================================
  if (currentStep === "success" && submissionResult) {
    return (
      <div className="max-w-2xl mx-auto animate-in fade-in duration-300 space-y-6">
        <Card className="border-[#205823]/40 shadow-md overflow-hidden">
          <div className="bg-[#205823] text-white p-6 sm:p-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-2 text-2xl font-bold">
              ✓
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Registration Submitted!
            </h2>
            <p className="text-sm sm:text-base text-white/90 max-w-md mx-auto">
              Your volleyball team registration has been successfully received.
            </p>
          </div>

          <CardContent className="p-6 sm:p-8 space-y-6">
            {/* Registration Code Showcase */}
            <div className="text-center p-5 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Official Registration Reference
              </span>
              <p className="text-2xl sm:text-3xl font-black text-[#205823] font-mono tracking-wider">
                {submissionResult.registration_code ?? "MVA-2026-PENDING"}
              </p>
              <div className="flex justify-center pt-1">
                <Badge variant="gold" size="md">
                  Status: PENDING PAYMENT
                </Badge>
              </div>
            </div>

            {/* Summary Details */}
            <div className="divide-y divide-[#DDE3DE] border border-[#DDE3DE] rounded-xl overflow-hidden bg-white text-sm">
              <div className="p-3.5 sm:p-4 flex justify-between">
                <span className="text-[#5F6B61]">Team Name</span>
                <span className="font-bold text-[#172019]">{submissionResult.team_name}</span>
              </div>
              <div className="p-3.5 sm:p-4 flex justify-between">
                <span className="text-[#5F6B61]">Division</span>
                <span className="font-bold text-[#172019]">{confirmedData?.category.name}</span>
              </div>
              <div className="p-3.5 sm:p-4 flex justify-between">
                <span className="text-[#5F6B61]">Team Members</span>
                <span className="font-bold text-[#172019]">
                  {submissionResult.player_count} players{" "}
                  {submissionResult.is_complete ? (
                    <span className="text-[#205823] font-semibold">(Complete)</span>
                  ) : (
                    <span className="text-[#876a16] font-semibold">(Incomplete — Allowed)</span>
                  )}
                </span>
              </div>
              <div className="p-3.5 sm:p-4 flex justify-between">
                <span className="text-[#5F6B61]">Team Captain</span>
                <span className="font-bold text-[#172019]">{submissionResult.captain_name}</span>
              </div>
              <div className="p-3.5 sm:p-4 flex justify-between">
                <span className="text-[#5F6B61]">Registered By</span>
                <span className="font-bold text-[#172019]">{submissionResult.registrant_name}</span>
              </div>
              <div className="p-3.5 sm:p-4 flex justify-between bg-[#FAFAF8]">
                <span className="font-bold text-[#172019]">Total Registration Fee</span>
                <span className="font-black text-[#205823] text-base">
                  {formatCurrency(submissionResult.total_fee)}
                </span>
              </div>
            </div>

            {/* Next Steps Guidance */}
            <div className="p-4 rounded-lg bg-[#eef5ef] border border-[#205823]/20 text-xs sm:text-sm text-[#205823] leading-relaxed space-y-1">
              <strong className="font-bold block">What Happens Next:</strong>
              <p>
                Keep your registration code{" "}
                <strong>{submissionResult.registration_code}</strong> handy. Association officials
                will verify team details and coordinate payment verification before competition brackets are drawn.
              </p>
              {!submissionResult.is_complete && (
                <p className="text-[#876a16] font-medium pt-1">
                  Roster incomplete — {submissionResult.player_count}/{minRequiredPlayers} players. You can submit your registration now. Additional players can be added later.
                </p>
              )}
            </div>

            <div className="pt-2 flex flex-col sm:flex-row gap-3">
              <Link href="/" className="w-full sm:w-1/2">
                <Button variant="secondary" size="lg" className="w-full">
                  Return to Home
                </Button>
              </Link>
              <Button
                variant="primary"
                size="lg"
                onClick={() => {
                  setCurrentStep("division");
                  setSelectedTeamId(null);
                  setSelectedExistingTeam(null);
                  setRoster([]);
                  setNewTeamName("");
                  setSubmissionResult(null);
                }}
                className="w-full sm:w-1/2"
              >
                Register Another Team
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // 5. REVIEW STEP
  // ==========================================
  if (currentStep === "review" && confirmedData) {
    const division = getCategoryDivisionInfo(confirmedData.category.name);

    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
        {renderProgressBar()}

        <Card className="border-[#205823]/30 shadow-sm overflow-hidden">
          <div className="bg-[#205823] px-6 py-4 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">
                5
              </span>
              <h2 className="font-bold text-base sm:text-lg">Review Your Registration</h2>
            </div>
            {isRosterComplete ? (
              <Badge variant="green" size="sm" className="bg-white text-[#205823] font-bold">
                ✓ Roster complete — {currentRosterCount}/{minRequiredPlayers} players
              </Badge>
            ) : (
              <Badge variant="gold" size="sm" className="font-bold">
                ⚠️ Roster incomplete — {currentRosterCount}/{minRequiredPlayers} players
              </Badge>
            )}
          </div>

          <CardContent className="p-6 sm:p-8 space-y-6">
            <div className="text-xs sm:text-sm text-[#5F6B61]">
              Please double check all information below before submitting your registration.
            </div>

            {/* Division & League Details */}
            <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] space-y-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                Tournament & Division
              </span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-lg font-black text-[#172019]">
                    {confirmedData.category.name}
                  </h3>
                  <p className="text-xs text-[#5F6B61]">{confirmedData.league.name}</p>
                </div>
                {division && !confirmedData.category.name.toLowerCase().includes(division.label.toLowerCase()) && (
                  <Badge variant="outline" size="sm" className="bg-white text-[#5F6B61]">
                    {division.label}
                  </Badge>
                )}
              </div>
            </div>

            {/* Team & Members Summary */}
            <div className="p-4 rounded-xl border border-[#DDE3DE] space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                    Your Team
                  </span>
                  <h3 className="text-lg font-black text-[#172019]">{activeTeamName}</h3>
                </div>
                <Badge variant={teamMode === "existing" ? "outline" : "green"} size="sm">
                  {teamMode === "existing" ? "Existing Team" : "New Team"}
                </Badge>
              </div>

              {/* Members List */}
              <div className="pt-2 border-t border-[#DDE3DE] space-y-2">
                <div className="flex items-center justify-between text-xs text-[#5F6B61] font-semibold uppercase tracking-wider">
                  <span>Team Members ({currentRosterCount} players)</span>
                  <span>Position / Jersey</span>
                </div>
                <div className="divide-y divide-[#DDE3DE] max-h-48 overflow-y-auto pr-1">
                  {roster.map((player, idx) => (
                    <div
                      key={player.id}
                      className="py-2 flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#5F6B61] w-4">{idx + 1}.</span>
                        <span className="font-medium text-[#172019]">
                          {player.firstName} {player.middleName ? `${player.middleName} ` : ""}
                          {player.lastName} {player.suffix ?? ""}
                        </span>
                        {player.id === captainRosterId && (
                          <Badge variant="gold" size="sm" className="font-bold text-[10px] px-1.5 py-0.5">
                            Captain
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Key Personnel */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-4 rounded-xl border border-[#DDE3DE] bg-white space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                  Team Captain
                </span>
                <p className="text-base font-bold text-[#172019]">
                  {selectedCaptainPlayer
                    ? `${selectedCaptainPlayer.firstName} ${selectedCaptainPlayer.lastName}`
                    : "None Selected"}
                </p>
                <p className="text-xs text-[#5F6B61]">Selected from roster</p>
              </div>

              <div className="p-4 rounded-xl border border-[#DDE3DE] bg-white space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                  Registrant
                </span>
                <p className="text-base font-bold text-[#172019]">
                  {regFirstName} {regLastName}
                </p>
                <p className="text-xs text-[#5F6B61]">
                  Contact: {regContact} {regEmail ? `• ${regEmail}` : ""}
                </p>
              </div>
            </div>

            {/* Roster Status Alert */}
            {!isRosterComplete ? (
              <div className="p-4 rounded-xl bg-[#fef9e8] border border-[#F5D025]/40 text-xs sm:text-sm text-[#876a16] leading-relaxed space-y-1">
                <p className="font-bold flex items-center gap-1.5">
                  <span>⚠️</span> Roster incomplete — {currentRosterCount}/{minRequiredPlayers} players
                </p>
                <p>
                  You can submit your registration now. Additional players can be added later.
                </p>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-[#eef5ef] border border-[#205823]/20 text-xs sm:text-sm text-[#205823] flex items-center gap-2">
                <span>✓</span>
                <span className="font-bold">
                  Roster complete — {currentRosterCount}/{minRequiredPlayers} players
                </span>
              </div>
            )}

            {/* Fee Assessment Summary */}
            <div className="p-4 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE] flex items-center justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
                  Registration Fee
                </span>
                <p className="text-xs text-[#5F6B61] mt-0.5 font-mono">
                  {currentRosterCount} players × {formatCurrency(feeRate)}
                </p>
              </div>
              <p className="text-2xl sm:text-3xl font-black text-[#205823]">
                {formatCurrency(totalRegistrationFee)}
              </p>
            </div>

            {/* Error Banner */}
            {submissionError && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 font-medium">
                ⚠️ {submissionError}
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
              <Button
                variant="outline"
                size="lg"
                onClick={() => setCurrentStep("captain")}
                disabled={isSubmitting}
                className="w-full sm:w-auto"
              >
                ← Back
              </Button>
              <Button
                variant="primary"
                size="lg"
                onClick={handleSubmitRegistration}
                disabled={isSubmitting}
                className="w-full sm:w-auto min-w-[200px]"
              >
                {isSubmitting ? "Submitting Registration..." : "Submit Registration"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ==========================================
  // 4. TEAM CAPTAIN STEP
  // ==========================================
  if (currentStep === "captain" && confirmedData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
        {renderProgressBar()}

        <Card className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#DDE3DE] pb-4">
            <Badge variant="gold" size="sm" className="mb-2 font-semibold">
              Step 4 of 5
            </Badge>
            <h2 className="text-xl sm:text-2xl font-black text-[#172019]">
              Who is the team captain?
            </h2>
            <p className="text-xs sm:text-sm text-[#5F6B61] mt-1">
              Select the captain from your current team roster. The registrant is not automatically the captain.
            </p>
          </div>

          <div
            role="radiogroup"
            aria-label="Select Team Captain"
            className="space-y-2.5"
          >
            {roster.map((player) => {
              const isSelected = captainRosterId === player.id;

              return (
                <div
                  key={player.id}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onClick={() => {
                    setCaptainRosterId(player.id);
                    setCaptainError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === " " || e.key === "Enter") {
                      e.preventDefault();
                      setCaptainRosterId(player.id);
                      setCaptainError(null);
                    }
                  }}
                  className={`p-4 rounded-xl border flex items-center justify-between cursor-pointer transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#205823] ${
                    isSelected
                      ? "bg-[#eef5ef]/50 border-[#205823] shadow-xs ring-1 ring-[#205823]"
                      : "bg-white border-[#DDE3DE] hover:border-[#205823]/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? "border-[#205823] bg-[#205823] text-white"
                          : "border-[#DDE3DE] bg-white"
                      }`}
                      aria-hidden="true"
                    >
                      {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[#172019]">
                        {player.firstName} {player.middleName ? `${player.middleName} ` : ""}
                        {player.lastName} {player.suffix ?? ""}
                      </p>
                    </div>
                  </div>

                  {isSelected && (
                    <Badge variant="gold" size="sm" className="font-bold">
                      Team Captain
                    </Badge>
                  )}
                </div>
              );
            })}
          </div>

          {captainError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs sm:text-sm text-red-800 font-medium flex items-center gap-2"
            >
              <span>⚠️</span>
              <span>{captainError}</span>
            </div>
          )}

          <div className="p-3.5 rounded-lg bg-[#FAFAF8] border border-[#DDE3DE] text-xs text-[#5F6B61]">
            💡 <strong>Note:</strong> The captain must be an active playing member of the team roster.
            If you need to change your roster, you can go back to the previous step.
          </div>

          {/* Navigation Buttons */}
          <div className="pt-2 border-t border-[#DDE3DE] flex flex-col sm:flex-row items-center justify-between gap-3">
            <Button
              variant="outline"
              size="lg"
              onClick={() => setCurrentStep("registrant")}
              className="w-full sm:w-auto"
            >
              ← Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleProceedToReview}
              className="w-full sm:w-auto min-w-[180px]"
            >
              Continue to Review
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ==========================================
  // 3. YOUR INFORMATION (REGISTRANT) STEP
  // ==========================================
  if (currentStep === "registrant" && confirmedData) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-200">
        {renderProgressBar()}

        <Card className="p-6 sm:p-8 space-y-6">
          <div className="border-b border-[#DDE3DE] pb-4">
            <Badge variant="gold" size="sm" className="mb-2 font-semibold">
              Step 3 of 5
            </Badge>
            <h2 className="text-xl sm:text-2xl font-black text-[#172019]">
              Your Information
            </h2>
            <p className="text-xs sm:text-sm text-[#5F6B61] mt-1">
              Tell us who is registering this team. You can register the team even if you&apos;re not the captain.
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-[#eef5ef] border border-[#205823]/20 text-xs sm:text-sm text-[#205823] leading-relaxed flex items-start gap-2.5">
            <span className="text-base mt-0.5" aria-hidden="true">
              ℹ️
            </span>
            <div>
              <strong>Registrant vs Captain:</strong> You can register on behalf of your volleyball team as a
              team leader, coach, manager, player, or authorized representative. You will select the official
              team captain on the next step.
            </div>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleProceedToCaptain();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="First Name"
                placeholder="e.g. Pedro"
                value={regFirstName}
                onChange={(e) => setRegFirstName(e.target.value)}
                required
              />
              <Input
                label="Middle Name (Optional)"
                placeholder="e.g. Santos"
                value={regMiddleName}
                onChange={(e) => setRegMiddleName(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="sm:col-span-2">
                <Input
                  label="Last Name"
                  placeholder="e.g. Santos"
                  value={regLastName}
                  onChange={(e) => setRegLastName(e.target.value)}
                  required
                />
              </div>
              <div>
                <Input
                  label="Suffix (Optional)"
                  placeholder="e.g. Jr., III"
                  value={regSuffix}
                  onChange={(e) => setRegSuffix(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Contact / Mobile Number"
                placeholder="e.g. 09171234567"
                type="tel"
                value={regContact}
                onChange={(e) => setRegContact(e.target.value)}
                required
              />
              <Input
                label="Email Address (Optional)"
                placeholder="e.g. pedro@example.com"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
              />
            </div>

            {registrantError && (
              <p className="text-xs text-red-600 font-medium">{registrantError}</p>
            )}

            <div className="pt-4 border-t border-[#DDE3DE] flex flex-col sm:flex-row items-center justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                size="lg"
                onClick={() => setCurrentStep("team")}
                className="w-full sm:w-auto"
              >
                ← Back
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full sm:w-auto min-w-[180px]"
              >
                Continue to Captain
              </Button>
            </div>
          </form>
        </Card>
      </div>
    );
  }

  // ==========================================
  // 2. YOUR TEAM STEP
  // ==========================================
  if (currentStep === "team" && confirmedData) {
    const division = getCategoryDivisionInfo(confirmedData.category.name);

    return (
      <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-200">
        {renderProgressBar()}

        {/* Header with Selected League & Category */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#DDE3DE]">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-[#205823]">
                {confirmedData.league.name}
              </span>
              <span className="text-[#5F6B61]">•</span>
              <span className="text-xs font-bold text-[#172019]">
                {confirmedData.category.name}
              </span>
              {division && !confirmedData.category.name.toLowerCase().includes(division.label.toLowerCase()) && (
                <Badge variant="outline" size="sm">
                  {division.label}
                </Badge>
              )}
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[#172019]">
              Your Team & Team Members
            </h2>
            <p className="text-xs sm:text-sm text-[#5F6B61] mt-0.5">
              Registration rate is{" "}
              <strong className="text-[#205823]">{formatCurrency(feeRate)} per player</strong>.
              Final minimum requirement: {minRequiredPlayers} players.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentStep("division")}
            className="shrink-0 self-start sm:self-auto"
          >
            Change Division
          </Button>
        </div>

        {/* Team Mode Question Card */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-[#172019]">
              Do you already have a team?
            </h3>
            <p className="text-xs sm:text-sm text-[#5F6B61] mt-0.5">
              Choose whether to select an existing team or create a new team for this tournament.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Option A: Existing Team */}
            <div
              role="radio"
              aria-checked={teamMode === "existing"}
              tabIndex={0}
              onClick={() => {
                setTeamMode("existing");
                setRosterError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setTeamMode("existing");
                  setRosterError(null);
                }
              }}
              className={`p-4 sm:p-5 rounded-xl border cursor-pointer select-none transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#205823] ${
                teamMode === "existing"
                  ? "bg-[#eef5ef]/60 border-[#205823] ring-1 ring-[#205823] shadow-xs"
                  : "bg-white border-[#DDE3DE] hover:border-[#205823]/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    teamMode === "existing"
                      ? "border-[#205823] bg-[#205823] text-white"
                      : "border-[#DDE3DE] bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {teamMode === "existing" && <span className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-[#172019]">
                    I have an existing team
                  </h4>
                  <p className="text-xs text-[#5F6B61] mt-1 leading-relaxed">
                    Select your team and review your previous team members.
                  </p>
                </div>
              </div>
            </div>

            {/* Option B: New Team */}
            <div
              role="radio"
              aria-checked={teamMode === "new"}
              tabIndex={0}
              onClick={() => {
                setTeamMode("new");
                setSelectedTeamId(null);
                setSelectedExistingTeam(null);
                setRosterError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setTeamMode("new");
                  setSelectedTeamId(null);
                  setSelectedExistingTeam(null);
                  setRosterError(null);
                }
              }}
              className={`p-4 sm:p-5 rounded-xl border cursor-pointer select-none transition-all outline-none focus-visible:ring-2 focus-visible:ring-[#205823] ${
                teamMode === "new"
                  ? "bg-[#eef5ef]/60 border-[#205823] ring-1 ring-[#205823] shadow-xs"
                  : "bg-white border-[#DDE3DE] hover:border-[#205823]/40"
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 ${
                    teamMode === "new"
                      ? "border-[#205823] bg-[#205823] text-white"
                      : "border-[#DDE3DE] bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {teamMode === "new" && <span className="w-2 h-2 rounded-full bg-white" />}
                </div>
                <div>
                  <h4 className="text-sm sm:text-base font-bold text-[#172019]">
                    I&apos;m creating a new team
                  </h4>
                  <p className="text-xs text-[#5F6B61] mt-1 leading-relaxed">
                    Enter your team name and add your players.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Conditional Input based on Team Mode */}
          {teamMode === "new" ? (
            <div className="pt-3 border-t border-[#DDE3DE]">
              <Input
                label="What's your team name?"
                placeholder="e.g. Mahatao Spikers"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                required
              />
            </div>
          ) : (
            <div className="pt-3 border-t border-[#DDE3DE] space-y-3">
              <label className="block text-sm font-medium text-[#172019]">
                Select your existing team
              </label>

              {/* Team Filter Search */}
              <input
                type="text"
                placeholder="Search team name..."
                value={teamSearchQuery}
                onChange={(e) => setTeamSearchQuery(e.target.value)}
                className="w-full rounded-lg border border-[#DDE3DE] bg-white px-3.5 py-2 text-xs sm:text-sm text-[#172019] placeholder:text-[#5F6B61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
              />

              {isLoadingExistingTeams ? (
                <div className="text-center py-4 text-xs text-[#5F6B61]">
                  Loading existing teams...
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-52 overflow-y-auto pr-1">
                  {existingTeams
                    .filter((t) =>
                      t.team_name.toLowerCase().includes(teamSearchQuery.toLowerCase().trim())
                    )
                    .map((team) => {
                      const isSelected = selectedTeamId === team.id;
                      const isRegistered = team.is_registered_in_category;

                      return (
                        <div
                          key={team.id}
                          onClick={() => !isRegistered && handleSelectExistingTeam(team)}
                          className={`p-3 rounded-lg border text-left transition-all ${
                            isRegistered
                              ? "bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed"
                              : isSelected
                              ? "bg-[#eef5ef] border-[#205823] ring-1 ring-[#205823] cursor-pointer"
                              : "bg-white border-[#DDE3DE] hover:border-[#205823]/50 cursor-pointer"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-sm text-[#172019]">
                              {team.team_name}
                            </span>
                            {isRegistered ? (
                              <Badge variant="muted" size="sm" className="text-[10px]">
                                Already Registered
                              </Badge>
                            ) : isSelected ? (
                              <Badge variant="green" size="sm" className="text-[10px]">
                                Selected
                              </Badge>
                            ) : null}
                          </div>
                          {team.description && (
                            <p className="text-xs text-[#5F6B61] mt-0.5 line-clamp-1">
                              {team.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                </div>
              )}

              {selectedExistingTeam && (
                <div className="p-3.5 rounded-lg bg-[#eef5ef]/70 border border-[#205823]/20 flex items-start gap-2.5 text-xs text-[#205823]">
                  <span className="text-sm font-bold">✓</span>
                  <div>
                    Selected: <strong>{selectedExistingTeam.team_name}</strong>.
                    {isLoadingPreviousMembers ? (
                      <span className="block text-[#5F6B61] mt-0.5">
                        Loading past team members...
                      </span>
                    ) : previousMembersLoaded ? (
                      <span className="block mt-0.5">
                        We found your previous team members. Review and update them below.
                      </span>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Dynamic Calculation & Roster Status Card */}
        <Card className="border-[#205823]/30 shadow-xs overflow-hidden">
          <div className="bg-[#FAFAF8] p-5 sm:p-6 border-b border-[#DDE3DE] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                Current Roster
              </p>
              <p className="text-2xl sm:text-3xl font-black text-[#172019] mt-0.5">
                {currentRosterCount}{" "}
                <span className="text-sm font-normal text-[#5F6B61]">
                  {currentRosterCount === 1 ? "player" : "players"}
                </span>
              </p>
              <p className="text-xs text-[#5F6B61] mt-1">
                Final roster requirement: <strong>{minRequiredPlayers} players</strong>
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
                Roster Status
              </p>
              <div className="mt-1.5">
                {isRosterComplete ? (
                  <Badge variant="green" size="md" className="font-bold">
                    ✓ Requirement satisfied — {currentRosterCount} players
                  </Badge>
                ) : (
                  <Badge variant="gold" size="md" className="font-bold">
                    ⚠️ Roster incomplete — {currentRosterCount}/{minRequiredPlayers} players
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
                {currentRosterCount} players × {formatCurrency(feeRate)}
              </p>
            </div>
          </div>

          {/* Status Alert Note */}
          <div className="p-4 sm:p-5">
            {isRosterComplete ? (
              <div className="p-3.5 rounded-lg bg-[#eef5ef] border border-[#205823]/20 flex items-start gap-2.5">
                <span className="text-[#205823] text-lg mt-0.5" aria-hidden="true">
                  ✓
                </span>
                <div className="text-xs sm:text-sm text-[#205823] leading-relaxed">
                  <span className="font-bold">Roster complete — {currentRosterCount}/{minRequiredPlayers} players:</span> Your
                  team meets the minimum final roster requirement.
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-[#fef9e8] border border-[#F5D025]/40 flex items-start gap-2.5">
                <span className="text-[#876a16] text-lg mt-0.5" aria-hidden="true">
                  ⚠️
                </span>
                <div className="text-xs sm:text-sm text-[#876a16] leading-relaxed">
                  <span className="font-bold">
                    Roster incomplete — {currentRosterCount}/{minRequiredPlayers} players:
                  </span>{" "}
                  You can submit your registration now. Additional players can be added later.
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Add Player Form */}
        <Card className="p-5 sm:p-6 space-y-4">
          <div className="pb-3 border-b border-[#DDE3DE]">
            <h3 className="text-base font-bold text-[#172019]">Add Player</h3>
            <p className="text-xs text-[#5F6B61]">
              Enter player details to add them to your tournament roster.
            </p>
          </div>

          <form onSubmit={handleAddPlayer} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="First Name"
                placeholder="e.g. Juan"
                value={newFirstName}
                onChange={(e) => setNewFirstName(e.target.value)}
                required
              />
              <Input
                label="Middle Name (Optional)"
                placeholder="e.g. Ramos"
                value={newMiddleName}
                onChange={(e) => setNewMiddleName(e.target.value)}
              />
              <Input
                label="Last Name"
                placeholder="e.g. Dela Cruz"
                value={newLastName}
                onChange={(e) => setNewLastName(e.target.value)}
                required
              />
            </div>

            {rosterError && (
              <p className="text-xs text-red-600 font-medium">{rosterError}</p>
            )}

            <div className="flex justify-end pt-1">
              <Button type="submit" variant="primary" size="md">
                Add Player
              </Button>
            </div>
          </form>
        </Card>

        {/* Current Roster List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-[#172019]">
              Team Members ({currentRosterCount} Players)
            </h3>
            <span className="text-xs text-[#5F6B61]">
              Subtotal: {formatCurrency(totalRegistrationFee)}
            </span>
          </div>

          {roster.length === 0 ? (
            <Card className="p-8 text-center bg-[#FAFAF8] border-dashed border-[#DDE3DE]">
              <p className="text-sm text-[#5F6B61]">
                No players in roster yet. Add players using the form above.
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
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-[#172019]">
                          {player.firstName} {player.middleName ? `${player.middleName} ` : ""}
                          {player.lastName} {player.suffix ?? ""}
                        </p>
                        {player.isExisting && (
                          <Badge variant="outline" size="sm" className="text-[10px] px-1.5 py-0">
                            Previous Member
                          </Badge>
                        )}
                      </div>
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
              onClick={() => setCurrentStep("division")}
              className="w-full sm:w-auto"
            >
              Back
            </Button>
            <Button
              variant="primary"
              size="lg"
              onClick={handleProceedToRegistrant}
              disabled={roster.length === 0}
              className="w-full sm:w-auto min-w-[180px]"
            >
              Continue to Registrant Info
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // 1. CHOOSE DIVISION STEP (INITIAL)
  // ==========================================
  const selectedLeague = initialLeagues.find((l) => l.id === selectedLeagueId);

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {renderProgressBar()}

      {/* STEP A: LEAGUE SELECTION */}
      <section aria-labelledby="league-heading" className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 id="league-heading" className="text-lg sm:text-xl font-bold text-[#172019]">
              1. Choose Tournament
            </h2>
            <p className="text-xs sm:text-sm text-[#5F6B61]">
              Select the active volleyball tournament you wish to register for.
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

                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-1 transition-colors ${
                      isSelected
                        ? "border-[#205823] bg-[#205823] text-white"
                        : "border-[#DDE3DE] bg-white group-hover:border-[#205823]"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* STEP B: DIVISION / CATEGORY SELECTION */}
      <section aria-labelledby="category-heading" className="space-y-4">
        <div>
          <h2 id="category-heading" className="text-lg sm:text-xl font-bold text-[#172019]">
            2. Choose Your Division
          </h2>
          <p className="text-xs sm:text-sm text-[#5F6B61]">
            {selectedLeague
              ? `Divisions open for ${selectedLeague.name}:`
              : "Please select a tournament above to display available divisions."}
          </p>
        </div>

        {/* Loading State */}
        {isLoadingCategories && (
          <Card className="p-8 text-center bg-[#FAFAF8] border-dashed border-[#DDE3DE]">
            <div className="flex flex-col items-center justify-center gap-3 text-sm text-[#5F6B61]">
              <div
                className="w-6 h-6 border-2 border-[#205823] border-t-transparent rounded-full animate-spin"
                aria-hidden="true"
              />
              <span>Loading tournament divisions...</span>
            </div>
          </Card>
        )}

        {/* Error State */}
        {categoryError && !isLoadingCategories && (
          <Card className="p-6 bg-[#fef2f2] border-red-200 text-center">
            <p className="text-sm font-semibold text-red-800 mb-3">{categoryError}</p>
            {selectedLeagueId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleSelectLeague(selectedLeagueId)}
              >
                Retry Loading Divisions
              </Button>
            )}
          </Card>
        )}

        {/* Empty State */}
        {!isLoadingCategories && !categoryError && selectedLeagueId && categories.length === 0 && (
          <Card className="p-6 text-center bg-[#FAFAF8] border-[#DDE3DE]">
            <p className="text-sm text-[#5F6B61]">
              No divisions are currently open for registration in this tournament.
            </p>
          </Card>
        )}

        {/* Categories List */}
        {!isLoadingCategories && !categoryError && categories.length > 0 && (
          <div
            role="radiogroup"
            aria-label="Tournament Divisions"
            className="grid grid-cols-1 md:grid-cols-3 gap-4"
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
                          {division && !category.name.toLowerCase().includes(division.label.toLowerCase()) && (
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

                      <div
                        className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          isSelected
                            ? "border-[#205823] bg-[#205823] text-white"
                            : "border-[#DDE3DE] bg-white group-hover:border-[#205823]"
                        }`}
                        aria-hidden="true"
                      >
                        {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
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

                  <div className="pt-4 mt-4 border-t border-[#DDE3DE]/60">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-[#5F6B61]">Registration Rate:</span>
                      <span className="font-extrabold text-[#205823] text-sm">
                        {formatCurrency(category.registration_fee)}{" "}
                        <span className="font-normal text-xs text-[#5F6B61]">/ player</span>
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
          {selectedLeague && selectedCategoryId ? (
            <span>
              Selected: <strong className="text-[#172019]">{selectedLeague.name}</strong> • Rate:{" "}
              <strong>{formatCurrency(feeRate)} / player</strong>
            </span>
          ) : (
            <span>Select both a tournament and division to proceed</span>
          )}
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={handleConfirmDivision}
          disabled={!selectedLeagueId || !selectedCategoryId || isValidating}
          className="w-full sm:w-auto min-w-[160px]"
        >
          {isValidating ? "Validating..." : "Continue to Your Team"}
        </Button>
      </div>
    </div>
  );
};
