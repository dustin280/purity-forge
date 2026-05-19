import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listUsers, setUserRole } from "@/lib/lims.functions";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/users")({ component: Users });

const ROLES = ["admin", "tech", "reviewer"] as const;

function Users() {
  const qc = useQueryClient();
  const listFn = useServerFn(listUsers);
  const setFn = useServerFn(setUserRole);
  const { data, isLoading } = useQuery({ queryKey: ["users"], queryFn: () => listFn() });

  async function toggle(userId: string, role: typeof ROLES[number], grant: boolean) {
    try {
      await setFn({ data: { userId, role, grant } });
      toast.success(`${grant ? "Granted" : "Revoked"} ${role}`);
      qc.invalidateQueries({ queryKey: ["users"] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Administration</div>
        <h1 className="text-3xl font-bold tracking-tight mt-1">Users & Roles</h1>
      </div>
      <Card className="border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">User</th>
              {ROLES.map(r => <th key={r} className="text-center px-4 py-3 font-semibold">{r}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
            {data?.profiles.map(p => (
              <tr key={p.id}>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.full_name ?? p.email}</div>
                  <div className="text-xs text-muted-foreground">{p.email}</div>
                </td>
                {ROLES.map(r => {
                  const has = data.roles.some(x => x.user_id === p.id && x.role === r);
                  return (
                    <td key={r} className="text-center px-4 py-3">
                      <Switch checked={has} onCheckedChange={v => toggle(p.id, r, v)} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}