/**
 * Compact colored badge mapping a `SampleStatus` to its simplified display
 * label and Tailwind class. Single source of truth for status visuals
 * across the app — collapses the 11-value raw status down to the 6-value
 * display vocabulary (see lims-utils.ts) so every badge sitewide agrees.
 */
import { displayStatusClasses, DISPLAY_STATUS_LABEL, toDisplayStatus, type SampleStatus } from "@/lib/lims-utils";
export function StatusPill({ status }: { status: SampleStatus }) {
  const display = toDisplayStatus(status);
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${displayStatusClasses(display)}`}>
      {DISPLAY_STATUS_LABEL[display]}
    </span>
  );
}
