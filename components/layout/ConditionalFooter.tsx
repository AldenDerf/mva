"use client";

import React from "react";
import { usePathname } from "next/navigation";

interface ConditionalFooterProps {
  children: React.ReactNode;
}

export const ConditionalFooter: React.FC<ConditionalFooterProps> = ({ children }) => {
  const pathname = usePathname();

  if (pathname?.startsWith("/admin")) {
    return null;
  }

  return <>{children}</>;
};
