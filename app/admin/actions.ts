"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyAdminAuthorization } from "@/lib/auth/admin";

export interface ActionResult {
  success: boolean;
  error?: string;
}

/**
 * Server Action for administrator login with two-phase verification:
 * 1. Supabase Auth authentication (email/password)
 * 2. Database authorization (profiles -> admin_access role = 'ADMIN' and is_active = true)
 * 
 * If the user is authenticated in Supabase but unauthorized in MVA, their session
 * is immediately invalidated and a safe generic error is returned.
 */
export async function adminLoginAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (!email || typeof email !== "string" || !password || typeof password !== "string") {
    return {
      success: false,
      error: "Please provide both email and password.",
    };
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return {
      success: false,
      error: "Authentication service is temporarily unavailable. Please check system configuration.",
    };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    // Generic error to prevent user enumeration
    return {
      success: false,
      error: "Invalid email or password.",
    };
  }

  // Phase 2: Database authorization check
  const adminContext = await verifyAdminAuthorization(data.user.id);

  if (!adminContext) {
    // User exists in Supabase Auth, but does NOT possess active MVA ADMIN authorization
    // Immediately destroy the session to prevent unauthorized ambient state
    await supabase.auth.signOut();
    return {
      success: false,
      error: "Access denied. You do not have administrator permissions.",
    };
  }

  redirect("/admin");
}

/**
 * Server Action to securely sign out the administrator and redirect to login.
 */
export async function adminLogoutAction(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {
    // Session cleanup error or missing env, proceed to redirect
  }

  redirect("/admin/login");
}
