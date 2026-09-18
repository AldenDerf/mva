"use client";

import React, { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { adminLoginAction } from "@/app/admin/actions";

export function LoginForm() {
  const searchParams = useSearchParams();
  const queryError = searchParams.get("error");

  const [state, formAction, isPending] = useActionState(adminLoginAction, null);

  const errorMessage =
    state?.error ||
    (queryError === "access_denied"
      ? "Access denied. You do not have administrator permissions."
      : queryError === "not_configured"
      ? "Authentication service is not yet configured."
      : null);

  return (
    <div className="w-full max-w-md bg-white rounded-2xl border border-[#DDE3DE] shadow-sm p-6 sm:p-8">
      {/* Brand Header */}
      <div className="text-center mb-8">
        <div className="inline-flex justify-center mb-4">
          <Image
            src="/images/MVA Official Logo.png"
            alt="Mahatao Volleyball Association Logo"
            width={84}
            height={84}
            className="w-20 h-auto object-contain"
            priority
          />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-[#172019]">
          MVA Administrator
        </h1>
        <p className="text-sm text-[#5F6B61] mt-1.5">
          Sign in with authorized administrator credentials.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div
          role="alert"
          className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 flex items-start gap-3"
        >
          <svg
            className="w-5 h-5 text-red-600 shrink-0 mt-0.5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <div className="flex-1 font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Form */}
      <form action={formAction} className="space-y-5">
        <div>
          <Input
            id="admin-email"
            label="Email Address"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="admin@example.com"
            required
            disabled={isPending}
          />
        </div>

        <div>
          <Input
            id="admin-password"
            label="Password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            required
            disabled={isPending}
          />
        </div>

        <div className="pt-2">
          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            disabled={isPending}
            className="font-semibold text-base"
          >
            {isPending ? (
              <span className="inline-flex items-center gap-2">
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Verifying Credentials...
              </span>
            ) : (
              "Sign In to Admin Portal"
            )}
          </Button>
        </div>
      </form>

      {/* Safe Footer Note */}
      <div className="mt-8 pt-6 border-t border-[#DDE3DE] text-center">
        <p className="text-xs text-[#5F6B61]">
          Administrative access requires active authorization.
        </p>
        <Link
          href="/"
          className="inline-block mt-3 text-xs font-medium text-[#205823] hover:underline"
        >
          ← Return to public website
        </Link>
      </div>
    </div>
  );
}
