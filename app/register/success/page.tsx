import React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { getRegistrationByReference } from "@/lib/registration";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { RegistrationSuccessCard } from "./RegistrationSuccessCard";
import type { SerializedRegistrationSummary } from "@/app/actions/registration";

export const metadata: Metadata = {
  title: "Registration Success | Mahatao Volleyball Association",
  description:
    "Official registration reference and confirmation for Mahatao Volleyball Association competitions.",
};

interface RegistrationSuccessPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function RegistrationSuccessPage({
  searchParams,
}: RegistrationSuccessPageProps) {
  const resolvedParams = await searchParams;
  const refParam = resolvedParams?.ref;
  const ref = typeof refParam === "string" ? refParam.trim() : null;

  const registrationData = ref ? await getRegistrationByReference(ref) : null;

  return (
    <div className="flex flex-col w-full min-h-[85vh] bg-[#FAFAF8]">
      <Section spacing="md" className="flex-1 flex items-center justify-center">
        <Container size="md">
          {registrationData ? (
            <RegistrationSuccessCard
              registration={{
                ...registrationData,
                submitted_at: registrationData.submitted_at?.toISOString() ?? null,
              } satisfies SerializedRegistrationSummary}
            />
          ) : (
            <div className="w-full max-w-lg mx-auto animate-in fade-in">
              <Card className="border-[#DDE3DE] shadow-sm text-center p-6 sm:p-10">
                <CardContent className="space-y-5 p-0">
                  <div className="w-14 h-14 rounded-full bg-[#fef2f2] text-red-700 mx-auto flex items-center justify-center text-2xl font-bold">
                    <svg
                      className="w-7 h-7"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                  </div>

                  <Badge variant="muted" size="md">
                    Reference Error
                  </Badge>

                  <h1 className="text-xl sm:text-2xl font-black text-[#172019]">
                    Registration Reference Not Found
                  </h1>

                  <p className="text-xs sm:text-sm text-[#5F6B61] leading-relaxed max-w-sm mx-auto">
                    {ref
                      ? `We could not find an active registration record matching "${ref}". Please ensure the reference code is entered correctly.`
                      : "No registration reference code was provided in the link. Please verify your confirmation URL."}
                  </p>

                  <div className="pt-2 flex flex-col sm:flex-row gap-3 justify-center">
                    <Link href="/register" className="w-full sm:w-auto">
                      <Button variant="primary" size="md" className="w-full">
                        Back to Registration
                      </Button>
                    </Link>
                    <Link href="/" className="w-full sm:w-auto">
                      <Button variant="outline" size="md" className="w-full">
                        Return to Home
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </Container>
      </Section>
    </div>
  );
}
