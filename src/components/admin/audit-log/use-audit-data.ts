import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { qk } from "@/lib/query-keys";
import type { AuditRow, ProfileLite } from "./types";

function isoStart(d: string) { return new Date(`${d}T00:00:00`).toISOString(); }
function isoEnd(d: string) { return new Date(`${d}T23:59:59.999`).toISOString(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysAgoStr(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Owns filter state, the audit row query, the actor profile lookup, the
 * client-side actor text filter, and the distinct table list shown in
 * the filter Select. Enabled only when the caller is an admin.
 */
export function useAuditData(enabled: boolean) {
  const [from, setFrom] = useState<string>(daysAgoStr(7));
  const [to, setTo] = useState<string>(todayStr());
  const [tableFilter, setTableFilter] = useState<string>("");
  const [actorFilter, setActorFilter] = useState<string>("");

  const { data: rows = [], isLoading, error } = useQuery({
    queryKey: qk.auditLog.list(from, to, tableFilter),
    enabled,
    queryFn: async () => {
      let q = supabase
        .from("audit_log")
        .select("*")
        .gte("changed_at", isoStart(from))
        .lte("changed_at", isoEnd(to))
        .order("changed_at", { ascending: false })
        .limit(1000);
      if (tableFilter.trim()) q = q.ilike("table_name", `%${tableFilter.trim()}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const actorIds = useMemo(
    () => Array.from(new Set(rows.map(r => r.changed_by).filter((v): v is string => !!v))),
    [rows]
  );

  const { data: profiles = [] } = useQuery({
    queryKey: qk.auditLog.profiles(actorIds.join(",")),
    enabled: enabled && actorIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", actorIds);
      if (error) throw error;
      return (data ?? []) as ProfileLite[];
    },
  });

  const actorMap = useMemo(() => {
    const m = new Map<string, ProfileLite>();
    profiles.forEach(p => m.set(p.id, p));
    return m;
  }, [profiles]);

  const filtered = useMemo(() => {
    if (!actorFilter.trim()) return rows;
    const t = actorFilter.toLowerCase();
    return rows.filter(r => {
      const p = r.changed_by ? actorMap.get(r.changed_by) : null;
      return (p?.full_name ?? "").toLowerCase().includes(t)
        || (p?.email ?? "").toLowerCase().includes(t)
        || (r.changed_by ?? "").toLowerCase().includes(t);
    });
  }, [rows, actorFilter, actorMap]);

  const tables = useMemo(() => Array.from(new Set(rows.map(r => r.table_name))).sort(), [rows]);

  return {
    from, to, tableFilter, actorFilter, tables,
    setFrom, setTo, setTableFilter, setActorFilter,
    filtered, actorMap, isLoading, error,
  };
}