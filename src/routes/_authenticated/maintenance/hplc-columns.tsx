import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ExternalLink, Search, Sparkles, X, Send } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { loadVendorColumns, VENDORS, type ColumnRow, type VendorId, type VendorMeta } from "@/lib/maintenance/columns";
import { ChatToolbar } from "@/components/ai-chat/chat-toolbar";
import { useChatPersistence } from "@/components/ai-chat/use-chat-persistence";

export const Route = createFileRoute("/_authenticated/maintenance/hplc-columns")({ component: HplcColumns });

const ALL = "__all__";

function HplcColumns() {
  const [vendorId, setVendorId] = useState<VendorId>("agilent");
  const vendor = useMemo(() => VENDORS.find(v => v.id === vendorId)!, [vendorId]);
  const columns = useMemo(() => loadVendorColumns(vendorId), [vendorId]);
  const [q, setQ] = useState("");
  const [familyFilter, setFamilyFilter] = useState<string>(ALL);
  const [modeFilter, setModeFilter] = useState<string>(ALL);
  const [particleFilter, setParticleFilter] = useState<string>(ALL);
  const [hardwareFilter, setHardwareFilter] = useState<string>(ALL);

  const families = useMemo(
    () => Array.from(new Set(columns.map(c => c.productFamily).filter(Boolean))).sort(),
    [columns],
  );
  const modes = useMemo(
    () => Array.from(new Set(columns.map(c => c.separationMode).filter(Boolean))).sort(),
    [columns],
  );
  const particles = useMemo(
    () => Array.from(new Set(columns.map(c => c.particleSize).filter(Boolean))).sort(),
    [columns],
  );
  const hardwares = useMemo(
    () => Array.from(new Set(columns.map(c => c.hardware).filter(Boolean))).sort(),
    [columns],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return columns.filter(c => {
      if (familyFilter !== ALL && c.productFamily !== familyFilter) return false;
      if (modeFilter !== ALL && c.separationMode !== modeFilter) return false;
      if (particleFilter !== ALL && c.particleSize !== particleFilter) return false;
      if (hardwareFilter !== ALL && c.hardware !== hardwareFilter) return false;
      if (!needle) return true;
      return Object.values(c).some(v => String(v).toLowerCase().includes(needle));
    });
  }, [columns, q, familyFilter, modeFilter, particleFilter, hardwareFilter]);

  const hasFilters = q || familyFilter !== ALL || modeFilter !== ALL || particleFilter !== ALL || hardwareFilter !== ALL;
  const clear = () => {
    setQ(""); setFamilyFilter(ALL); setModeFilter(ALL); setParticleFilter(ALL); setHardwareFilter(ALL);
  };

  // Reset filters when switching vendor so stale options don't apply.
  useEffect(() => { clear(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [vendorId]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1500px]">
      <div className="mb-6">
        <Link to="/maintenance" className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="size-3" /> Maintenance
        </Link>
        <div className="mt-2">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">HPLC Columns</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Ask the AI advisor for recommendations across vendors, then browse each vendor's catalog below.
          </p>
        </div>
      </div>

      <AdvisorPanel />

      {/* Vendor selector */}
      <div className="flex flex-wrap gap-2 mb-3">
        {VENDORS.map(v => {
          const active = v.id === vendorId;
          return (
            <Button
              key={v.id}
              size="sm"
              variant={active ? "default" : "outline"}
              disabled={v.comingSoon}
              onClick={() => setVendorId(v.id)}
              title={v.comingSoon ? "Coming soon" : `View ${v.label} columns`}
            >
              {v.label}
              {v.comingSoon && <span className="ml-2 text-[10px] uppercase opacity-70">Soon</span>}
            </Button>
          );
        })}
      </div>

      <Card className="p-4 mb-4">
        <div className="grid gap-3 md:grid-cols-[1fr_repeat(4,minmax(0,180px))_auto]">
          <div className="relative">
            <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
            <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, part #, description…" className="pl-9" />
          </div>
          <Select value={familyFilter} onValueChange={setFamilyFilter}>
            <SelectTrigger><SelectValue placeholder="Family" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All families</SelectItem>
              {families.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={modeFilter} onValueChange={setModeFilter}>
            <SelectTrigger><SelectValue placeholder="Mode" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All modes</SelectItem>
              {modes.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={particleFilter} onValueChange={setParticleFilter}>
            <SelectTrigger><SelectValue placeholder="Particle" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All particles</SelectItem>
              {particles.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={hardwareFilter} onValueChange={setHardwareFilter}>
            <SelectTrigger><SelectValue placeholder="Hardware" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All hardware</SelectItem>
              {hardwares.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={clear} disabled={!hasFilters}>
            <X className="size-4 mr-1" /> Clear
          </Button>
        </div>
        <div className="text-xs text-muted-foreground mt-3">
          {vendor.label}: showing {filtered.length} of {columns.length} entries
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/50">
              <TableRow>
                <TableHead className="min-w-[160px]">Family</TableHead>
                <TableHead className="min-w-[220px]">Model / Name</TableHead>
                <TableHead className="min-w-[130px]">Part #</TableHead>
                <TableHead className="min-w-[240px]">Description</TableHead>
                <TableHead className="min-w-[160px]">Specs</TableHead>
                <TableHead className="min-w-[90px]">Particle</TableHead>
                <TableHead className="min-w-[80px]">ID</TableHead>
                <TableHead className="min-w-[80px]">Length</TableHead>
                <TableHead className="min-w-[80px]">Pore</TableHead>
                <TableHead className="min-w-[110px]">Hardware</TableHead>
                <TableHead className="min-w-[130px]">Guard PN</TableHead>
                <TableHead className="min-w-[100px] text-right">Price</TableHead>
                <TableHead className="min-w-[100px]">{vendor.linkLabel}</TableHead>
                <TableHead className="min-w-[90px]">eBay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={14} className="text-center text-sm text-muted-foreground py-8">
                    No columns match your filters.
                  </TableCell>
                </TableRow>
              ) : filtered.map((c, i) => <ColumnRowView key={`${c.partNumber}-${i}`} c={c} vendor={vendor} />)}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}

function ColumnRowView({ c, vendor }: { c: ColumnRow; vendor: VendorMeta }) {
  const isFamily = c.rowType === "Family";
  const hasPn = c.partNumber && c.partNumber !== "MULTIPLE";
  return (
    <TableRow className={isFamily ? "bg-muted/30" : ""}>
      <TableCell className="text-sm">{c.productFamily}</TableCell>
      <TableCell className={`text-sm ${isFamily ? "font-semibold" : ""}`}>{c.name}</TableCell>
      <TableCell className="text-sm font-mono">{c.partNumber}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{c.description}</TableCell>
      <TableCell className="text-xs text-muted-foreground">{c.specs}</TableCell>
      <TableCell className="text-xs">{c.particleSize}</TableCell>
      <TableCell className="text-xs">{c.innerDiameter}</TableCell>
      <TableCell className="text-xs">{c.length}</TableCell>
      <TableCell className="text-xs">{c.poreSize}</TableCell>
      <TableCell className="text-xs">{c.hardware}</TableCell>
      <TableCell className="text-xs font-mono">{c.guardPartNumber}</TableCell>
      <TableCell className="text-sm font-mono text-right whitespace-nowrap">
        {c.price && c.price !== "Varies" ? c.price : <span className="text-muted-foreground">{c.price || "—"}</span>}
      </TableCell>
      <TableCell>
        {c.sourceUrl && /^https?:\/\//i.test(c.sourceUrl) ? (
          <a href={c.sourceUrl} target="_blank" rel="noopener noreferrer"
             className="inline-flex items-center gap-1 text-primary hover:underline text-sm">
            {vendor.linkLabel} <ExternalLink className="size-3" />
          </a>
        ) : <span className="text-xs text-muted-foreground">—</span>}
      </TableCell>
      <TableCell>
        <Button
          size="sm"
          variant="outline"
          disabled={!hasPn}
          onClick={() => {
            const query = encodeURIComponent(`${vendor.searchPrefix} ${c.partNumber}`);
            window.open(`https://www.ebay.com/sch/i.html?_nkw=${query}`, "_blank", "noopener,noreferrer");
          }}
        >
          eBay <ExternalLink className="size-3 ml-1" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function AdvisorPanel() {
  const [input, setInput] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat-column-advisor" }),
    [],
  );
  const { activeThreadId, persist, loadThread, startNew } = useChatPersistence("column_advisor");
  const { messages, sendMessage, status, setMessages, error } = useChat({
    transport,
    onFinish: ({ messages: ms }) => { void persist(ms); },
  });

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => { taRef.current?.focus(); }, []);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, status]);

  const submit = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput("");
    await sendMessage({ text });
    taRef.current?.focus();
  };

  return (
    <Card className="p-4 mb-4 border-primary/30">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <h2 className="font-semibold">Column Advisor</h2>
          <span className="text-xs text-muted-foreground">AI-powered · Agilent + Waters</span>
        </div>
        <ChatToolbar
          agent="column_advisor"
          agentLabel="Column Advisor"
          messages={messages}
          isLoading={isLoading}
          activeThreadId={activeThreadId}
          onNewChat={() => { setMessages([]); startNew(); taRef.current?.focus(); }}
          onClear={() => setMessages([])}
          onSelectThread={async (id) => {
            try {
              const msgs = await loadThread(id);
              setMessages(msgs);
            } catch (e) {
              console.error(e);
            }
          }}
        />
      </div>

      <div
        ref={scrollRef}
        className="border rounded-md bg-muted/20 p-3 mb-3 max-h-[360px] min-h-[140px] overflow-y-auto space-y-3"
      >
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Describe your application — analytes, mobile phase pH, instrument pressure limit, sample matrix, and throughput — and I'll recommend columns from the Agilent and Waters catalogs.
          </p>
        )}
        {messages.map(m => {
          const text = m.parts.map(p => (p.type === "text" ? p.text : "")).join("");
          return (
            <div key={m.id} className={`text-sm ${m.role === "user" ? "text-foreground" : "text-foreground"}`}>
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {m.role === "user" ? "You" : "Advisor"}
              </div>
              {m.role === "user" ? (
                <div className="whitespace-pre-wrap">{text}</div>
              ) : (
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <ReactMarkdown>{text}</ReactMarkdown>
                </div>
              )}
            </div>
          );
        })}
        {status === "submitted" && (
          <div className="text-xs text-muted-foreground italic">Thinking…</div>
        )}
        {error && (
          <div className="text-xs text-destructive">Error: {error.message}</div>
        )}
      </div>

      <div className="flex gap-2 items-end">
        <Textarea
          ref={taRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder="e.g. I'm separating peptides 1–5 kDa at pH 2.5, my UHPLC pressure limit is 1200 bar…"
          className="min-h-[60px] resize-none"
          disabled={isLoading}
        />
        <Button onClick={submit} disabled={!input.trim() || isLoading}>
          <Send className="size-4" />
        </Button>
      </div>
    </Card>
  );
}