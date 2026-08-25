import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { FlaskConical, Users, ChevronRight, ClipboardList, ShieldCheck, History, Beaker, CalendarDays, Droplets, Clock, Columns3, ListChecks, KeyRound, GaugeCircle, Layers, Grid3x3, BellRing, FileStack, Refrigerator, TerminalSquare, UserCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminIndex });

const TILES = [
  { to: "/admin/parameters", title: "Requested Tests", desc: "Manage the test list shown on each compound row (Endotoxin, Heavy Metals, Sterility, etc.).", icon: FlaskConical },
  { to: "/admin/compounds", title: "Compounds", desc: "Manage the compound list used by the Parameter Scouting Run List picker.", icon: Beaker },
  { to: "/admin/instruments", title: "Instruments", desc: "Manage the instrument list shown in the Scheduler.", icon: CalendarDays },
  { to: "/admin/mobile-phase-reagents", title: "Mobile Phase Reagents", desc: "Solvents, modifiers, and diluents shown in the Mobile Phase Prep Log dropdowns.", icon: Droplets },
  { to: "/admin/hplc-columns", title: "HPLC Columns", desc: "Column options shown in the Daily Backpressure Log selector.", icon: Columns3 },
  { to: "/admin/run-list-columns", title: "Run List Columns", desc: "Manage the columns exported in the OpenLab CDS sequence CSV.", icon: ListChecks },
  { to: "/admin/method-groups", title: "Method Groups", desc: "Priority classes used by the Run List Generator (Polar/Early, General, Hydrophobes, GLP).", icon: Layers },
  { to: "/admin/trays", title: "Multisampler Trays", desc: "Vial layouts and per-position availability used by the Run List Generator.", icon: Grid3x3 },
  { to: "/admin/storage", title: "Storage & Equipment", desc: "Fridges, freezers, incubators, and autoclaves — manage units and trays, see what's occupied.", icon: Refrigerator },
  { to: "/admin/timesheet-projects", title: "Timesheet Projects", desc: "Project options shown in the Timesheets dropdown.", icon: Clock },
  { to: "/admin/coc-fields", title: "Sample Receipt Fields", desc: "Add, edit, reorder, or remove fields on the Sample Receipt form.", icon: ClipboardList },
  { to: "/admin/access-logs", title: "Access Logs", desc: "View user sign-in and sign-out activity. Filter by date and export to PDF.", icon: ShieldCheck },
  { to: "/admin/audit-log", title: "Audit Trail", desc: "Review all database changes — who changed what, when, with before/after diffs.", icon: History },
  { to: "/admin/partner-webhook-secret", title: "Partner Webhook Secret", desc: "View status and rotate the shared secret partners use to sign order intake webhooks.", icon: KeyRound },
  { to: "/admin/api-tester", title: "Syn API Tester", desc: "Send signed test requests to the partner order intake, status, and exports endpoints.", icon: TerminalSquare },
  { to: "/admin/queue-config", title: "Analysis Queue Config", desc: "Daily capacity, TAT days, business-days-only, and the amber warning threshold.", icon: GaugeCircle },
  { to: "/admin/notifications", title: "Notifications", desc: "Who gets emailed/texted when a new Sample Receipt is submitted.", icon: BellRing },
  { to: "/admin/report-reconciliation", title: "Report Reconciliation", desc: "Auto-matches completed reports to samples hourly. Review low-confidence and ambiguous matches here.", icon: FileStack },
  { to: "/admin/review-config", title: "Result Review Config", desc: "Allow or block an analyst from reviewing their own submitted results.", icon: UserCheck },
  { to: "/users", title: "Users & Roles", desc: "Grant or revoke admin, reviewer, and tech roles.", icon: Users },
] as const;

function AdminIndex() {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">Configure lab-wide settings. More tools will appear here as the lab grows.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-4">
        {TILES.map(t => (
          <Link key={t.to} to={t.to} className="group">
            <Card className="p-5 border-border hover:border-primary/50 transition-colors h-full">
              <div className="flex items-start gap-4">
                <div className="size-10 rounded-md bg-muted grid place-items-center shrink-0">
                  <t.icon className="size-5 text-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold">{t.title}</div>
                    <ChevronRight className="size-4 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">{t.desc}</div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}