import React, { Suspense } from "react";
import { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Admin Login | Mahatao Volleyball Association",
  description: "Secure administrator sign in for Mahatao Volleyball Association operations.",
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLoginPage() {
  return (
    <main className="min-h-screen bg-[#FAFAF8] flex flex-col justify-center items-center px-4 py-12 sm:px-6 lg:px-8">
      <Suspense
        fallback={
          <div className="w-full max-w-md bg-white rounded-2xl border border-[#DDE3DE] shadow-sm p-8 text-center text-sm text-[#5F6B61]">
            Loading login portal...
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
