/**
 * Persistent sub-navigation for the Sample Prep section. Shows the workflow
 * pages (dashboard, new preparation, records, quick dilution) plus master data.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FlaskConical, ClipboardList, Beaker, Atom, BookOpen, TestTube2, Wrench, Droplets, Settings } from "lucide-react";

type Tab = { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean };
const TABS: Tab[] = [
  { to: "/sample-prep", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/sample-prep/new", label: "New Preparation", icon: FlaskConical },
  { to: "/sample-prep/records", label: "Records", icon: ClipboardList },
  { to: "/sample-prep/quick-dilution", label: "Quick Dilution", icon: Beaker },
  { to: "/sample-prep/analytes", label: "Analytes", icon: Atom },
  { to: "/sample-prep/methods", label: "Methods", icon: BookOpen },
  { to: "/sample-prep/solvents", label: "Solvents", icon: Droplets },
  { to: "/sample-prep/vessels", label: "Vessels", icon: TestTube2 },
  { to: "/sample-prep/equipment", label: "Equipment", icon: Wrench },
  { to: "/sample-prep/settings", label: "Settings", icon: Settings },
];

export function SamplePrepSectionNav() {
  const pathname = useRouterState({ select: r => r.location.pathname });
  return (
    <nav className="flex flex-wrap gap-1 border-b pb-2">
      {TABS.map(t => {
        const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
        return (
          <Link key={t.to} to={t.to as never}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
            }`}>
            <t.icon className="size-3.5" /> {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SamplePrepShell({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </header>
      <SamplePrepSectionNav />
      {children}
    </div>
  );
}