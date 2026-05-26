import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PrepPreview } from "@/components/mobile-phase/prep-preview";
import { useMobilePhasePrep } from "@/components/mobile-phase/use-mobile-phase";

export const Route = createFileRoute("/_authenticated/lab-logs/mobile-phase/$id")({
  component: MobilePhaseDetail,
});

function MobilePhaseDetail() {
  const { id } = Route.useParams();
  const { data: row, isLoading } = useMobilePhasePrep(id);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <Link to="/lab-logs/mobile-phase">
        <Button variant="ghost" size="sm" className="-ml-2 mb-2">
          <ArrowLeft className="size-4 mr-1" /> Back to list
        </Button>
      </Link>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && !row && <div className="text-sm text-muted-foreground">Not found.</div>}
      {row && (
        <>
          <div className="mb-6">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Mobile Phase Prep</div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1 font-mono">{row.log_number}</h1>
          </div>

          <Card className="p-4 mb-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Date</div>
                <div>{row.prepared_at.slice(0, 10)}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Initials</div>
                <div>{row.user_initials}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Volume</div>
                <div>{row.total_volume} {row.total_volume_unit}</div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Lot</div>
                <div className="font-mono text-xs">{row.lot_number}</div>
              </div>
              <div className="col-span-2 sm:col-span-4">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">Prepared</div>
                <div className="flex gap-2">
                  {row.prep_a?.enabled && <Badge variant="secondary">A · {row.prep_a.solvent_pct}% {row.prep_a.solvent}</Badge>}
                  {row.prep_b?.enabled && <Badge variant="secondary">B · {row.prep_b.solvent_pct}% {row.prep_b.solvent}</Badge>}
                </div>
              </div>
            </div>
          </Card>

          <PrepPreview text={row.preparation} />
        </>
      )}
    </div>
  );
}