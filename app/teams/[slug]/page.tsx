import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicTeamBySlug } from "@/lib/public/teams";
import { TeamLogoFallback } from "@/components/public/TeamLogoFallback";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

interface TeamProfilePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: TeamProfilePageProps): Promise<Metadata> {
  const { slug } = await params;
  const team = await getPublicTeamBySlug(slug);

  if (!team) {
    return {
      title: "Team Not Found | Mahatao Volleyball Association",
    };
  }

  return {
    title: `${team.team_name} | Mahatao Volleyball Association`,
    description: `Official roster and profile for ${team.team_name} competing in ${team.category_name} - ${team.league_name}.`,
  };
}

function formatPlayerName(player: {
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
}): string {
  const parts = [
    player.first_name,
    player.middle_name ? `${player.middle_name[0]}.` : null,
    player.last_name,
    player.suffix,
  ].filter(Boolean);

  return parts.join(" ");
}

export default async function TeamProfilePage({ params }: TeamProfilePageProps) {
  const { slug } = await params;
  const team = await getPublicTeamBySlug(slug);

  if (!team) {
    notFound();
  }

  return (
    <div className="w-full min-h-[calc(100vh-5rem)] bg-[#FAFAF8] flex flex-col">
      {/* Top Navigation Bar: Back to Teams */}
      <div className="bg-white border-b border-[#DDE3DE]">
        <Container size="lg" className="py-3">
          <Link
            href="/teams"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#205823] hover:text-[#153a17] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-lg py-1 px-2 -ml-2 min-h-[44px]"
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
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            Back to All Teams
          </Link>
        </Container>
      </div>

      {/* Team Header Section */}
      <Section spacing="sm" className="bg-white border-b border-[#DDE3DE]">
        <Container size="lg">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 sm:gap-6">
            <TeamLogoFallback
              teamName={team.team_name}
              logoUrl={team.logo_url}
              size="lg"
            />

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <Badge variant="green" size="sm">
                  {team.category_name}
                </Badge>
                <Badge variant="gold" size="sm">
                  {team.league_name} {team.league_year ? `(${team.league_year})` : ""}
                </Badge>
              </div>

              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-[#172019] tracking-tight leading-tight break-words">
                {team.team_name}
              </h1>

              {team.description && (
                <p className="text-sm sm:text-base text-[#5F6B61] mt-2 max-w-2xl leading-relaxed">
                  {team.description}
                </p>
              )}

              <div className="mt-3 flex items-center gap-4 text-xs sm:text-sm text-[#5F6B61]">
                <span className="flex items-center gap-1.5 font-medium">
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
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  Official Verified Roster
                </span>
                <span>•</span>
                <span className="font-semibold text-[#172019]">
                  {team.roster_count} {team.roster_count === 1 ? "Player" : "Players"}
                </span>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Official Roster Section */}
      <Section spacing="md" className="flex-1">
        <Container size="lg">
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-2 border-b border-[#DDE3DE]">
              <div>
                <h2 className="text-lg sm:text-xl font-bold text-[#172019] tracking-tight">
                  Official Competition Roster
                </h2>
                <p className="text-xs sm:text-sm text-[#5F6B61]">
                  Authorized players registered for tournament play
                </p>
              </div>
              <span className="text-xs text-[#5F6B61]">
                Sorted by Jersey Number
              </span>
            </div>

            {team.roster.length > 0 ? (
              /* Mobile-native roster list (single-col on phone, 2-col on md+) */
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {team.roster.map((player) => {
                  const fullName = formatPlayerName(player);
                  const hasJersey = player.jersey_number !== null && player.jersey_number !== undefined;

                  return (
                    <div
                      key={player.id}
                      className="bg-white border border-[#DDE3DE] rounded-xl p-3.5 sm:p-4 flex items-center justify-between gap-3 shadow-2xs hover:border-[#205823]/40 transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {/* Jersey Number Emblem */}
                        <div
                          className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 font-black text-sm tracking-tight ${
                            hasJersey
                              ? "bg-[#eef5ef] text-[#205823] border border-[#205823]/20"
                              : "bg-[#FAFAF8] text-[#5F6B61] border border-[#DDE3DE]"
                          }`}
                          aria-label={hasJersey ? `Jersey number ${player.jersey_number}` : "No jersey assigned"}
                        >
                          {hasJersey ? (
                            <span>
                              #{String(player.jersey_number).padStart(2, "0")}
                            </span>
                          ) : (
                            <span className="text-xs text-[#5F6B61]">—</span>
                          )}
                        </div>

                        {/* Player Details: Name & Position */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-bold text-sm sm:text-base text-[#172019] leading-snug break-words">
                              {fullName}
                            </span>
                          </div>

                          {player.position && (
                            <span className="text-xs text-[#5F6B61] block mt-0.5 font-medium truncate">
                              {player.position}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Captain Badge */}
                      {player.is_captain && (
                        <div className="shrink-0">
                          <Badge variant="gold" size="sm" className="font-bold tracking-wider text-[11px]">
                            CAPTAIN
                          </Badge>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Roster Empty State */
              <div className="bg-white border border-[#DDE3DE] rounded-2xl p-8 text-center max-w-md mx-auto shadow-2xs">
                <div className="w-12 h-12 rounded-full bg-[#FAFAF8] border border-[#DDE3DE] flex items-center justify-center text-[#5F6B61] mx-auto mb-3">
                  <svg
                    className="w-6 h-6"
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
                </div>
                <h3 className="text-base font-bold text-[#172019]">
                  No Players Assigned Yet
                </h3>
                <p className="text-xs sm:text-sm text-[#5F6B61] mt-1">
                  The official roster for this team has not been finalized yet.
                </p>
              </div>
            )}
          </div>
        </Container>
      </Section>
    </div>
  );
}
