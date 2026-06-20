import { Coins, ExternalLink } from "lucide-react";

/**
 * Small badge linking out to the Lovable plans page where users
 * can view their AI credit balance and buy more. We don't have a
 * live per-user credit count surfaced from the Lovable platform,
 * so the badge focuses on the "buy more" affordance.
 */
export function AiCreditsBadge() {
  return (
    <a
      href="https://lovable.dev/settings/plans"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
      title="View AI credit balance and buy more"
    >
      <Coins className="size-3" />
      <span>AI credits</span>
      <ExternalLink className="size-3 opacity-60" />
    </a>
  );
}