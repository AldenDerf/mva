"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  EditPlayerModal,
  EditPlayerTarget,
} from "@/components/admin/EditPlayerModal";

interface EditPlayerButtonProps {
  player: EditPlayerTarget;
  variant?: "outline" | "ghost";
  size?: "sm" | "xs";
}

export function EditPlayerButton({
  player,
  variant = "outline",
  size = "xs",
}: EditPlayerButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = () => {
    router.refresh();
  };

  const isXs = size === "xs";

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Edit details for player ${player.firstName} ${player.lastName}`}
        className={`inline-flex items-center gap-1 font-semibold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer ${
          isXs
            ? "min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 text-xs sm:text-[11px]"
            : "min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs"
        } ${
          variant === "outline"
            ? "border border-[#DDE3DE] bg-white text-[#172019] hover:bg-[#FAFAF8] shadow-2xs"
            : "text-[#5F6B61] hover:text-[#172019] hover:bg-neutral-100"
        }`}
        title="Edit player personal or roster details"
      >
        <svg
          className={isXs ? "w-3 h-3" : "w-3.5 h-3.5"}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
          />
        </svg>
        <span>Edit</span>
      </button>

      <EditPlayerModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
        player={player}
      />
    </>
  );
}
