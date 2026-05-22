/**
 * Shared user-admin types. Mirrors the shape returned by `listUsers` plus the
 * optional profile columns the admin UI surfaces. Co-located so every dialog
 * and the table agree on roles + display logic without circular imports.
 */
export const ROLES = ["admin", "tech", "reviewer"] as const;
export type Role = (typeof ROLES)[number];

export type ProfileExt = {
  id: string;
  email: string | null;
  full_name: string | null;
  first_name?: string | null;
  last_name?: string | null;
  title?: string | null;
};

export function displayName(p: ProfileExt): string {
  const fl = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return fl || p.full_name || p.email || "Unknown";
}