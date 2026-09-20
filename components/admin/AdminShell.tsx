"use client";

import React, { useState, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { AdminContext } from "@/lib/auth/admin";
import { adminLogoutAction } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";

interface AdminShellProps {
  admin: AdminContext;
  children: React.ReactNode;
}

interface NavItem {
  label: string;
  href: string;
  icon: (props: { className?: string }) => React.ReactNode;
  active: boolean;
  phaseTag?: string;
  isPlaceholder?: boolean;
}

const emptySubscribe = () => () => {};

export const AdminShell: React.FC<AdminShellProps> = ({ admin, children }) => {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Close mobile drawer on Escape key and manage body overflow
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };

    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
      window.addEventListener("keydown", handleKeyDown);
      closeButtonRef.current?.focus();
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [mobileMenuOpen]);

  const navItems: NavItem[] = [
    {
      label: "Dashboard",
      href: "/admin",
      active: pathname === "/admin",
      icon: ({ className }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
          />
        </svg>
      ),
    },
    {
      label: "Registrations",
      href: "/admin/registrations",
      active:
        pathname === "/admin/registrations" ||
        pathname.startsWith("/admin/registrations/"),
      icon: ({ className }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
          />
        </svg>
      ),
    },
    {
      label: "Payments",
      href: "/admin/payments",
      active:
        pathname === "/admin/payments" ||
        pathname.startsWith("/admin/payments/"),
      icon: ({ className }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
    {
      label: "Teams",
      href: "#",
      active: false,
      isPlaceholder: true,
      phaseTag: "Phase 05.6",
      icon: ({ className }) => (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAF8] flex flex-col lg:flex-row text-[#172019]">
      {/* ============================================================ */}
      {/* DESKTOP SIDEBAR (Static, left column) */}
      {/* ============================================================ */}
      <aside className="hidden lg:flex flex-col w-64 xl:w-72 bg-white border-r border-[#DDE3DE] fixed inset-y-0 z-30">
        {/* Brand Header */}
        <div className="h-20 flex items-center gap-3 px-6 border-b border-[#DDE3DE]">
          <Image
            src="/images/MVA Official Logo.png"
            alt="MVA Official Logo"
            width={42}
            height={42}
            className="w-10 h-auto object-contain shrink-0"
            priority
          />
          <div>
            <span className="block font-black tracking-tight text-base text-[#205823] leading-none">
              MVA ADMIN
            </span>
            <span className="text-[11px] font-semibold text-[#5F6B61] tracking-wider uppercase">
              Management Portal
            </span>
          </div>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 p-4 space-y-1.5 overflow-y-auto" aria-label="Admin Navigation">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-[#5F6B61]">
            Navigation
          </div>
          {navItems.map((item) => {
            if (item.isPlaceholder) {
              return (
                <div
                  key={item.label}
                  className="flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium text-[#5F6B61]/70 cursor-not-allowed select-none bg-transparent hover:bg-neutral-50/50 transition-colors"
                  title={`${item.label} (${item.phaseTag})`}
                >
                  <div className="flex items-center gap-3">
                    <item.icon className="w-5 h-5 text-[#5F6B61]/60 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.phaseTag && (
                    <span className="text-[10px] font-medium bg-[#FAFAF8] text-[#5F6B61] px-2 py-0.5 rounded-md border border-[#DDE3DE]">
                      Soon
                    </span>
                  )}
                </div>
              );
            }

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] ${
                  item.active
                    ? "bg-[#205823] text-white shadow-xs"
                    : "text-[#172019] hover:bg-[#eef5ef] hover:text-[#205823]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon
                    className={`w-5 h-5 shrink-0 ${
                      item.active ? "text-[#F5D025]" : "text-[#5F6B61]"
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {item.active && (
                  <span className="w-2 h-2 rounded-full bg-[#F5D025] animate-pulse" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Admin Identity & Logout Area */}
        <div className="p-4 border-t border-[#DDE3DE] bg-[#FAFAF8]/60 space-y-3">
          <div className="p-3 bg-white rounded-xl border border-[#DDE3DE] space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#172019] truncate max-w-[140px]">
                {admin.displayName}
              </span>
              <Badge variant="green" size="sm">
                {admin.role}
              </Badge>
            </div>
            {admin.email && (
              <span className="text-[11px] text-[#5F6B61] block truncate" title={admin.email}>
                {admin.email}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <form action={adminLogoutAction} className="flex-1">
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 hover:border-red-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <svg
                  className="w-4 h-4 text-red-600 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                  />
                </svg>
                <span>Sign Out</span>
              </button>
            </form>
          </div>

          <div className="pt-1 text-center">
            <Link
              href="/"
              className="text-[11px] font-medium text-[#5F6B61] hover:text-[#205823] transition-colors inline-flex items-center gap-1 focus-visible:outline-none focus-visible:underline"
            >
              <span>← Public Website</span>
            </Link>
          </div>
        </div>
      </aside>

      {/* ============================================================ */}
      {/* MAIN CONTAINER (With Topbar & Content Area) */}
      {/* ============================================================ */}
      <div className="flex-1 flex flex-col lg:pl-64 xl:pl-72 min-w-0">
        {/* Top bar */}
        <header className="sticky top-0 z-20 h-16 sm:h-20 bg-white/95 backdrop-blur-md border-b border-[#DDE3DE] px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile Brand & Hamburger Button */}
            <div className="flex items-center gap-3 lg:hidden">
              <Image
                src="/images/MVA Official Logo.png"
                alt="MVA Logo"
                width={36}
                height={36}
                className="w-9 h-auto object-contain shrink-0"
              />
              <span className="font-bold text-base text-[#205823]">MVA Admin</span>
            </div>

            {/* Desktop Section Header */}
            <div className="hidden lg:block">
              <h1 className="text-lg font-bold text-[#172019] tracking-tight">
                Operations &amp; Governance
              </h1>
              <p className="text-xs text-[#5F6B61]">
                Mahatao Volleyball Association Administrative Portal
              </p>
            </div>
          </div>

          {/* Right Header Status & Controls */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 bg-[#FAFAF8] rounded-full border border-[#DDE3DE]">
              <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
              <span className="text-xs font-medium text-[#172019]">Authorized Admin</span>
            </div>

            {/* Mobile Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-lg text-[#172019] hover:bg-[#eef5ef] hover:text-[#205823] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center border border-[#DDE3DE]"
              aria-expanded={mobileMenuOpen}
              aria-label="Open admin navigation menu"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
          </div>
        </header>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* ============================================================ */}
      {/* MOBILE PORTAL DRAWER (Directly in document.body to prevent clipping) */}
      {/* ============================================================ */}
      {mounted &&
        mobileMenuOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Admin Navigation Menu"
          >
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileMenuOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer Panel */}
            <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-2xl flex flex-col justify-between p-6 z-10 overflow-y-auto h-full min-h-screen">
              <div>
                {/* Header in Drawer */}
                <div className="flex items-center justify-between pb-5 border-b border-[#DDE3DE]">
                  <div className="flex items-center gap-3">
                    <Image
                      src="/images/MVA Official Logo.png"
                      alt="MVA Logo"
                      width={36}
                      height={36}
                      className="w-9 h-auto object-contain"
                    />
                    <div>
                      <span className="block font-black text-sm text-[#205823] leading-none">
                        MVA ADMIN
                      </span>
                      <span className="text-[10px] text-[#5F6B61] font-semibold uppercase">
                        Portal Menu
                      </span>
                    </div>
                  </div>
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-2 rounded-lg text-[#5F6B61] hover:text-[#172019] hover:bg-[#eef5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] transition-colors"
                    aria-label="Close menu"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>

                {/* Mobile Navigation Links */}
                <nav className="mt-6 flex flex-col gap-1.5" aria-label="Mobile Admin Navigation">
                  {navItems.map((item) => {
                    if (item.isPlaceholder) {
                      return (
                        <div
                          key={item.label}
                          className="flex items-center justify-between px-4 py-3 rounded-lg text-sm font-medium text-[#5F6B61]/70 cursor-not-allowed bg-neutral-50/50 border border-transparent"
                        >
                          <div className="flex items-center gap-3">
                            <item.icon className="w-5 h-5 text-[#5F6B61]/60 shrink-0" />
                            <span>{item.label}</span>
                          </div>
                          {item.phaseTag && (
                            <span className="text-[10px] bg-white text-[#5F6B61] px-2 py-0.5 rounded border border-[#DDE3DE]">
                              Soon
                            </span>
                          )}
                        </div>
                      );
                    }

                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center justify-between px-4 py-3 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
                          item.active
                            ? "bg-[#205823] text-white shadow-xs"
                            : "text-[#172019] hover:bg-[#eef5ef] hover:text-[#205823]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <item.icon
                            className={`w-5 h-5 shrink-0 ${
                              item.active ? "text-[#F5D025]" : "text-[#5F6B61]"
                            }`}
                          />
                          <span>{item.label}</span>
                        </div>
                        {item.active && (
                          <span className="w-2 h-2 rounded-full bg-[#F5D025]" />
                        )}
                      </Link>
                    );
                  })}
                </nav>
              </div>

              {/* Mobile Admin Profile & Logout Footer */}
              <div className="pt-6 border-t border-[#DDE3DE] space-y-3">
                <div className="p-3 bg-[#FAFAF8] rounded-xl border border-[#DDE3DE] space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#172019] truncate max-w-[150px]">
                      {admin.displayName}
                    </span>
                    <Badge variant="green" size="sm">
                      {admin.role}
                    </Badge>
                  </div>
                  {admin.email && (
                    <span className="text-[11px] text-[#5F6B61] block truncate">
                      {admin.email}
                    </span>
                  )}
                </div>

                <form action={adminLogoutAction}>
                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-red-700 bg-red-50/50 border border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors min-h-[44px]"
                  >
                    <svg
                      className="w-4 h-4 text-red-600 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    <span>Sign Out</span>
                  </button>
                </form>

                <div className="text-center pt-1">
                  <Link
                    href="/"
                    onClick={() => setMobileMenuOpen(false)}
                    className="text-xs font-medium text-[#5F6B61] hover:text-[#205823] transition-colors"
                  >
                    ← Back to public website
                  </Link>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
