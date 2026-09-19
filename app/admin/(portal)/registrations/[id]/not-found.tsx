import React from "react";
import Link from "next/link";

export default function RegistrationNotFound() {
  return (
    <div className="py-16 px-6 max-w-lg mx-auto text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 mx-auto mb-4">
        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
      </div>

      <h1 className="text-xl font-bold text-[#172019]">Registration Not Found</h1>
      <p className="text-sm text-[#5F6B61] mt-2 leading-relaxed">
        The requested registration record does not exist or the identifier provided is invalid.
      </p>

      <div className="mt-6">
        <Link
          href="/admin/registrations"
          className="inline-flex items-center px-4 py-2.5 rounded-xl text-xs font-bold text-white bg-[#205823] hover:bg-[#18441a] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#205823]"
        >
          ← Return to Registrations
        </Link>
      </div>
    </div>
  );
}
