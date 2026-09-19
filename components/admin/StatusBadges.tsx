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
