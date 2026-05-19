import type { Peak } from "@/lib/lims-utils";

export function Chromatogram({ peaks }: { peaks: Peak[] }) {
  const W = 800, H = 220, pad = 24;
  const xs = peaks.map(p => p.rt);
  const maxRt = Math.max(...xs, 10) + 1;
  const maxA = Math.max(...peaks.map(p => p.area), 100);
  const scaleX = (rt: number) => pad + (rt / maxRt) * (W - pad * 2);
  const baseY = H - pad;

  // build a baseline path with Gaussian-ish bumps at each peak
  const points: string[] = [];
  for (let x = pad; x <= W - pad; x += 2) {
    const rt = ((x - pad) / (W - pad * 2)) * maxRt;
    let y = baseY - 4;
    peaks.forEach(p => {
      const h = (p.area / maxA) * (H - pad * 2 - 10);
      const sigma = 0.12;
      y -= h * Math.exp(-Math.pow((rt - p.rt) / sigma, 2));
    });
    points.push(`${x},${y.toFixed(1)}`);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full">
      <rect width={W} height={H} fill="var(--card)" />
      {/* gridlines */}
      {Array.from({ length: 5 }, (_, i) => (
        <line key={i} x1={pad} x2={W - pad}
          y1={pad + (i * (H - pad * 2)) / 4} y2={pad + (i * (H - pad * 2)) / 4}
          stroke="var(--border)" strokeDasharray="2 4" />
      ))}
      <line x1={pad} y1={baseY} x2={W - pad} y2={baseY} stroke="var(--muted-foreground)" strokeWidth={1} />
      <line x1={pad} y1={pad} x2={pad} y2={baseY} stroke="var(--muted-foreground)" strokeWidth={1} />
      <polyline points={points.join(" ")} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
      {peaks.map(p => (
        <g key={p.peak_id}>
          <line x1={scaleX(p.rt)} y1={baseY - (p.area / maxA) * (H - pad * 2 - 10) - 4}
            x2={scaleX(p.rt)} y2={baseY} stroke="var(--accent)" strokeOpacity={0.3} strokeDasharray="2 2" />
          <text x={scaleX(p.rt)} y={pad + 10} textAnchor="middle" fontSize="9"
            fontFamily="IBM Plex Mono" fill="var(--muted-foreground)">RT {p.rt.toFixed(2)}</text>
        </g>
      ))}
      <text x={pad} y={14} fontSize="9" fontFamily="IBM Plex Mono" fill="var(--muted-foreground)">mAU</text>
      <text x={W - pad} y={H - 4} fontSize="9" fontFamily="IBM Plex Mono" fill="var(--muted-foreground)" textAnchor="end">min</text>
    </svg>
  );
}
