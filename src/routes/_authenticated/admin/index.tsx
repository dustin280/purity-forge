import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { FlaskConical, Users, ChevronRight, ClipboardList, ShieldCheck, History } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({ component: AdminIndex });

const TILES = [
  { to: "/admin/parameters", title: "Requested Tests", desc: "Manage the test list shown on each compound row (Endotoxin, Heavy Metals, Sterility, etc.).", icon: FlaskConical },
  { to: "/admin/coc-fields", title: "Chain of Custody Fields", desc: "Add, edit, reorder, or remove fields on the Chain of Custody form.", icon: ClipboardList },
  { to: "/admin/access-logs", title: "Access Logs", desc: "View user sign-in and sign-out activity. Filter by date and export to PDF.", icon: ShieldCheck },
  { to: "/admin/audit-log", title: "Audit Trail", desc: "Review all database changes — who changed what, when, with before/after diffs.", icon: History },
  { to: "/users", title: "Users & Roles", desc: "Grant or revoke admin, reviewer, and tech roles.", icon: Users },
] as const;

function AdminIndex() {
  return (
    <div className="p-6 md:p-8 max-w-5xl">
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Admin</h1>
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