import type { CurrentMembership } from "@/lib/data/auth-context";

export function isParent(membership: CurrentMembership | null): boolean {
  return membership?.role === "parent";
}

export function assertParent(membership: CurrentMembership | null): void {
  if (!isParent(membership)) {
    throw new Error("Only parents can perform this action.");
  }
}
