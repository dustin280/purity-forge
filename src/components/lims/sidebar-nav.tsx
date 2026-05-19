import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FlaskConical, FilePlus, Webhook, Users, LogOut, Activity } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/samples", label: "Samples", icon: FlaskConical },
  { to: "/samples/new", label: "Intake", icon: FilePlus },
  { to: "/integrations", label: "Integrations", icon: Webhook },
];

export function SidebarNav() {
  const pathname = useRouterState({ select: r => r.location.pathname });
  const { role, user, signOut } = useAuth();
  return (
    <aside className="w-60 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shrink-0">
      <div className="p-5 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="size-7 rounded bg-sidebar-primary grid place-items-center">
            <Activity className="size-4 text-sidebar-primary-foreground" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white">QUANTUM LIMS</div>
            <div className="text-[9px] uppercase tracking-widest text-sidebar-foreground/60">HPLC-DAD v1.0</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-0.5">
        <div className="px-2 py-2 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">Operations</div>
        {NAV.map(item => {
          const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
          return (
            <Link key={item.to} to={item.to}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                active ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-white"
              }`}>
              <item.icon className="size-4" /> {item.label}
            </Link>
          );
        })}
        {role === "admin" && (
          <>
            <div className="px-2 py-2 mt-4 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">Admin</div>
            <Link to="/users" className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === "/users" ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-white"
            }`}>
              <Users className="size-4" /> Users
            </Link>
          </>
        )}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-2 mb-1">
          <div className="size-8 rounded-full bg-sidebar-accent grid place-items-center text-[10px] font-bold text-white">
            {user?.email?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white truncate">{user?.email}</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">{role ?? "no role"}</div>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
