import React from "react";
import { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/AdminShell";

export const metadata: Metadata = {
  title: "Admin Portal | Mahatao Volleyball Association",
  description: "Mahatao Volleyball Association administrative management and governance.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return <AdminShell admin={admin}>{children}</AdminShell>;
}
