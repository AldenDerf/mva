import React from "react";
import type { Metadata } from "next";
import { getOpenLeagues, getLeagueCategories } from "@/lib/registration";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Badge } from "@/components/ui/Badge";
import { RegistrationWizard } from "./RegistrationWizard";
import type {
  SerializedOpenLeague,
  SerializedLeagueCategory,
} from "@/app/actions/registration";

export const metadata: Metadata = {
  title: "Register Team | Mahatao Volleyball Association",
  description:
    "Register your team for official Mahatao Volleyball Association leagues and tournaments.",
};

export default async function RegisterPage() {
  const leagues = await getOpenLeagues();

  const serializedLeagues: SerializedOpenLeague[] = leagues.map((league) => ({
    id: league.id,
    name: league.name,
    year: league.year,
    description: league.description,
    registration_open_at: league.registration_open_at?.toISOString() ?? null,
    registration_close_at: league.registration_close_at?.toISOString() ?? null,
    start_date: league.start_date?.toISOString() ?? null,
    end_date: league.end_date?.toISOString() ?? null,
    status: league.status,
  }));

  // If there is exactly one open league, pre-fetch its categories on the server
  let initialCategories: SerializedLeagueCategory[] = [];
  if (serializedLeagues.length === 1) {
    try {
      initialCategories = await getLeagueCategories(serializedLeagues[0].id);
    } catch (error) {
      console.error("Failed to pre-fetch categories for single league:", error);
    }
  }

  return (
    <div className="flex flex-col w-full min-h-[80vh] bg-[#FAFAF8]">
      {/* Page Header */}
      <div className="w-full bg-white border-b border-[#DDE3DE] py-8 sm:py-10">
        <Container size="lg">
          <div className="max-w-3xl mx-auto text-center">
            <Badge variant="gold" size="md" className="mb-3 font-semibold">
              Official Tournament Entry
            </Badge>
            <h1 className="text-2xl sm:text-4xl font-black text-[#172019] tracking-tight mb-2">
              Register Your Team
            </h1>
            <p className="text-sm sm:text-base text-[#5F6B61] max-w-xl mx-auto leading-relaxed">
              Complete the registration process to enter your volleyball team into
              official Mahatao Volleyball Association competitions.
            </p>
          </div>
        </Container>
      </div>

      {/* Main Registration Content */}
      <Section spacing="sm" className="flex-1">
        <Container size="lg">
          <RegistrationWizard
            initialLeagues={serializedLeagues}
            initialCategories={initialCategories}
          />
        </Container>
      </Section>
    </div>
  );
}
