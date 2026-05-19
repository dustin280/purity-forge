import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/access-logs")({ component: AccessLogsAdmin });

type AccessLog = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_name: string | null;
  event: string;
  user_agent: string | null;
  created_at: string;
};

function isoStart(d: string) { return new Date(`${d}T00:00:00`).toISOString(); }
function isoEnd(d: string) { return new Date(`${d}T23:59:59.999`).toISOString(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function AccessLogsAdmin() {
  const { role } = useAuth();
  const [from, setFrom] = useState<string>(daysAgoStr(30));
  const [to, setTo] = useState<string>(todayStr());

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: ["access_logs", from, to],
    enabled: role === "admin",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("access_logs")
        .select("*")
        .gte("created_at", isoStart(from))
        .lte("created_at", isoEnd(to))
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as AccessLog[];
    },
  });

  const summary = useMemo(() => {
    const logins = rows.filter(r => r.event === "login").length;
    const logouts = rows.filter(r => r.event === "logout").length;
    return { total: rows.length, logins, logouts };
  }, [rows]);

  function downloadPdf() {
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    let y = margin;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Access Logs", margin, y);
    y += 18;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(`Range: ${from} to ${to}`, margin, y);
    doc.text(
      `Total: ${summary.total}  •  Logins: ${summary.logins}  •  Logouts: ${summary.logouts}`,
      pageW - margin, y, { align: "right" }
    );
    y += 14;
    doc.setDrawColor(200);
    doc.line(margin, y, pageW - margin, y);
    y += 14;
    doc.setTextColor(0);

    const cols = [
      { label: "Timestamp", w: 130 },
      { label: "User", w: 140 },
      { label: "Email", w: 170 },
      { label: "Event", w: 60 },
    ];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    let x = margin;
    for (const c of cols) { doc.text(c.label, x, y); x += c.w; }
    y += 10;
    doc.setDrawColor(220);
    doc.line(margin, y, pageW - margin, y);
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    for (const r of rows) {
      if (y > pageH - margin) { doc.addPage(); y = margin; }
      let cx = margin;
      const cells = [
        new Date(r.created_at).toLocaleString(),
        r.user_name ?? "—",
        r.user_email ?? "—",
        r.event,
      ];
      cells.forEach((val, i) => {
        const w = cols[i].w - 6;
        const lines = doc.splitTextToSize(String(val ?? "—"), w);
        doc.text(lines, cx, y);
        cx += cols[i].w;
      });
      y += 14;
    }

    doc.save(`access-logs-${from}_to_${to}.pdf`);
  }

  if (role && role !== "admin") {
    return (
      <div className="p-6 md:p-8 max-w-3xl">
        <p className="text-sm text-muted-foreground">Admins only.</p>
      </div>
    );
  }

  return (
    <div className="p-6 md:p-8 max-w-6xl">
      <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Back to Admin
      </Link>
      <div className="mb-6">
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Access Logs</h1>
        <p className="text-sm text-muted-foreground mt-1">User sign-in and sign-out activity. Showing up to 1,000 most recent events in range.</p>
      </div>

      <Card className="p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from" className="text-xs">From</Label>
            <Input id="from" type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to" className="text-xs">To</Label>
            <Input id="to" type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" />
          </div>
          <div className="flex-1 min-w-0" />
          <div className="text-xs text-muted-foreground mr-2">
            {summary.total} events &middot; {summary.logins} logins &middot; {summary.logouts} logouts
          </div>
          <Button onClick={downloadPdf} disabled={rows.length === 0}>
            <Download className="size-4" /> Download PDF
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[60vh] overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr className="border-b">
                <th className="text-left font-medium px-3 py-2 w-48">Timestamp</th>
                <th className="text-left font-medium px-3 py-2">User</th>
                <th className="text-left font-medium px-3 py-2">Email</th>
                <th className="text-left font-medium px-3 py-2 w-24">Event</th>
                <th className="text-left font-medium px-3 py-2">User agent</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Loading…</td></tr>
              ) : error ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-destructive">{(error as Error).message}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">No access events in this range.</td></tr>
              ) : rows.map(r => (
                <tr key={r.id} className="border-b hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap tabular-nums">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.user_name ?? "—"}</td>
                  <td className="px-3 py-2">{r.user_email ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span className={
                      "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium " +
                      (r.event === "login"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground")
                    }>
                      {r.event}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[24rem]" title={r.user_agent ?? ""}>{r.user_agent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}