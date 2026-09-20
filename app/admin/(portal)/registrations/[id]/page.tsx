import React from "react";
import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminRegistrationById } from "@/lib/admin/registrations";
import {
  RegistrationStatusBadge,
  PaymentStatusBadge,
  PaymentCompletionBadge,
} from "@/components/admin/StatusBadges";
import { RegistrationActionControls } from "@/components/admin/RegistrationActionControls";
import { PlayerPaymentActionControls } from "@/components/admin/PlayerPaymentActionControls";
import { AddPlayerModal } from "@/components/admin/AddPlayerModal";
import { PaymentCorrectionButton } from "@/components/admin/PaymentCorrectionButton";

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

  const latestPayment = reg.payments[0];

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
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-mono font-extrabold text-sm sm:text-base px-2.5 py-0.5 rounded-lg bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
              {reg.registrationCode}
            </span>
            <RegistrationStatusBadge status={reg.status} />
            <PaymentCompletionBadge status={reg.accounting.paymentCompletionStatus} />
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172019]">
            {reg.team.name}
          </h1>

          <p className="text-xs sm:text-sm text-[#5F6B61]">
            {reg.league.name} • <span className="font-semibold text-[#172019]">{reg.category.name}</span>
          </p>
        </div>

        <div className="flex flex-col md:items-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-[#DDE3DE]">
          <div className="text-left md:text-right text-xs text-[#5F6B61]">
            <span className="block font-medium text-[#172019]">
              Submitted on {formatDate(reg.submittedAt)}
            </span>
            <span className="text-[11px] text-[#5F6B61] mt-0.5 block">
              System Record ID: {reg.id.slice(0, 8)}...
            </span>
          </div>

          {/* Registration Status Action Controls */}
          <RegistrationActionControls
            registrationId={reg.id}
            registrationCode={reg.registrationCode}
            teamName={reg.team.name}
            categoryName={reg.category.name}
            leagueName={reg.league.name}
            currentStatus={reg.status}
            playerCount={reg.playerCount}
            minPlayers={reg.category.minPlayers}
            paymentStatus={
              reg.accounting.paymentComplete
                ? "VERIFIED"
                : reg.accounting.paidPlayerCount > 0
                ? "PENDING"
                : latestPayment?.status || "NO_PAYMENT"
            }
            paymentAmount={
              reg.accounting.verifiedPaidAmount > 0
                ? reg.accounting.verifiedPaidAmount
                : latestPayment
                ? latestPayment.amount
                : 0
            }
          />
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
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="roster-heading" className="text-base font-bold text-[#172019]">
                  Tournament Roster
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Official player list submitted for this registration entry.
                </p>
              </div>
              <div className="flex items-center gap-2.5">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FAFAF8] text-[#172019] border border-[#DDE3DE]">
                  {reg.playerCount} {reg.playerCount === 1 ? "Player" : "Players"}
                </span>
                {reg.status === "VERIFIED" && (
                  <AddPlayerModal
                    registrationId={reg.id}
                    registrationCode={reg.registrationCode}
                    teamName={reg.team.name}
                  />
                )}
              </div>
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
                      <th scope="col" className="py-3 px-6">
                        Payment Status
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
                        <td className="py-3.5 px-6">
                          <PlayerPaymentActionControls
                            registrationId={reg.id}
                            registrationPlayerId={player.id}
                            paymentId={player.payment?.id}
                            playerName={player.fullName}
                            paymentStatus={player.payment ? player.payment.status : "UNPAID"}
                            amount={player.payment ? player.payment.amount : reg.category.registrationFee}
                            paymentMethod={player.payment?.paymentMethod}
                            referenceNumber={player.payment?.referenceNumber}
                            verifiedAt={player.payment?.verifiedAt}
                          />
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
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 id="payment-heading" className="text-base font-bold text-[#172019]">
                  Payment Information
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Fee assessments and verified transaction records for this team and roster.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#205823] bg-[#eef5ef] px-3 py-1 rounded-full border border-[#205823]/20">
                  Rate: {formatCurrency(reg.category.registrationFee)} / player
                </span>
              </div>
            </div>

            {/* Canonical Per-Player Payment Accounting Summary Banner */}
            <div className="p-4 sm:p-5 bg-[#FAFAF8] border-b border-[#DDE3DE] space-y-3 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div className="p-2.5 rounded-xl bg-white border border-[#DDE3DE]">
                  <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                    Expected Fees
                  </span>
                  <span className="font-mono font-bold text-[#172019] text-sm mt-0.5 block">
                    {formatCurrency(reg.accounting.expectedAmount)}
                  </span>
                  <span className="text-[10px] text-[#5F6B61] block mt-0.5">
                    {reg.accounting.rosterCount} × ₱{reg.accounting.feePerPlayer.toFixed(0)}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-[#DDE3DE]">
                  <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                    Verified Paid
                  </span>
                  <span className="font-mono font-bold text-[#205823] text-sm mt-0.5 block">
                    {formatCurrency(reg.accounting.verifiedPaidAmount)}
                  </span>
                  <span className="text-[10px] text-[#5F6B61] block mt-0.5">
                    {reg.accounting.paidPlayerCount} players verified
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-[#DDE3DE]">
                  <span className="text-[10px] uppercase font-bold text-[#5F6B61] block">
                    Balance
                  </span>
                  <span
                    className={`font-mono font-bold text-sm mt-0.5 block ${
                      reg.accounting.balance > 0
                        ? "text-amber-700"
                        : reg.accounting.balance < 0
                        ? "text-blue-700"
                        : "text-[#5F6B61]"
                    }`}
                  >
                    {formatCurrency(reg.accounting.balance)}
                  </span>
                  <span className="text-[10px] text-[#5F6B61] block mt-0.5">
                    {reg.accounting.unpaidPlayerCount} unpaid players
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-[#DDE3DE] flex flex-col justify-center items-center">
                  <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-1">
                    Completion
                  </span>
                  <PaymentCompletionBadge
                    status={reg.accounting.paymentCompletionStatus}
                    size="xs"
                  />
                </div>
              </div>

              {/* Anomaly Alerts */}
              {reg.accounting.hasFinancialAnomaly && (
                <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl space-y-1">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <span>⚠️</span>
                    <span>Financial Reconciliation Notice</span>
                  </div>
                  {reg.accounting.anomalyNotes.map((note, nIdx) => (
                    <p key={nIdx} className="text-[11px] leading-relaxed">
                      • {note}
                    </p>
                  ))}
                </div>
              )}
            </div>

            {reg.payments.length === 0 ? (
              <div className="py-10 px-6 text-center text-[#5F6B61] text-xs">
                <p>No payment record has been created for this registration.</p>
              </div>
            ) : (
              <div className="divide-y divide-[#DDE3DE]">
                {reg.payments.map((p, idx) => {
                  const associatedPlayer = reg.roster.find(
                    (r) => r.payment?.id === p.id
                  );
                  const playerName =
                    p.registrationPlayerId === null
                      ? "Legacy / Unallocated Payment"
                      : associatedPlayer?.fullName || "Roster Player";

                  return (
                    <div key={p.id} className="p-5 sm:p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#5F6B61]">
                            Payment #{idx + 1}
                          </span>
                          <PaymentStatusBadge status={p.status} />
                          {p.registrationPlayerId === null && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              Legacy / Unallocated
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-base font-extrabold text-[#172019]">
                            {formatCurrency(p.amount)}
                          </span>
                          <PaymentCorrectionButton
                            payment={{
                              id: p.id,
                              registrationId: reg.id,
                              registrationCode: reg.registrationCode,
                              teamName: reg.team.name,
                              playerName,
                              amount: p.amount,
                              status: p.status,
                              paymentMethod: p.paymentMethod,
                              referenceNumber: p.referenceNumber,
                            }}
                            size="xs"
                          />
                        </div>
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
                );
              })}
              </div>
            )}
          </section>

          {/* SECTION F: ACTIVITY & AUDIT HISTORY */}
          <section
            aria-labelledby="audit-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex items-center justify-between gap-2">
              <div>
                <h2 id="audit-heading" className="text-base font-bold text-[#172019]">
                  Administrative Audit Trail
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Chronological record of status changes and administrative actions.
                </p>
              </div>
              <span className="px-3 py-1 rounded-full text-xs font-bold bg-[#FAFAF8] text-[#172019] border border-[#DDE3DE]">
                {reg.auditHistory.length} {reg.auditHistory.length === 1 ? "Event" : "Events"}
              </span>
            </div>

            {reg.auditHistory.length === 0 ? (
              <div className="py-8 px-6 text-center text-[#5F6B61] text-xs">
                No administrative actions have been logged for this registration yet.
              </div>
            ) : (
              <div className="divide-y divide-[#DDE3DE]">
                {reg.auditHistory.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 sm:p-5 text-xs space-y-1.5 hover:bg-[#FAFAF8]/50 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold px-2 py-0.5 bg-[#FAFAF8] border border-[#DDE3DE] rounded-md text-[11px] text-[#172019]">
                          {item.action}
                        </span>
                        {item.previousStatus && item.newStatus && (
                          <span className="text-[#5F6B61]">
                            {item.previousStatus} →{" "}
                            <strong className="text-[#172019]">{item.newStatus}</strong>
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-[#5F6B61]">
                        {formatDate(item.createdAt)}
                      </span>
                    </div>

                    <div className="text-[#5F6B61] flex items-center gap-1.5 pt-0.5">
                      <span>Performed by</span>
                      <strong className="text-[#172019]">{item.adminName}</strong>
                      {item.adminEmail && (
                        <span className="text-[#5F6B61]">({item.adminEmail})</span>
                      )}
                    </div>

                    {item.reason && (
                      <div className="mt-1.5 p-2.5 bg-[#FAFAF8] border border-[#DDE3DE] rounded-lg text-[#172019]">
                        <span className="font-semibold text-[#5F6B61] block text-[10px] uppercase">
                          Reason / Notes:
                        </span>
                        <p className="mt-0.5 leading-relaxed">{item.reason}</p>
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
                <dt className="text-[#5F6B61]">Payment Status</dt>
                <dd>
                  <PaymentCompletionBadge status={reg.accounting.paymentCompletionStatus} size="xs" />
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Roster Accounting</dt>
                <dd className="font-mono text-[#172019] text-right">
                  <span className="font-bold text-[#205823]">{formatCurrency(reg.accounting.verifiedPaidAmount)}</span> / {formatCurrency(reg.accounting.expectedAmount)}
                  <span className="block text-[10px] text-[#5F6B61]">
                    ({reg.accounting.paidPlayerCount} of {reg.accounting.rosterCount} paid)
                  </span>
                </dd>
              </div>

              <div className="flex items-center justify-between">
                <dt className="text-[#5F6B61]">Remaining Balance</dt>
                <dd className="font-mono font-bold text-[#172019]">
                  <span className={reg.accounting.balance > 0 ? "text-amber-700" : "text-[#5F6B61]"}>
                    {formatCurrency(reg.accounting.balance)}
                  </span>
                </dd>
              </div>

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
                <dd className="text-[#172019] text-right">
                  <span>{reg.category.minPlayers} min – {reg.category.maxPlayers} max</span>
                  <span className="block text-[10px] text-[#5F6B61] italic">(Official rule: min 12, no max)</span>
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
