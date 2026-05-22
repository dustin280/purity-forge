/**
 * Tiny helpers shared across the app. `cn` merges Tailwind class strings via clsx + tailwind-merge.
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
