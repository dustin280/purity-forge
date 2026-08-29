/**
 * A short, stable, human-readable name for this browser.
 *
 * Drafts live on the machine that created them, so when the lab sees a draft
 * from somewhere else the useful question is "which machine do I go to?".
 * A UUID answers that badly, so this derives something a person can act on
 * ("Windows · Chrome") and keeps it stable per browser.
 *
 * Deliberately coarse: platform and browser family only, no fingerprinting.
 * The user can overwrite it with a name of their own.
 */
const KEY = "device-label:v1";

function guess(): string {
  if (typeof navigator === "undefined") return "Unknown device";
  const ua = navigator.userAgent;
  const platform =
    /Android/i.test(ua) ? "Android"
    : /iPhone|iPad|iPod/i.test(ua) ? "iOS"
    : /Macintosh|Mac OS X/i.test(ua) ? "Mac"
    : /Windows/i.test(ua) ? "Windows"
    : /Linux/i.test(ua) ? "Linux"
    : "Device";
  // Order matters: Edge and Opera both claim Chrome, Chrome claims Safari.
  const browser =
    /Edg\//.test(ua) ? "Edge"
    : /OPR\//.test(ua) ? "Opera"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  return `${platform} · ${browser}`;
}

export function deviceLabel(): string {
  if (typeof window === "undefined") return "Server";
  try {
    const saved = window.localStorage.getItem(KEY);
    if (saved) return saved;
    const label = guess();
    window.localStorage.setItem(KEY, label);
    return label;
  } catch {
    return guess();
  }
}

export function setDeviceLabel(label: string): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, label.trim() || guess()); } catch { /* ignore */ }
}
