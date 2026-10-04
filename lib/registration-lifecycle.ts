import type { league_status } from "@prisma/client";

export const NEW_ADMIN_TEAM_STATUSES = ["OPEN_FOR_REGISTRATION", "ADMIN_REGISTRATION_ONLY"] as const;

export function canPublicRegisterTeam(status: league_status): boolean {
  return status === "OPEN_FOR_REGISTRATION";
}

export function canAdminRegisterTeam(status: league_status): boolean {
  return status === "OPEN_FOR_REGISTRATION" || status === "ADMIN_REGISTRATION_ONLY";
}
