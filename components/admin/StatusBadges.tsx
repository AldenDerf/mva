import React from "react";
import { Badge } from "@/components/ui/Badge";

export function RegistrationStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED":
      return (
        <Badge variant="green" size="sm">
          Verified
        </Badge>
      );
    case "PENDING_PAYMENT":
      return (
        <Badge variant="gold" size="sm">
          Pending Payment
        </Badge>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          Rejected
        </span>
      );
    case "CANCELLED":
      return (
        <Badge variant="muted" size="sm">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="muted" size="sm">
          {status}
        </Badge>
      );
  }
}

export function PaymentStatusBadge({ status }: { status: string }) {
  switch (status) {
    case "VERIFIED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
          Verified
        </span>
      );
    case "PENDING":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
          Pending
        </span>
      );
    case "REJECTED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-200">
          Rejected
        </span>
      );
    case "REFUNDED":
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800 border border-gray-200">
          Refunded
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-neutral-100 text-neutral-600 border border-neutral-200">
          No Payment
        </span>
      );
  }
}

/**
 * Phase 05.7A: Canonical Payment Completion Badge
 *
 * Explicitly displays "Payment Complete" or "Payment Incomplete" with distinct
 * semantic icons, high-contrast accessible styling, and clear typography.
 * Never relies on color alone to communicate state.
 */
export function PaymentCompletionBadge({
  status,
  size = "sm",
}: {
  status: "COMPLETE" | "INCOMPLETE" | boolean;
  size?: "xs" | "sm";
}) {
  const isComplete = status === "COMPLETE" || status === true;
  const sizeClasses = size === "xs" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs";

  if (isComplete) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-bold bg-[#eef5ef] text-[#205823] border border-[#205823]/25 ${sizeClasses}`}
      >
        <svg
          className="w-3.5 h-3.5 text-[#205823] shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2.5}
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span>Payment Complete</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-300 ${sizeClasses}`}
    >
      <svg
        className="w-3.5 h-3.5 text-amber-700 shrink-0"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
        />
      </svg>
      <span>Payment Incomplete</span>
    </span>
  );
}
