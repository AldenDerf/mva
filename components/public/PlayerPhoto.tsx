"use client";

import React, { useState, useEffect, useRef, useId } from "react";

export interface PlayerPhotoProps {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
  photoUrl?: string | null;
  jerseyNumber?: number | null;
  position?: string | null;
  isCaptain?: boolean;
  className?: string;
}

/**
 * Derives player initials from first and last name according to MVA domain rules.
 * Example: "Juan" + "Dela Cruz" -> "JD"
 */
export function getPlayerInitials(firstName: string, lastName: string): string {
  const first = (firstName || "").trim();
  const last = (lastName || "").trim();
  const firstInitial = first.length > 0 ? first[0].toUpperCase() : "";
  const lastInitial = last.length > 0 ? last[0].toUpperCase() : "";
  const combined = `${firstInitial}${lastInitial}`;
  return combined || "MV";
}

export function formatPlayerFullName(player: {
  firstName: string;
  middleName?: string | null;
  lastName: string;
  suffix?: string | null;
}): string {
  const parts = [
    player.firstName,
    player.middleName ? `${player.middleName[0]}.` : null,
    player.lastName,
    player.suffix,
  ].filter(Boolean);

  return parts.join(" ");
}

export const PlayerPhoto: React.FC<PlayerPhotoProps> = ({
  firstName,
  middleName,
  lastName,
  suffix,
  photoUrl,
  jerseyNumber,
  position,
  isCaptain,
  className = "",
}) => {
  const [imageError, setImageError] = useState(false);
  const [modalImageError, setModalImageError] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  const fullName = formatPlayerFullName({ firstName, middleName, lastName, suffix });
  const initials = getPlayerInitials(firstName, lastName);
  const hasValidPhoto = Boolean(photoUrl && photoUrl.trim() !== "" && !imageError);

  // Manage body scroll locking and keyboard Escape listener
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus the close button when the lightbox opens
    const timer = setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      window.removeEventListener("keydown", handleKeyDown);
      clearTimeout(timer);
    };
  }, [isOpen]);

  // Restore focus to trigger when lightbox closes
  const handleClose = () => {
    setIsOpen(false);
    // Return focus to thumbnail button where practical
    setTimeout(() => {
      triggerRef.current?.focus();
    }, 50);
  };

  const hasJersey = jerseyNumber !== null && jerseyNumber !== undefined;

  // 1. Fallback Avatar (No photo, empty string, or image failed to load)
  // Non-clickable: does NOT trigger modal because there is no photo to enlarge
  if (!hasValidPhoto) {
    return (
      <div
        className={`w-10 h-10 sm:w-11 sm:h-11 rounded-full shrink-0 bg-gradient-to-br from-[#205823] to-[#153a17] text-[#F5D025] font-black text-xs sm:text-sm tracking-wide flex items-center justify-center border border-[#205823]/30 shadow-2xs select-none ${className}`}
        role="img"
        aria-label={`Avatar for ${fullName}`}
      >
        <span>{initials}</span>
      </div>
    );
  }

  // 2. Interactive Photo Thumbnail (Valid photo present)
  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        onClick={() => setIsOpen(true)}
        className={`relative w-10 h-10 sm:w-11 sm:h-11 rounded-full overflow-hidden shrink-0 border border-[#DDE3DE] hover:border-[#205823] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] focus-visible:ring-offset-2 transition-all cursor-pointer group shadow-2xs ${className}`}
        aria-label={`View profile photo of ${fullName}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photoUrl!}
          alt={`Profile photo of ${fullName}`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
          onError={() => setImageError(true)}
          loading="lazy"
        />
        <span className="sr-only">Click or tap to view larger photo</span>
      </button>

      {/* 3. Accessible Fullscreen Lightbox Modal */}
      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4 sm:p-6"
          onClick={handleClose}
        >
          {/* Top fixed close button for easy tapping on mobile */}
          <button
            type="button"
            ref={closeButtonRef}
            onClick={handleClose}
            className="fixed top-4 right-4 z-60 w-11 h-11 rounded-full bg-black/60 hover:bg-black/80 border border-white/20 text-white flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white transition-colors cursor-pointer min-w-[44px] min-h-[44px] shadow-lg"
            aria-label="Close photo viewer"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>

          {/* Modal Content Card - click does not bubble to backdrop */}
          <div
            className="relative w-full max-w-sm sm:max-w-md md:max-w-lg flex flex-col items-center justify-center mx-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Enlarged Photo Container */}
            <div className="relative w-full overflow-hidden rounded-2xl bg-[#172019] border border-white/10 shadow-2xl flex items-center justify-center p-2 sm:p-3">
              {!modalImageError ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={photoUrl!}
                  alt={`Profile photo of ${fullName}`}
                  className="max-h-[65vh] sm:max-h-[72vh] w-auto max-w-full object-contain rounded-xl"
                  onError={() => setModalImageError(true)}
                />
              ) : (
                <div className="py-16 px-6 text-center text-white">
                  <p className="text-sm font-medium text-[#FAFAF8]/70">
                    Unable to display enlarged image.
                  </p>
                </div>
              )}
            </div>

            {/* Player Info Footer */}
            <div className="mt-3.5 text-center px-4 w-full">
              <h2
                id={titleId}
                className="text-lg sm:text-xl font-bold text-white tracking-tight break-words"
              >
                {fullName}
              </h2>

              <div className="mt-1 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm text-[#FAFAF8]/80 font-medium">
                {hasJersey && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-white/15 text-[#F5D025] font-black">
                    #{String(jerseyNumber).padStart(2, "0")}
                  </span>
                )}
                {position && <span>{position}</span>}
                {isCaptain && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-[#F5D025] text-[#172019] font-black text-[11px] tracking-wider">
                    CAPTAIN
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
