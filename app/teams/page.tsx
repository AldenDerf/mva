import React from "react";
import type { Metadata } from "next";
import { getPublicTeams } from "@/lib/public/teams";
import { TeamsDirectory } from "@/components/public/TeamsDirectory";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Participating Teams | Mahatao Volleyball Association",
  description:
    "Official directory of participating teams and verified rosters for the Mahatao Volleyball Association tournaments.",
};

export default async function TeamsPage() {
  const { teams, categories } = await getPublicTeams();

  return (
    <div className="w-full min-h-[calc(100vh-5rem)] bg-[#FAFAF8] flex flex-col">
      {/* Compact Page Header */}
      <Section spacing="sm" className="bg-white border-b border-[#DDE3DE]">
        <Container size="lg">
          <div className="flex flex-col items-start max-w-3xl">
            <Badge variant="gold" size="sm" className="mb-2.5 font-semibold">
              MVA Tournament Directory
            </Badge>
            <h1 className="text-2xl sm:text-4xl font-black text-[#172019] tracking-tight leading-tight">
              Official Teams
            </h1>
            <p className="text-sm sm:text-base text-[#5F6B61] mt-1.5 leading-relaxed">
              Explore official participating teams and browse certified competition rosters.
            </p>
          </div>
        </Container>
      </Section>

      {/* Main Directory Body */}
      <Section spacing="md" className="flex-1">
        <Container size="lg">
          <TeamsDirectory teams={teams} categories={categories} />
        </Container>
      </Section>
    </div>
  );
}
