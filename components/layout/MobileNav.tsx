"use client";

import React, { useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { Button } from "../ui/Button";

interface MobileNavProps {
  isOpen: boolean;
  onClose: () => void;
  navLinks: Array<{ label: string; href: string }>;
}

const emptySubscribe = () => () => {};

export const MobileNav: React.FC<MobileNavProps> = ({
  isOpen,
  onClose,
  navLinks,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
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
  }, [isOpen, onClose]);

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Mobile Navigation Menu"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div className="fixed inset-y-0 right-0 w-full max-w-xs bg-white bg-[#FFFFFF] shadow-2xl flex flex-col justify-between p-6 z-10 overflow-y-auto h-full min-h-screen">
        <div>
          {/* Header in Drawer */}
          <div className="flex items-center justify-between pb-6 border-b border-[#DDE3DE]">
            <BrandLogo size="sm" />
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="p-2 rounded-lg text-[#5F6B61] hover:text-[#172019] hover:bg-[#eef5ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823] transition-colors"
              aria-label="Close menu"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 flex flex-col gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={onClose}
                className="px-4 py-3 rounded-lg text-base font-semibold text-[#172019] hover:text-[#205823] hover:bg-[#eef5ef] transition-colors min-h-[44px] flex items-center"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Action button in drawer */}
        <div className="pt-6 border-t border-[#DDE3DE] flex flex-col gap-3">
          <Link href="/register" onClick={onClose}>
            <Button
              variant="primary"
              fullWidth
              size="lg"
            >
              Register Team
            </Button>
          </Link>
          <p className="text-xs text-center text-[#5F6B61]">
            Official Mahatao Volleyball Association Registration
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};
