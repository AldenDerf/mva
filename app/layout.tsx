import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Mahatao Volleyball Association (MVA) | Official Platform",
  description:
    "Official web platform for the Mahatao Volleyball Association (MVA) — featuring league registration, team rosters, and community sports excellence in Mahatao, Batanes.",
  keywords: [
    "Mahatao Volleyball Association",
    "MVA",
    "Mahatao",
    "Batanes",
    "Volleyball",
    "Sports",
    "Tournament",
    "Team Registration",
  ],
  authors: [{ name: "Mahatao Volleyball Association" }],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#FAFAF8] text-[#172019] font-sans antialiased selection:bg-[#F5D025]/30 selection:text-[#172019]">
        {/* Accessible Skip Link for Keyboard Navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#205823] focus:text-white focus:rounded-lg focus:shadow-md focus:outline-none focus:ring-2 focus:ring-[#F5D025]"
        >
          Skip to main content
        </a>

        {/* Application Header */}
        <Header />

        {/* Main Page Content */}
        <main id="main-content" className="flex-1 flex flex-col">
          {children}
        </main>

        {/* Application Footer */}
        <Footer />
      </body>
    </html>
  );
}
