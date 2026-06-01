import { Link, useLocation } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

const TABS: ReadonlyArray<{ to: string; label: string; exact?: boolean }> = [
  { to: "/lab-logs/timesheets", label: "Dashboard", exact: true },
  { to: "/lab-logs/timesheets/daily", label: "Daily" },
  { to: "/lab-logs/timesheets/history", label: "History" },
  { to: "/lab-logs/timesheets/reports", label: "Reports" },
];

export function TabsNav() {
  const { pathname } = useLocation();
  return (
    <div className="border-b mb-4 -mx-1 overflow-x-auto">
      <nav className="flex gap-1 px-1">
        {TABS.map((t) => {
          const active = t.exact ? pathname === t.to : pathname.startsWith(t.to);
          return (
            <Link
              key={t.to}
              to={t.to as "/lab-logs/timesheets"}
              className={cn(
                "px-3 py-2 text-sm border-b-2 -mb-px whitespace-nowrap transition-colors",
                active
                  ? "border-primary text-foreground font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}