export type PlayerSex = "MALE" | "FEMALE";

export function isPlayerSex(value: unknown): value is PlayerSex {
  return value === "MALE" || value === "FEMALE";
}

export function playerSexLabel(value: PlayerSex | null | undefined): string {
  return value === "MALE" ? "Male" : value === "FEMALE" ? "Female" : "Not recorded";
}
