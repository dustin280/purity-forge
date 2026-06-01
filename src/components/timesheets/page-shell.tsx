import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TabsNav } from "./tabs-nav";

export function PageShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <Link to="/lab-logs">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to Logs
        </Button>
      </Link>
      <div className="mb-4">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Lab Logs
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">{title}</h1>
        {description && (
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <TabsNav />
      {children}
    </div>
  );
}