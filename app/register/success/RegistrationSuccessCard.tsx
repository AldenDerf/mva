"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card, CardContent } from "@/components/ui/Card";
import {
  downloadReferenceImage,
  type ReferenceImageData,
} from "./downloadReferenceImage";
import type { SerializedRegistrationSummary } from "@/app/actions/registration";

interface RegistrationSuccessCardProps {
  registration: SerializedRegistrationSummary;
}

export const RegistrationSuccessCard: React.FC<RegistrationSuccessCardProps> = ({
  registration,
}) => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadSuccess(false);

    try {
      const imgData: ReferenceImageData = {
        registrationCode: registration.registration_code,
        teamName: registration.team_name,
        categoryName: registration.category_name,
        leagueName: registration.league_name,
        status: registration.status,
        submittedAt: registration.submitted_at,
      };

      await downloadReferenceImage(imgData);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 4000);
    } catch (err) {
      console.error("Failed to generate reference image:", err);
      setDownloadError(
        "Could not generate the reference image. Please try again or take a screenshot of this page."
      );
    } finally {
      setIsDownloading(false);
    }
  };

  const formattedDate = registration.submitted_at
    ? new Date(registration.submitted_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <Card className="border-[#205823]/30 shadow-lg overflow-hidden bg-white">
        {/* Header Banner */}
        <div className="bg-[#205823] text-white p-6 sm:p-8 text-center space-y-2">
          <div className="w-14 h-14 rounded-full bg-white/15 border border-white/20 flex items-center justify-center mx-auto mb-2 text-2xl font-bold shadow-inner">
            <svg
              className="w-8 h-8 text-[#F5D025]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>

          <p className="text-xs sm:text-sm font-semibold tracking-wider uppercase text-[#F5D025]">
            {registration.league_name}
          </p>

          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Registration Submitted Successfully!
          </h1>

          <p className="text-xs sm:text-sm text-white/85 max-w-md mx-auto pt-1">
            Your volleyball team registration has been recorded with official MVA reference.
          </p>
        </div>

        <CardContent className="p-6 sm:p-8 space-y-6">
          {/* Official Registration Reference Spotlight */}
          <div className="text-center p-6 rounded-2xl bg-[#FAFAF8] border border-[#205823]/20 shadow-xs space-y-2">
            <span className="text-xs font-bold uppercase tracking-wider text-[#5F6B61]">
              Registration Reference
            </span>
            <div className="pt-1">
              <p className="text-3xl sm:text-4xl font-black text-[#205823] font-mono tracking-widest select-all">
                {registration.registration_code}
              </p>
            </div>
            <div className="flex justify-center pt-2">
              <Badge variant="gold" size="md">
                Status: PENDING PAYMENT
              </Badge>
            </div>
          </div>

          {/* Details Overview */}
          <div className="divide-y divide-[#DDE3DE] border border-[#DDE3DE] rounded-xl overflow-hidden bg-white text-sm">
            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs sm:text-sm font-medium text-[#5F6B61] uppercase tracking-wide">
                Team
              </span>
              <span className="text-base sm:text-lg font-bold text-[#172019]">
                {registration.team_name}
              </span>
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs sm:text-sm font-medium text-[#5F6B61] uppercase tracking-wide">
                Division
              </span>
              <span className="text-sm sm:text-base font-bold text-[#172019]">
                {registration.category_name}
              </span>
            </div>

            <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs sm:text-sm font-medium text-[#5F6B61] uppercase tracking-wide">
                Registration Reference
              </span>
              <span className="text-sm sm:text-base font-bold font-mono text-[#205823]">
                {registration.registration_code}
              </span>
            </div>

            {formattedDate && (
              <div className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-1 bg-[#FAFAF8]/50">
                <span className="text-xs sm:text-sm font-medium text-[#5F6B61] uppercase tracking-wide">
                  Date Submitted
                </span>
                <span className="text-xs sm:text-sm font-medium text-[#172019]">
                  {formattedDate}
                </span>
              </div>
            )}
          </div>

          {/* Required Instruction Notice */}
          <div className="p-4 sm:p-5 rounded-xl bg-[#eef5ef] border border-[#205823]/25 text-xs sm:text-sm text-[#172019] space-y-1.5">
            <div className="flex items-center gap-2 text-[#205823] font-bold">
              <svg
                className="w-4 h-4 shrink-0 text-[#205823]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>Important Record Reminder</span>
            </div>
            <p className="text-[#205823] font-medium leading-relaxed">
              Please save this reference for your records. You may need it for future MVA inquiries or roster requests.
            </p>
          </div>

          {/* Download Feedback Messages */}
          {downloadSuccess && (
            <div
              role="status"
              className="p-3.5 rounded-lg bg-[#f0fdf4] border border-green-300 text-xs sm:text-sm text-green-800 font-medium flex items-center gap-2 animate-in fade-in"
            >
              <span>✓</span>
              <span>Reference image downloaded successfully! Saved to your device.</span>
            </div>
          )}

          {downloadError && (
            <div
              role="alert"
              className="p-3.5 rounded-lg bg-[#fef2f2] border border-red-200 text-xs sm:text-sm text-red-800 font-medium flex items-center gap-2 animate-in fade-in"
            >
              <span>⚠️</span>
              <span>{downloadError}</span>
            </div>
          )}

          {/* Actions: Primary and Secondary */}
          <div className="pt-2 flex flex-col sm:flex-row gap-3">
            <Button
              variant="primary"
              size="lg"
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full sm:w-1/2 flex items-center justify-center gap-2 shadow-sm"
            >
              {isDownloading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Generating Image...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
                  <span>Download Reference Image</span>
                </>
              )}
            </Button>

            <Link href="/register" className="w-full sm:w-1/2">
              <Button
                variant="outline"
                size="lg"
                className="w-full border-[#DDE3DE] text-[#172019] hover:bg-[#FAFAF8]"
              >
                Register Another Team
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
