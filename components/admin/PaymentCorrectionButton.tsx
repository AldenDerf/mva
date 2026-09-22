"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  PaymentCorrectionModal,
  PaymentCorrectionTarget,
} from "@/components/admin/PaymentCorrectionModal";

interface PaymentCorrectionButtonProps {
  payment: PaymentCorrectionTarget;
  variant?: "outline" | "ghost" | "default";
  size?: "sm" | "xs";
}

export function PaymentCorrectionButton({
  payment,
  variant = "outline",
  size = "sm",
}: PaymentCorrectionButtonProps) {
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
        aria-label={`Correct payment details for ${payment.playerName}`}
        className={`inline-flex items-center gap-1.5 font-bold rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] cursor-pointer ${
          isXs ? "min-h-[36px] sm:min-h-0 px-2.5 py-1.5 sm:py-1 text-xs sm:text-[11px]" : "min-h-[40px] sm:min-h-0 px-3 py-2 sm:py-1.5 text-xs"
        } ${
          variant === "outline"
            ? "border border-[#DDE3DE] bg-white text-[#172019] hover:bg-[#FAFAF8] shadow-2xs"
            : variant === "ghost"
            ? "text-[#5F6B61] hover:text-[#172019] hover:bg-[#FAFAF8]"
            : "bg-[#205823] text-white hover:bg-[#1b4b1e]"
        }`}
        title="Correct payment method or reference number"
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
            d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
        <span>Correct Details</span>
      </button>

      <PaymentCorrectionModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onSuccess={handleSuccess}
        payment={payment}
      />
    </>
  );
}
