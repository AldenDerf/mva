import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminRegistrationById } from "@/lib/admin/registrations";
import {
  RegistrationStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/StatusBadges";

interface PageProps {
  params: Promise<{
    id: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const registration = await getAdminRegistrationById(id);

  if (!registration) {
    return {
      title: "Registration Not Found | MVA Admin",
    };
  }

  return {
    title: `${registration.registrationCode} — ${registration.team.name} | MVA Admin`,
    description: `Administrative details for registration ${registration.registrationCode}.`,
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(date));
}

export default async function AdminRegistrationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const reg = await getAdminRegistrationById(id);

  if (!reg) {
    notFound();
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Back to Registrations link */}
      <div>
        <Link
          href="/admin/registrations"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#5F6B61] hover:text-[#205823] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] rounded-md px-1 py-0.5"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back to Registrations</span>
        </Link>
      </div>

      {/* ============================================================ */}
      {/* PAGE HEADER */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono font-extrabold text-sm sm:text-base px-2.5 py-0.5 rounded-lg bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
              {reg.registrationCode}
            </span>
            <RegistrationStatusBadge status={reg.status} />
            <span className="text-xs font-semibold text-[#5F6B61] bg-[#FAFAF8] px-2.5 py-0.5 rounded-md border border-[#DDE3DE]">
              Read-Only View
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172019]">
            {reg.team.name}
          </h1>

          <p className="text-xs sm:text-sm text-[#5F6B61]">
            {reg.league.name} • <span className="font-semibold text-[#172019]">{reg.category.name}</span>
          </p>
        </div>

        <div className="text-left md:text-right text-xs text-[#5F6B61] pt-3 md:pt-0 border-t md:border-t-0 border-[#DDE3DE]">
          <span className="block font-medium text-[#172019]">
            Submitted on {formatDate(reg.submittedAt)}
          </span>
          <span className="text-[11px] text-[#5F6B61] mt-0.5 block">
            System Record ID: {reg.id.slice(0, 8)}...
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================================================ */}
        {/* LEFT COLUMN: 2 COLS ON LG (Roster & Overview) */}
        {/* ============================================================ */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECTION D: PLAYER ROSTER */}
          <section
            aria-labelledby="roster-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between gap-2">
              <div>
                <h2 id="roster-heading" className="text-base font-bold text-[#172019]">
                  Tournament Roster
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Official player list submitted for this registration entry.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FAFAF8] text-[#172019] border border-[#DDE3DE]">
                {reg.playerCount} {reg.playerCount === 1 ? "Player" : "Players"}
              </span>
            </div>

            {reg.roster.length === 0 ? (
              <div className="py-12 px-6 text-center text-[#5F6B61] text-xs">
                No players registered on this roster.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[#FAFAF8] text-[#5F6B61] text-xs uppercase font-bold tracking-wider border-b border-[#DDE3DE]">
                    <tr>
                      <th scope="col" className="py-3 px-6 text-center w-12">
                        #
                      </th>
                      <th scope="col" className="py-3 px-6">
                        Player Name
                      </th>
                      <th scope="col" className="py-3 px-4 text-center">
                        Role
                      </th>
                      <th scope="col" className="py-3 px-4 text-center">
                        Jersey
                      </th>
                      <th scope="col" className="py-3 px-6">
                        Position
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#DDE3DE] text-[#172019]">
                    {reg.roster.map((player, idx) => (
                      <tr
                        key={player.id}
                        className={`hover:bg-[#FAFAF8]/80 transition-colors ${
                          player.isCaptain ? "bg-[#eef5ef]/40" : ""
                        }`}
                      >
                        <td className="py-3.5 px-6 text-center text-xs font-mono text-[#5F6B61]">
                          {idx + 1}
                        </td>
                        <td className="py-3.5 px-6">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-[#172019]">
                              {player.fullName}
                            </span>
                            {player.isCaptain && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#205823] text-white">
                                Captain
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-center text-xs">
                          {player.isCaptain ? (
                            <span className="font-semibold text-[#205823]">
                              Team Captain
                            </span>
                          ) : (
                            <span className="text-[#5F6B61]">Member</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-mono text-xs text-[#172019]">
                          {player.jerseyNumber !== null ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#FAFAF8] border border-[#DDE3DE] font-bold">
                              #{player.jerseyNumber}
                            </span>
                          ) : (
                            <span className="text-[#5F6B61]/50 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-6 text-xs">
                          {player.position ? (
                            <span className="font-medium text-[#172019]">
                              {player.position}
                            </span>
                          ) : (
                            <span className="text-[#5F6B61]/50 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECTION E: PAYMENT INFORMATION */}
          <section
            aria-labelledby="payment-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between gap-2">
              <div>
                <h2 id="payment-heading" className="text-base font-bold text-[#172019]">
                  Payment Information
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Fee assessment and transaction records for this registration.
                </p>
              </div>
              <span className="text-xs font-bold text-[#205823] bg-[#eef5ef] px-3 py-1 rounded-full border border-[#205823]/20">
                Rate: {formatCurrency(reg.category.registrationFee)} / player
              </span>
            </div>

            {reg.payments.length === 0 ? (
              <div className="py-10 px-6 text-center text-[#5F6B61] text-xs">
                <p>No payment record has been created for this registration.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#DDE3DE]">
                {reg.payments.map((p, idx) => (
                  <div key={p.id} className="p-5 sm:p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#5F6B61]">
                          Payment #{idx + 1}
                        </span>
                        <PaymentStatusBadge status={p.status} />
                      </div>
                      <span className="text-base font-extrabold text-[#172019]">
                        {formatCurrency(p.amount)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
                          Method
                        </span>
                        <span className="font-semibold text-[#172019]">
                          {p.paymentMethod}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
                          Reference Number
                        </span>
                        <span className="font-mono text-[#172019]">
                          {p.referenceNumber || "—"}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
                          Created Date
                        </span>
                        <span className="text-[#172019]">
                          {formatDate(p.createdAt)}
                        </span>
                      </div>

                      {p.verifiedAt && (
                        <div>
                          <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
                            Verified Date
                          </span>
                          <span className="text-[#172019]">
                            {formatDate(p.verifiedAt)}
                          </span>
                        </div>
                      )}

                      {p.receiptUrl && (
                        <div className="sm:col-span-2">
                          <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
                            Receipt File
                          </span>
                          <span className="text-xs text-[#205823] truncate block font-mono">
                            {p.receiptUrl}
                          </span>
                        </div>
                      )}
                    </div>

                    {p.notes && (
                      <div className="pt-2 text-xs text-[#5F6B61] border-t border-[#DDE3DE]/60">
                        <span className="font-bold text-[#172019]">Payment Notes:</span> {p.notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ============================================================ */}
        {/* RIGHT COLUMN: 1 COL ON LG (Registrant, Team & Division Info) */}
        {/* ============================================================ */}
        <div className="space-y-6">
          {/* SECTION A: REGISTRATION OVERVIEW */}
          <section
            aria-labelledby="overview-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs space-y-4"
          >
            <h2 id="overview-heading" className="text-base font-bold text-[#172019] pb-3 border-b border-[#DDE3DE]">
              Registration Overview
            </h2>

            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Registration Code</dt>
                <dd className="font-mono font-bold text-[#205823]">
                  {reg.registrationCode}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Status</dt>
                <dd>
                  <RegistrationStatusBadge status={reg.status} />
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Submitted Date</dt>
                <dd className="font-medium text-[#172019]">
                  {formatDate(reg.submittedAt)}
                </dd>
              </div>

              {reg.verifiedAt && (
                <div className="flex items-center justify-between">
                  <dt className="text-[#5F6B61]">Verified Date</dt>
                  <dd className="font-medium text-[#172019]">
                    {formatDate(reg.verifiedAt)}
                  </dd>
                </div>
              )}

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Tournament League</dt>
                <dd className="font-semibold text-[#172019]">
                  {reg.league.name}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Category / Division</dt>
                <dd className="font-semibold text-[#172019]">
                  {reg.category.name}
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Category Roster Limits</dt>
                <dd className="text-[#172019]">
                  {reg.category.minPlayers} min – {reg.category.maxPlayers} max
                </dd>
              </div>
            </dl>

            {reg.notes && (
              <div className="pt-3 border-t border-[#DDE3DE] text-xs">
                <span className="font-bold text-[#172019] block mb-1">Registration Notes:</span>
                <p className="text-[#5F6B61] leading-relaxed bg-[#FAFAF8] p-2.5 rounded-lg border border-[#DDE3DE]">
                  {reg.notes}
                </p>
              </div>
            )}
          </section>

          {/* SECTION B: TEAM INFORMATION */}
          <section
            aria-labelledby="team-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs space-y-4"
          >
            <h2 id="team-heading" className="text-base font-bold text-[#172019] pb-3 border-b border-[#DDE3DE]">
              Team Information
            </h2>

            <dl className="space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Team Name</dt>
                <dd className="font-bold text-[#172019] text-sm">{reg.team.name}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Slug</dt>
                <dd className="font-mono text-[#5F6B61]">{reg.team.slug}</dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Current Roster Count</dt>
                <dd className="font-semibold text-[#172019]">
                  {reg.playerCount} {reg.playerCount === 1 ? "player" : "players"}
                </dd>
              </div>
            </dl>
          </section>

          {/* SECTION C: REGISTRANT INFORMATION */}
          <section
            aria-labelledby="registrant-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs space-y-4"
          >
            <h2 id="registrant-heading" className="text-base font-bold text-[#172019] pb-3 border-b border-[#DDE3DE]">
              Registrant Information
            </h2>
            <p className="text-xs text-[#5F6B61]">
              Authorized team representative who submitted this registration.
            </p>

            <dl className="space-y-3 text-xs pt-1">
              <div>
                <dt className="text-[10px] uppercase font-bold text-[#5F6B61] mb-0.5">
                  Full Name
                </dt>
                <dd className="font-bold text-[#172019] text-sm">
                  {reg.registrant.fullName}
                </dd>
              </div>

              <div>
                <dt className="text-[10px] uppercase font-bold text-[#5F6B61] mb-0.5">
                  Contact Number
                </dt>
                <dd className="font-mono text-[#172019]">
                  {reg.registrant.contactNumber}
                </dd>
              </div>

              <div>
                <dt className="text-[10px] uppercase font-bold text-[#5F6B61] mb-0.5">
                  Email Address
                </dt>
                <dd className="text-[#172019]">
                  {reg.registrant.email ? (
                    <a
                      href={`mailto:${reg.registrant.email}`}
                      className="text-[#205823] hover:underline"
                    >
                      {reg.registrant.email}
                    </a>
                  ) : (
                    <span className="text-[#5F6B61]/50 italic">Not provided</span>
                  )}
                </dd>
              </div>
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
