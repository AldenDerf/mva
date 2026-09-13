import React from "react";
import Link from "next/link";
import { BrandLogo } from "./BrandLogo";

export const Footer: React.FC = () => {
  return (
    <footer className="bg-[#17431a] text-white border-t-4 border-[#F5D025] mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Col 1: Brand & Identity */}
          <div className="flex flex-col gap-4 lg:col-span-2">
            <BrandLogo size="lg" textColor="light" />
            <p className="text-[#eef5ef]/80 text-sm max-w-md leading-relaxed mt-2">
              The official governing body for volleyball tournaments, leagues, and
              community sports development in the Municipality of Mahatao, Batanes.
            </p>
            <div className="flex items-center gap-2 text-xs text-[#F5D025] font-medium mt-1">
              <span>Community</span>
              <span>•</span>
              <span>Competition</span>
              <span>•</span>
              <span>Sportsmanship</span>
            </div>
          </div>

          {/* Col 2: Navigation */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#F5D025] mb-4">
              Quick Navigation
            </h4>
            <ul className="space-y-2.5 text-sm">
              <li>
                <Link
                  href="/"
                  className="text-[#eef5ef]/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="#leagues"
                  className="text-[#eef5ef]/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
                >
                  Leagues
                </Link>
              </li>
              <li>
                <Link
                  href="#teams"
                  className="text-[#eef5ef]/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
                >
                  Teams
                </Link>
              </li>
              <li>
                <Link
                  href="#players"
                  className="text-[#eef5ef]/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
                >
                  Players
                </Link>
              </li>
              <li>
                <Link
                  href="#about"
                  className="text-[#eef5ef]/80 hover:text-white transition-colors focus-visible:outline-none focus-visible:underline"
                >
                  About MVA
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3: Association Information */}
          <div>
            <h4 className="text-sm font-bold uppercase tracking-wider text-[#F5D025] mb-4">
              Association
            </h4>
            <div className="space-y-3 text-sm text-[#eef5ef]/80">
              <p>
                <strong className="text-white block">Location:</strong>
                Mahatao, Batanes, Philippines
              </p>
              <p>
                <strong className="text-white block">Inquiries:</strong>
                <span>Official association contact details will be announced.</span>
              </p>
              <p className="text-xs text-[#eef5ef]/60 pt-1">
                Affiliated with local sports initiatives and youth athletic programs.
              </p>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-[#2c7830] flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#eef5ef]/70">
          <p>
            © {new Date().getFullYear()} Mahatao Volleyball Association (MVA). All
            rights reserved.
          </p>
          <p className="text-[#eef5ef]/60">
            Dedicated to the athletes and sports enthusiasts of Mahatao.
          </p>
        </div>
      </div>
    </footer>
  );
};
