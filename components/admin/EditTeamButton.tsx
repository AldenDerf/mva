"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  EditTeamModal,
  EditTeamTarget,
} from "@/components/admin/EditTeamModal";

interface EditTeamButtonProps {
  team: EditTeamTarget;
}

export function EditTeamButton({ team }: EditTeamButtonProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = () => {
    router.refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label={`Edit team name for ${team.name}`}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-[#5F6B61] hover:text-[#205823] bg-white border border-[#DDE3DE] hover:border-[#205823]/40 rounded-lg transition-colors shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer"
        title="Edit team display name"
      >
        <svg
          className="w-3.5 h-3.5"
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
        <span>Edit Team</span>
      </button>

      <EditTeamModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
        team={team}
      />
    </>
  );
}
