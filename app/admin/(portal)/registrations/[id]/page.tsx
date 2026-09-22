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

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  GCASH: "GCash",
  BANK_TRANSFER: "Bank Transfer",
  OTHER: "Other",
};

function formatPaymentMethod(method: string): string {
  return PAYMENT_METHOD_LABELS[method] || method;
}

const AUDIT_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: "Pending Payment",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
  PENDING: "Pending",
  REFUNDED: "Refunded",
};

function formatAuditStatus(status: string): string {
  return AUDIT_STATUS_LABELS[status] || status;
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
          className="inline-flex items-center gap-2 min-h-[40px] px-2.5 py-1.5 rounded-lg text-xs font-semibold text-[#5F6B61] hover:text-[#205823] hover:bg-neutral-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
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
      {/* PAGE HEADER: TEAM IDENTITY & OPERATIONAL CONTEXT */}
      {/* ============================================================ */}
      <div className="bg-white rounded-2xl border border-[#DDE3DE] p-5 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-start justify-between gap-6">
        <div className="space-y-2">
          {/* Primary Visual Anchor: Team Name */}
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-[#172019]">
            {reg.team.name}
          </h1>

          {/* Context: Division & Tournament */}
          <p className="text-sm sm:text-base text-[#5F6B61] flex flex-wrap items-center gap-1.5">
            <span className="font-bold text-[#172019]">{reg.category.name}</span>
            <span aria-hidden="true">•</span>
            <span>{reg.league.name}</span>
          </p>

          {/* Reference code & status badges */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="font-mono font-bold text-xs sm:text-sm px-2.5 py-1 rounded-lg bg-[#205823]/10 text-[#205823] border border-[#205823]/20">
              Ref: {reg.registrationCode}
            </span>
            <RegistrationStatusBadge status={reg.status} />
            <PaymentCompletionBadge status={reg.accounting.paymentCompletionStatus} />
          </div>
        </div>

        <div className="flex flex-col md:items-end gap-3 pt-3 md:pt-0 border-t md:border-t-0 border-[#DDE3DE]">
          <div className="text-left md:text-right text-xs text-[#5F6B61] space-y-0.5">
            <span className="block font-medium text-[#172019]">
              Submitted on {formatDate(reg.submittedAt)}
            </span>
            <span className="text-[11px] text-[#5F6B61] block">
              Record ID: {reg.id.slice(0, 8)}...
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

      {/* ============================================================ */}
      {/* ATTENTION BANNER: PAYMENT NEEDS REVIEW */}
      {/* ============================================================ */}
      {(reg.accounting.hasLegacyPayments || reg.accounting.unallocatedVerifiedAmount > 0) && (
        <aside
          aria-label="Payment review required"
          className="rounded-2xl bg-amber-50/90 border border-amber-300 p-4 sm:p-5 text-amber-950 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-amber-200/80 text-amber-900 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-5 h-5 text-amber-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="space-y-1 text-xs sm:text-sm">
              <h2 className="font-bold text-amber-950 text-sm sm:text-base">
                Payment needs review
              </h2>
              <p className="text-amber-900 leading-relaxed text-xs">
                This registration has an older payment{reg.accounting.unallocatedVerifiedAmount > 0 ? ` (${formatCurrency(reg.accounting.unallocatedVerifiedAmount)})` : ""} that isn&apos;t assigned to a specific player.
                Please review the payment records below to confirm or correct details.
              </p>
            </div>
          </div>
          <a
            href="#payment-records"
            className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 transition-colors shadow-2xs shrink-0 self-start sm:self-center"
          >
            <span>Review Payments</span>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </a>
        </aside>
      )}

      {/* ============================================================ */}
      {/* FINANCIAL & PAYMENT COMPLETENESS SUMMARY */}
      {/* ============================================================ */}
      <section aria-labelledby="payment-summary-heading" className="space-y-3">
        <h2 id="payment-summary-heading" className="sr-only">
          Payment and Fee Summary
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Tile 1: Expected Fees */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] sm:text-xs uppercase font-bold text-[#5F6B61] tracking-wider block">
              Expected Fees
            </span>
            <div className="my-2">
              <span className="font-mono font-black text-lg sm:text-2xl text-[#172019] block tracking-tight break-words">
                {formatCurrency(reg.accounting.expectedAmount)}
              </span>
            </div>
            <span className="text-[11px] text-[#5F6B61] block">
              {reg.accounting.rosterCount} {reg.accounting.rosterCount === 1 ? "player" : "players"} × {formatCurrency(reg.accounting.feePerPlayer)}
            </span>
          </div>

          {/* Tile 2: Verified Paid */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] sm:text-xs uppercase font-bold text-[#5F6B61] tracking-wider block">
              Verified Paid
            </span>
            <div className="my-2">
              <span className="font-mono font-black text-lg sm:text-2xl text-[#205823] block tracking-tight break-words">
                {formatCurrency(reg.accounting.verifiedPaidAmount)}
              </span>
            </div>
            <span className="text-[11px] text-[#5F6B61] block">
              {reg.accounting.paidPlayerCount} of {reg.accounting.rosterCount} {reg.accounting.rosterCount === 1 ? "player" : "players"} paid
            </span>
          </div>

          {/* Tile 3: Remaining Balance */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] sm:text-xs uppercase font-bold text-[#5F6B61] tracking-wider block">
              Remaining Balance
            </span>
            <div className="my-2">
              <span
                className={`font-mono font-black text-lg sm:text-2xl block tracking-tight break-words ${
                  reg.accounting.balance > 0
                    ? "text-amber-800"
                    : reg.accounting.balance < 0
                    ? "text-blue-800"
                    : "text-[#205823]"
                }`}
              >
                {formatCurrency(reg.accounting.balance)}
              </span>
            </div>
            <span className="text-[11px] font-semibold block">
              {reg.accounting.balance > 0 ? (
                <span className="text-amber-800">
                  Due ({reg.accounting.unpaidPlayerCount} {reg.accounting.unpaidPlayerCount === 1 ? "player" : "players"} unpaid)
                </span>
              ) : reg.accounting.balance < 0 ? (
                <span className="text-blue-800">Credit Balance</span>
              ) : (
                <span className="text-[#205823]">Fully Settled</span>
              )}
            </span>
          </div>

          {/* Tile 4: Payment Completeness */}
          <div className="bg-white rounded-2xl border border-[#DDE3DE] p-4 sm:p-5 shadow-xs flex flex-col justify-between">
            <span className="text-[11px] sm:text-xs uppercase font-bold text-[#5F6B61] tracking-wider block">
              Payment Completeness
            </span>
            <div className="my-2">
              <PaymentCompletionBadge
                status={reg.accounting.paymentCompletionStatus}
                size="sm"
              />
            </div>
            <span className="text-[11px] text-[#5F6B61] block">
              {reg.accounting.paymentComplete
                ? "All roster fees verified"
                : `${reg.accounting.unpaidPlayerCount} ${reg.accounting.unpaidPlayerCount === 1 ? "player" : "players"} still need payment`}
            </span>
          </div>
        </div>

        {/* Anomaly Alerts if any */}
        {reg.accounting.hasFinancialAnomaly && (
          <div className="p-3.5 bg-amber-50 border border-amber-200 text-amber-950 rounded-xl space-y-1 text-xs">
            <div className="font-bold flex items-center gap-1.5 text-amber-900">
              <span aria-hidden="true">⚠️</span>
              <span>Financial Reconciliation Notice</span>
            </div>
            {reg.accounting.anomalyNotes.map((note, nIdx) => (
              <p key={nIdx} className="text-[11px] leading-relaxed text-amber-900">
                • {note}
              </p>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* ============================================================ */}
        {/* LEFT COLUMN: 2 COLS ON LG (Roster & Payment Records) */}
        {/* ============================================================ */}
        <div className="lg:col-span-2 space-y-6">
          {/* SECTION: PLAYER PAYMENT ROSTER */}
          <section
            aria-labelledby="roster-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 id="roster-heading" className="text-base font-bold text-[#172019]">
                  Tournament Roster & Player Payments
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Official player list and individual payment verification states.
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
              <>
                {/* ------------------------------------------------------------ */}
                {/* MOBILE ROSTER: RESPONSIVE CARDS (hidden on md:block) */}
                {/* ------------------------------------------------------------ */}
                <div className="md:hidden divide-y divide-[#DDE3DE]">
                  {reg.roster.map((player, idx) => {
                    const isPaid = player.payment?.status === "VERIFIED";

                    return (
                      <div
                        key={player.id}
                        className={`p-4 space-y-3 ${
                          player.isCaptain ? "bg-[#eef5ef]/30" : "hover:bg-[#FAFAF8]/60"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="w-5 text-center text-xs font-mono text-[#5F6B61]">
                              {idx + 1}.
                            </span>
                            <div>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-[#172019] text-sm">
                                  {player.fullName}
                                </span>
                                {player.isCaptain && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#205823] text-white">
                                    Captain
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2 text-xs text-[#5F6B61] mt-0.5">
                                {player.jerseyNumber !== null ? (
                                  <span className="font-mono font-bold text-[#172019]">
                                    #{player.jerseyNumber}
                                  </span>
                                ) : (
                                  <span>No Jersey #</span>
                                )}
                                <span aria-hidden="true">•</span>
                                <span>{player.position || "Position not specified"}</span>
                              </div>
                            </div>
                          </div>

                          {/* Quick Payment State Badge */}
                          <div>
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#205823]/10 text-[#205823] border border-[#205823]/25">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                                <span>Paid</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                                Unpaid
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Mobile Action Row */}
                        <div className="pt-2 border-t border-[#DDE3DE]/60 flex items-center justify-between gap-2">
                          <span className="text-[11px] text-[#5F6B61]">
                            Fee: {formatCurrency(reg.category.registrationFee)}
                          </span>
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
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ------------------------------------------------------------ */}
                {/* DESKTOP ROSTER: DENSE SCANNABLE TABLE (hidden on mobile) */}
                {/* ------------------------------------------------------------ */}
                <div className="hidden md:block overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Official tournament player roster and individual payment verification states</caption>
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
                          Payment Status & Actions
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
                          <th scope="row" className="py-3.5 px-6 font-normal text-left">
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
                          </th>
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
              </>
            )}
          </section>

          {/* SECTION: PAYMENT RECORDS */}
          <section
            id="payment-records"
            aria-labelledby="payment-heading"
            className="bg-white rounded-2xl border border-[#DDE3DE] shadow-xs overflow-hidden"
          >
            <div className="p-5 sm:p-6 border-b border-[#DDE3DE] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 id="payment-heading" className="text-base font-bold text-[#172019]">
                  Payment Transactions
                </h2>
                <p className="text-xs text-[#5F6B61] mt-0.5">
                  Detailed payment transaction records submitted for this registration.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#205823] bg-[#eef5ef] px-3 py-1 rounded-full border border-[#205823]/20">
                  Category Fee: {formatCurrency(reg.category.registrationFee)} / player
                </span>
              </div>
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
                  const isUnassigned = p.registrationPlayerId === null;
                  const playerName = isUnassigned
                    ? "Unassigned Payment"
                    : associatedPlayer?.fullName || "Roster Player";

                  return (
                    <div key={p.id} className="p-5 sm:p-6 space-y-4 hover:bg-[#FAFAF8]/40 transition-colors">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-[#5F6B61]">
                            Payment #{idx + 1}
                          </span>
                          <PaymentStatusBadge status={p.status} />
                          {isUnassigned && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-300">
                              Payment needs review
                            </span>
                          )}
                          <span className="text-xs text-[#5F6B61]">
                            • {playerName}
                          </span>
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

                      {isUnassigned && (
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3.5 text-xs text-amber-950 flex items-start gap-2.5">
                          <svg className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <div className="space-y-0.5">
                            <span className="font-bold text-amber-900 block">
                              Unassigned Payment
                            </span>
                            <p className="text-[11px] leading-relaxed text-amber-900">
                              This registration has an older payment that isn&apos;t assigned to a specific player. Use the action button to review or correct its method and reference details.
                            </p>
                          </div>
                        </div>
                      )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 text-xs pt-1">
                      <div>
                        <span className="text-[10px] uppercase font-bold text-[#5F6B61] block mb-0.5">
                          Method
                        </span>
                        <span className="font-semibold text-[#172019]">
                          {formatPaymentMethod(p.paymentMethod)}
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
                            {formatAuditStatus(item.previousStatus)} →{" "}
                            <strong className="text-[#172019]">{formatAuditStatus(item.newStatus)}</strong>
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
                <dt className="text-[#5F6B61]">Payment Completeness</dt>
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
                <dd className="font-mono font-bold text-[#172019] text-right">
                  <span className={reg.accounting.balance > 0 ? "text-amber-800" : reg.accounting.balance < 0 ? "text-blue-800" : "text-[#205823]"}>
                    {formatCurrency(reg.accounting.balance)}
                  </span>
                  <span className="block text-[10px] font-semibold">
                    {reg.accounting.balance > 0 ? (
                      <span className="text-amber-800">Due</span>
                    ) : reg.accounting.balance < 0 ? (
                      <span className="text-blue-800">Credit</span>
                    ) : (
                      <span className="text-[#205823]">Settled</span>
                    )}
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
