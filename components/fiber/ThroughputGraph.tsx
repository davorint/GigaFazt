import type { TelemetrySnapshot } from "@/lib/telemetry/types";

const W = 600;
const H = 180;
const MID = H / 2;
const MAX_GBPS = 10;

/**
 * Mirrored down/up throughput over a rolling 60 s window (SPEC §4): download
 * above the axis (cyan), upload mirrored below (violet, the site-wide upload
 * color), so symmetry reads at a glance. Plain
 * SVG, no chart library. `label` is the text equivalent (role="img").
 */
export function ThroughputGraph({
  points,
  windowMs,
  label,
  axis,
}: {
  points: TelemetrySnapshot[];
  windowMs: number;
  label: string;
  axis: { down: string; up: string; window: string };
}) {
  const end = points.at(-1)?.t ?? 0;
  const x = (t: number) => W - ((end - t) / windowMs) * W;
  const y = (gbps: number, dir: 1 | -1) =>
    MID - dir * (Math.min(gbps, MAX_GBPS) / MAX_GBPS) * (MID - 8);

  const area = (key: "downGbps" | "upGbps", dir: 1 | -1) => {
    if (points.length < 2) return "";
    const line = points.map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${x(p.t).toFixed(1)},${y(p[key], dir).toFixed(1)}`,
    );
    return `${line.join(" ")} L${x(end).toFixed(1)},${MID} L${x(points[0].t).toFixed(1)},${MID} Z`;
  };

  return (
    <figure>
      <div className="relative">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-44 w-full"
        >
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1={0}
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="rgb(255 255 255 / 0.06)"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={area("downGbps", 1)}
            fill="rgb(6 182 212 / 0.18)"
            stroke="var(--color-fiber)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={area("upGbps", -1)}
            fill="rgb(167 139 250 / 0.2)"
            stroke="var(--color-up)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={0}
            x2={W}
            y1={MID}
            y2={MID}
            stroke="rgb(255 255 255 / 0.2)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <figcaption
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col justify-between py-1 font-mono text-[0.6rem] text-muted-foreground"
        >
          <span>
            ↓ {axis.down} · {MAX_GBPS} Gbps
          </span>
          <span>
            ↑ {axis.up} · {MAX_GBPS} Gbps
          </span>
        </figcaption>
      </div>
      <div
        aria-hidden
        className="mt-1 flex justify-between font-mono text-[0.6rem] text-muted-foreground"
      >
        <span>−{axis.window}</span>
        <span>0 s</span>
      </div>
    </figure>
  );
}
