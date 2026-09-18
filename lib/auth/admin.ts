import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";

export interface AdminContext {
  authUserId: string;
  profileId: string;
  displayName: string;
  email: string;
  role: string;
}

/**
 * Verifies application-level admin authorization from the database.
 * 
 * Strict authorization rules:
 * 1. Matching profiles record must exist for auth_user_id.
 * 2. Associated admin_access record must exist.
 * 3. admin_access.is_active must be true.
 * 4. admin_access.role must be "ADMIN".
 * 
 * Returns AdminContext if authorized, or null if unauthorized.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function verifyAdminAuthorization(
  authUserId: string
): Promise<AdminContext | null> {
  if (!authUserId || typeof authUserId !== "string" || !UUID_REGEX.test(authUserId)) {
    return null;
  }

  const profile = await prisma.profiles.findUnique({
    where: { auth_user_id: authUserId },
    include: { admin_access: true },
  });

  if (!profile || !profile.admin_access) {
    return null;
  }

  if (!profile.admin_access.is_active || profile.admin_access.role !== "ADMIN") {
    return null;
  }

  return {
    authUserId: profile.auth_user_id,
    profileId: profile.id,
    displayName: profile.display_name ?? profile.email ?? "MVA Administrator",
    email: profile.email ?? "",
    role: profile.admin_access.role,
  };
}

/**
 * Resolves the authenticated Supabase user and verifies their admin authorization.
 * Returns the AdminContext if valid and active, or null if unauthenticated / unauthorized.
 */
export async function getAdminContext(): Promise<AdminContext | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser();

    if (error || !user) {
      return null;
    }

    return await verifyAdminAuthorization(user.id);
  } catch {
    // If Supabase client fails (e.g. unconfigured env), fail safe and return null
    return null;
  }
}

/**
 * Server-side route and action protection guard for administrative capabilities.
 * 
 * Behaviors:
 * - Unauthenticated user -> Redirects to /admin/login
 * - Authenticated user without active ADMIN authorization -> Redirects to /admin/login?error=access_denied
 * - Active ADMIN -> Returns safe AdminContext
 */
export async function requireAdmin(): Promise<AdminContext> {
  let user = null;

  try {
    const supabase = await createClient();
    const {
      data: { user: authUser },
      error,
    } = await supabase.auth.getUser();

    if (!error && authUser) {
      user = authUser;
    }
  } catch {
    // Fall through to unauthenticated redirect
  }

  if (!user) {
    redirect("/admin/login");
  }

  const adminContext = await verifyAdminAuthorization(user.id);

  if (!adminContext) {
    // Authenticated in Supabase Auth, but NOT an active authorized administrator
    redirect("/admin/login?error=access_denied");
  }

  return adminContext;
}
