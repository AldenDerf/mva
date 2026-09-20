"use client";

import React, { useState } from "react";

interface TeamLogoFallbackProps {
  teamName: string;
  logoUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "MV";
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

export const TeamLogoFallback: React.FC<TeamLogoFallbackProps> = ({
  teamName,
  logoUrl,
  size = "md",
  className = "",
}) => {
  const [imageError, setImageError] = useState(false);
  const initials = getInitials(teamName);

  const sizeStyles = {
    sm: "w-10 h-10 text-xs rounded-lg",
    md: "w-14 h-14 text-sm rounded-xl",
    lg: "w-20 h-20 text-xl rounded-2xl",
  };

  const iconSizes = {
    sm: "w-4 h-4",
    md: "w-6 h-6",
    lg: "w-8 h-8",
  };

  if (logoUrl && !imageError) {
    return (
      <div
        className={`relative overflow-hidden bg-white border border-[#DDE3DE] shadow-2xs flex items-center justify-center shrink-0 ${sizeStyles[size]} ${className}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt={`${teamName} official logo`}
          className="w-full h-full object-cover"
          onError={() => setImageError(true)}
          loading="lazy"
        />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-[#205823] to-[#153a17] text-[#F5D025] font-black tracking-wider flex flex-col items-center justify-center border border-[#205823]/30 shadow-2xs shrink-0 select-none ${sizeStyles[size]} ${className}`}
      aria-label={`${teamName} emblem`}
      role="img"
    >
      <span>{initials}</span>
      <div
        className="absolute -bottom-1 -right-1 opacity-20 text-white pointer-events-none"
        aria-hidden="true"
      >
        <svg
          className={iconSizes[size]}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a14.5 14.5 0 0 0 0 20M2 12h20" />
        </svg>
      </div>
    </div>
  );
};
