import React from "react";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

export default function Home() {
  return (
    <div className="flex flex-col w-full">
      {/* Hero Section */}
      <Section
        spacing="lg"
        className="bg-gradient-to-b from-white via-[#FAFAF8] to-[#f4f7f4] border-b border-[#DDE3DE]"
      >
        <Container size="lg">
          <div className="max-w-3xl mx-auto text-center flex flex-col items-center">
            <Badge variant="gold" size="md" className="mb-6 font-semibold">
              Municipality of Mahatao, Batanes
            </Badge>

            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-[#172019] tracking-tight leading-[1.1] mb-6">
              Mahatao Volleyball{" "}
              <span className="text-[#205823] underline decoration-[#F5D025] decoration-4 underline-offset-8">
                Association
              </span>
            </h1>

            <p className="text-base sm:text-xl text-[#5F6B61] leading-relaxed mb-8 max-w-2xl font-normal">
              Fostering community sportsmanship, athletic discipline, and premier
              volleyball competition across the island of Batanes.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3.5 sm:gap-4 w-full sm:w-auto">
              <a href="#showcase">
                <Button variant="primary" size="lg">
                  Explore Design System
                </Button>
              </a>
              <a href="#pillars">
                <Button variant="secondary" size="lg">
                  Association Pillars
                </Button>
              </a>
            </div>

            <p className="text-xs text-[#5F6B61] mt-5 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-[#205823]" />
              Official Web Platform & Design System Foundation
            </p>
          </div>
        </Container>
      </Section>

      {/* Pillars Section */}
      <Section id="pillars" spacing="md" className="border-b border-[#DDE3DE]">
        <Container size="lg">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <Badge variant="green" size="sm" className="mb-3">
              MVA Core Values
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#172019] tracking-tight">
              Built on Community and Excellence
            </h2>
            <p className="text-[#5F6B61] text-sm sm:text-base mt-2">
              The foundational pillars guiding the Mahatao Volleyball Association
              across every tournament and initiative.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="hover:border-[#205823]/40 transition-colors">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-[#eef5ef] text-[#205823] flex items-center justify-center font-bold text-lg mb-3">
                  01
                </div>
                <CardTitle>Community Unity</CardTitle>
                <CardDescription>
                  Uniting athletes, families, and barangays through volleyball
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#5F6B61] leading-relaxed">
                  Serving as an inclusive sporting platform where camaraderie,
                  local pride, and community connection thrive both on and off
                  the court.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:border-[#205823]/40 transition-colors">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-[#fef9e8] text-[#876a16] flex items-center justify-center font-bold text-lg mb-3">
                  02
                </div>
                <CardTitle>Athletic Discipline</CardTitle>
                <CardDescription>
                  Promoting sportsmanship, respect, and competition
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#5F6B61] leading-relaxed">
                  Upholding tournament standards, transparent governance, and
                  respect among competing teams, coaches, and match officials.
                </p>
              </CardContent>
            </Card>

            <Card className="hover:border-[#205823]/40 transition-colors">
              <CardHeader>
                <div className="w-10 h-10 rounded-lg bg-[#eef5ef] text-[#205823] flex items-center justify-center font-bold text-lg mb-3">
                  03
                </div>
                <CardTitle>Youth Development</CardTitle>
                <CardDescription>
                  Empowering the next generation of Mahatao athletes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-[#5F6B61] leading-relaxed">
                  Inspiring young players to discover teamwork, perseverance,
                  and healthy athletic lifestyles through grassroots sports
                  development.
                </p>
              </CardContent>
            </Card>
          </div>
        </Container>
      </Section>

      {/* Design System & Component Showcase */}
      <Section
        id="showcase"
        spacing="md"
        className="bg-white border-b border-[#DDE3DE]"
      >
        <Container size="lg">
          <div className="max-w-2xl mx-auto text-center mb-14">
            <Badge variant="gold" size="sm" className="mb-3">
              Design System Showcase
            </Badge>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#172019] tracking-tight">
              Reusable UI Foundation Components
            </h2>
            <p className="text-[#5F6B61] text-sm sm:text-base mt-2">
              Demonstrating the typography, color palette tokens, accessible
              buttons, badges, inputs, and container components for future MVA
              modules.
            </p>
          </div>

          <div className="space-y-12">
            {/* 1. Typography Hierarchy */}
            <div className="p-6 sm:p-8 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE]">
              <div className="mb-6 pb-4 border-b border-[#DDE3DE]">
                <h3 className="text-base font-bold text-[#205823] uppercase tracking-wider">
                  1. Typography Hierarchy (Inter)
                </h3>
                <p className="text-xs text-[#5F6B61] mt-1">
                  Clean sans-serif scale optimized for readability and WCAG 2.2 AA
                  contrast.
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="text-xs text-[#5F6B61] block mb-1 font-mono">
                    H1 Display (text-3xl / sm:text-4xl, font-black)
                  </span>
                  <div className="text-2xl sm:text-4xl font-black text-[#172019] tracking-tight">
                    Mahatao Volleyball Championship
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#5F6B61] block mb-1 font-mono">
                    H2 Section Heading (text-xl / sm:text-2xl, font-bold)
                  </span>
                  <div className="text-xl sm:text-2xl font-bold text-[#172019] tracking-tight">
                    Registered Teams & League Categories
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#5F6B61] block mb-1 font-mono">
                    H3 Card Title (text-lg, font-semibold)
                  </span>
                  <div className="text-lg font-semibold text-[#172019]">
                    Men&apos;s Open Division Roster
                  </div>
                </div>

                <div>
                  <span className="text-xs text-[#5F6B61] block mb-1 font-mono">
                    Body Text (text-base / text-sm, text-[#172019])
                  </span>
                  <p className="text-sm sm:text-base text-[#172019] leading-relaxed max-w-2xl">
                    Official tournament announcements, schedule advisories, and team
                    guidelines are published by the Mahatao Volleyball
                    Association secretariat.
                  </p>
                </div>

                <div>
                  <span className="text-xs text-[#5F6B61] block mb-1 font-mono">
                    Muted Text (text-sm, text-[#5F6B61])
                  </span>
                  <p className="text-sm text-[#5F6B61]">
                    Official tournament roster • Minimum 12 players per team entry.
                  </p>
                </div>
              </div>
            </div>

            {/* 2. Button Variants & Sizes */}
            <div className="p-6 sm:p-8 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE]">
              <div className="mb-6 pb-4 border-b border-[#DDE3DE]">
                <h3 className="text-base font-bold text-[#205823] uppercase tracking-wider">
                  2. Button System
                </h3>
                <p className="text-xs text-[#5F6B61] mt-1">
                  Accessible, keyboard-navigable interactive buttons with visible
                  focus rings and touch-friendly targets.
                </p>
              </div>

              <div className="space-y-6">
                <div>
                  <span className="text-xs font-semibold text-[#5F6B61] uppercase tracking-wider block mb-3">
                    Variants
                  </span>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button variant="primary">Primary Green</Button>
                    <Button variant="secondary">Secondary Outline</Button>
                    <Button variant="gold">Gold Accent</Button>
                    <Button variant="outline">Neutral Outline</Button>
                    <Button variant="ghost">Ghost Action</Button>
                    <Button variant="primary" disabled>
                      Disabled State
                    </Button>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-semibold text-[#5F6B61] uppercase tracking-wider block mb-3">
                    Sizes
                  </span>
                  <div className="flex flex-wrap gap-3 items-center">
                    <Button variant="primary" size="sm">
                      Small (36px)
                    </Button>
                    <Button variant="primary" size="md">
                      Medium (42px)
                    </Button>
                    <Button variant="primary" size="lg">
                      Large (48px)
                    </Button>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Badges & Indicators */}
            <div className="p-6 sm:p-8 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE]">
              <div className="mb-6 pb-4 border-b border-[#DDE3DE]">
                <h3 className="text-base font-bold text-[#205823] uppercase tracking-wider">
                  3. Badges &amp; Status Indicators
                </h3>
                <p className="text-xs text-[#5F6B61] mt-1">
                  Tokens for category labels, statuses, and division tags.
                </p>
              </div>

              <div className="flex flex-wrap gap-3 items-center">
                <Badge variant="green">Open for Registration</Badge>
                <Badge variant="gold">Mahatao Only Division</Badge>
                <Badge variant="outline">Team Captain</Badge>
                <Badge variant="muted">Pending Verification</Badge>
                <Badge variant="green" size="sm">
                  Small Tag
                </Badge>
                <Badge variant="gold" size="sm">
                  Official
                </Badge>
              </div>
            </div>

            {/* 4. Form Input Controls */}
            <div className="p-6 sm:p-8 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE]">
              <div className="mb-6 pb-4 border-b border-[#DDE3DE]">
                <h3 className="text-base font-bold text-[#205823] uppercase tracking-wider">
                  4. Form Inputs
                </h3>
                <p className="text-xs text-[#5F6B61] mt-1">
                  Accessible form controls with distinct focus states, helpers, and
                  error indicators.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl">
                <Input
                  label="Team Name"
                  placeholder="e.g. Mahatao Spikers"
                  helperText="Official team name for tournament roster"
                />
                <Input
                  label="Registrant Contact"
                  placeholder="09XX-XXX-XXXX"
                  defaultValue="0917-123-4567"
                  helperText="Active phone number for verification"
                />
                <Input
                  label="Jersey Number"
                  placeholder="1 - 99"
                  error="Jersey number already taken"
                  defaultValue="10"
                />
              </div>
            </div>

            {/* 5. Card Component Demonstration */}
            <div className="p-6 sm:p-8 rounded-xl bg-[#FAFAF8] border border-[#DDE3DE]">
              <div className="mb-6 pb-4 border-b border-[#DDE3DE]">
                <h3 className="text-base font-bold text-[#205823] uppercase tracking-wider">
                  5. Card Component Structure
                </h3>
                <p className="text-xs text-[#5F6B61] mt-1">
                  Structured content cards with header, body, and action footer.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant="green" size="sm">
                        Division
                      </Badge>
                      <span className="text-xs text-[#5F6B61]">Official Roster</span>
                    </div>
                    <CardTitle className="mt-2">Men&apos;s Open Division</CardTitle>
                    <CardDescription>
                      Open category for participating volleyball teams
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-[#5F6B61]">
                      Standard competition rules, certified referees, and single
                      elimination tournament format.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <span className="text-xs font-medium text-[#205823]">
                      Category details
                    </span>
                    <Button variant="secondary" size="sm">
                      View Details
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <Badge variant="gold" size="sm">
                        Local Division
                      </Badge>
                      <span className="text-xs text-[#5F6B61]">Official Roster</span>
                    </div>
                    <CardTitle className="mt-2">Mahatao Residency League</CardTitle>
                    <CardDescription>
                      Exclusive tournament for Mahatao resident athletes
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-[#5F6B61]">
                      Designed to showcase homegrown sports talent across all
                      participating local barangays.
                    </p>
                  </CardContent>
                  <CardFooter>
                    <span className="text-xs font-medium text-[#205823]">
                      Category details
                    </span>
                    <Button variant="secondary" size="sm">
                      View Details
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            </div>
          </div>
        </Container>
      </Section>

      {/* Active Tournament Registration Banner */}
      <Section spacing="sm" className="bg-[#FAFAF8]">
        <Container size="md">
          <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#205823]/20 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-6 text-center sm:text-left">
            <div>
              <Badge variant="green" size="sm" className="mb-2">
                Official Tournament
              </Badge>
              <h3 className="text-lg sm:text-xl font-bold text-[#172019]">
                Team Registration is Open
              </h3>
              <p className="text-sm text-[#5F6B61] mt-1 max-w-md">
                Register your team for upcoming MVA tournaments with official roster submission.
              </p>
            </div>
            <Link href="/register">
              <Button variant="primary" size="lg">
                Register Team
              </Button>
            </Link>
          </div>
        </Container>
      </Section>
    </div>
  );
}
