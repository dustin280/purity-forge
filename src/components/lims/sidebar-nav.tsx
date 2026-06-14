/**
 * Primary app navigation: persistent sidebar on desktop, slide-over sheet on mobile. Highlights the active route via TanStack Router state and gates admin links by role.
 */
import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, FlaskConical, Inbox, Webhook, Users, LogOut, Menu, Shield, ClipboardList, NotebookPen, MessageSquareWarning, BookOpen, CalendarDays, Cable, Building2, ListChecks, Tags } from "lucide-react";
import { useAuth, profileDisplayName } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { useEffect, useState } from "react";
import synthesyxLogo from "@/assets/synthesyx-logo.svg";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/chain-of-custody", label: "Sample Receipt", icon: ClipboardList },
  { to: "/clients", label: "Clients", icon: Building2 },
  { to: "/intake", label: "Intake", icon: Inbox },
  { to: "/samples", label: "Samples", icon: FlaskConical },
  { to: "/run-lists", label: "Run Lists", icon: ListChecks },
  { to: "/vial-labels", label: "Vial Labels", icon: Tags },
  { to: "/lab-logs", label: "Logs", icon: NotebookPen },
  { to: "/scheduler", label: "Scheduler", icon: CalendarDays },
  { to: "/instrument-comm", label: "Instrument Comm", icon: Cable },
  { to: "/lab-journal", label: "Lab Journal", icon: BookOpen },
  { to: "/issues", label: "Notes", icon: MessageSquareWarning },
  { to: "/integrations", label: "Integrations", icon: Webhook },
];

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: r => r.location.pathname });
  const { role, user, profile, signOut } = useAuth();
  const name = profileDisplayName(profile, user?.email) || user?.email || "";
  const initial = (profile?.first_name?.[0] ?? name[0] ?? "?").toUpperCase();
  return (
    <div className="h-full w-full bg-sidebar text-sidebar-foreground flex flex-col">
      <div className="p-5 border-b border-sidebar-border">
        <Link to="/" onClick={onNavigate} className="block">
          <img
            src={synthesyxLogo}
            alt="Synthesyx"
            className="h-8 w-auto invert brightness-0 contrast-200"
            style={{ filter: "invert(1) brightness(2)" }}
          />
          <div className="text-[9px] uppercase tracking-widest text-sidebar-foreground/60 mt-2">Lab Management System</div>
        </Link>
      </div>
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        <div className="px-2 py-2 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-widest">Operations</div>
        {NAV.map(item => {
          const active = pathname === item.to || (item.to !== "/" && pathname.startsWith(item.to));
          return (
            <Link key={item.to} to={item.to} onClick={onNavigate}
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
            <Link to="/admin" onClick={onNavigate} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
              pathname === "/admin" || pathname.startsWith("/admin/") ? "bg-sidebar-accent text-white" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-white"
            }`}>
              <Shield className="size-4" /> Admin
            </Link>
            <Link to="/users" onClick={onNavigate} className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
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
            {initial}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs text-white truncate">{name}</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60 truncate">
              {profile?.title ? `${profile.title} · ` : ""}{role ?? "no role"}
            </div>
          </div>
        </div>
        <Button size="sm" variant="ghost" onClick={signOut}
          className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-white">
          <LogOut className="size-4 mr-2" /> Sign out
        </Button>
      </div>
    </div>
  );
}

export function SidebarNav() {
  return (
    <aside className="hidden lg:flex w-60 border-r border-sidebar-border shrink-0">
      <SidebarBody />
    </aside>
  );
}

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: r => r.location.pathname });
  useEffect(() => { setOpen(false); }, [pathname]);
  return (
    <header className="lg:hidden sticky top-0 z-40 flex items-center gap-2 h-14 px-3 bg-sidebar text-sidebar-foreground border-b border-sidebar-border">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button size="icon" variant="ghost" className="h-11 w-11 text-white hover:bg-sidebar-accent">
            <Menu className="size-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SidebarBody onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <img
        src={synthesyxLogo}
        alt="Synthesyx"
        className="h-6 w-auto"
        style={{ filter: "invert(1) brightness(2)" }}
      />
    </header>
  );
}
