import React from "react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/admin";
import { adminLogoutAction } from "./actions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export const metadata: Metadata = {
  title: "Admin Portal | Mahatao Volleyball Association",
  description: "Mahatao Volleyball Association administrative management.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminDashboardPage() {
  const admin = await requireAdmin();

  return (
    <main className="min-h-screen bg-[#FAFAF8] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-[#DDE3DE] shadow-sm p-6 sm:p-10">
        {/* Header with MVA Logo */}
        <div className="flex items-center gap-4 pb-6 border-b border-[#DDE3DE]">
          <Image
            src="/images/MVA Official Logo.png"
            alt="MVA Official Logo"
            width={56}
            height={56}
            className="w-14 h-auto object-contain"
            priority
          />
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[#172019]">
              MVA Admin
            </h1>
            <p className="text-xs text-[#5F6B61]">
              Phase 05.2 — Authentication &amp; Authorization Verified
            </p>
          </div>
        </div>

        {/* Admin Identity Card */}
        <div className="my-8 p-5 bg-[#FAFAF8] rounded-xl border border-[#DDE3DE] space-y-3">
          <div>
            <span className="block text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
              Signed In As
            </span>
            <span className="text-base font-medium text-[#172019] block mt-0.5">
              {admin.displayName}
            </span>
            {admin.email && (
              <span className="text-xs text-[#5F6B61] block">
                {admin.email}
              </span>
            )}
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-[#DDE3DE]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
              Authorization Role
            </span>
            <Badge variant="green" size="md">
              {admin.role}
            </Badge>
          </div>

          <div className="pt-2 flex items-center justify-between border-t border-[#DDE3DE]">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#5F6B61]">
              Status
            </span>
            <Badge variant="gold" size="md">
              ACTIVE
            </Badge>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          <form action={adminLogoutAction}>
            <Button
              type="submit"
              variant="outline"
              size="md"
              fullWidth
              className="text-red-700 hover:text-red-800 hover:border-red-300 hover:bg-red-50"
            >
              Log Out
            </Button>
          </form>

          <div className="text-center pt-2">
            <Link
              href="/"
              className="text-xs text-[#5F6B61] hover:text-[#205823] transition-colors"
            >
              ← Back to public website
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
