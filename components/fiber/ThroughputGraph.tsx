import type { TelemetrySnapshot } from "@/lib/telemetry/types";

const W = 600;
const H = 200;
const GAP = 2; // clear space either side of the axis
const PAD = 4; // headroom at the top and bottom edges

/** Smallest "nice" Gbps ceiling (2, 4, 5, 6, 8, 10, 12…) above the window's peak. */
function niceCeil(peak: number) {
  const steps = [1, 2, 4, 5, 6, 8, 10];
  const mag = 10 ** Math.floor(Math.log10(Math.max(peak, 0.1)));
  for (const s of steps) if (s * mag >= peak) return s * mag;
  return 10 * mag;
}

/**
 * Mirrored down/up throughput over a rolling 60 s window (SPEC §4): one glowing
 * column per sample, download rising above the axis (cyan), upload mirrored
 * below (violet), older samples fading to the left. Each half is as tall as
 * its own peak (rounded up to a nice value) at the SAME pixels per Gbps, so
 * the axis sits where the traffic puts it: honest scale, no empty half.
 * Plain SVG; `label` is the text equivalent.
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
  const downScale = niceCeil(points.reduce((m, p) => Math.max(m, p.downGbps), 0) * 1.08);
  const upScale = niceCeil(points.reduce((m, p) => Math.max(m, p.upGbps), 0) * 1.08);
  const px = (H - 2 * PAD - 2 * GAP) / (downScale + upScale); // px per Gbps, both halves
  const MID = PAD + GAP + downScale * px;
  const x = (t: number) => W - ((end - t) / windowMs) * W;
  const hd = (gbps: number) => Math.min(gbps, downScale) * px;
  const hu = (gbps: number) => Math.min(gbps, upScale) * px;
  const bw = Math.max(1.5, (W / Math.max(points.length, 1)) * 0.56);
  const n = points.length;

  return (
    <figure>
      <div className="relative">
        <svg
          role="img"
          aria-label={label}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          className="h-48 w-full sm:h-64"
        >
          <defs>
            <linearGradient id="tg-down" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2={MID}>
              <stop offset="0" stopColor="#cffafe" />
              <stop offset="0.45" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#0e7490" stopOpacity="0.55" />
            </linearGradient>
            <linearGradient id="tg-up" gradientUnits="userSpaceOnUse" x1="0" y1={H} x2="0" y2={MID}>
              <stop offset="0" stopColor="#ede9fe" />
              <stop offset="0.45" stopColor="#a78bfa" />
              <stop offset="1" stopColor="#5b21b6" stopOpacity="0.55" />
            </linearGradient>
            {/* The viewBox is stretched ~2× horizontally, so blur less in x. */}
            <filter id="tg-glow" x="-10%" y="-20%" width="120%" height="140%">
              <feGaussianBlur stdDeviation="1.4 2.6" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {[MID - (downScale / 2) * px, MID + (upScale / 2) * px].map((y) => (
            <line
              key={y}
              x1={0}
              x2={W}
              y1={y}
              y2={y}
              stroke="rgb(255 255 255 / 0.05)"
              strokeDasharray="2 4"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {[1, 2, 3, 4, 5].map((i) => (
            <line
              key={i}
              x1={(W * i) / 6}
              x2={(W * i) / 6}
              y1={0}
              y2={H}
              stroke="rgb(255 255 255 / 0.035)"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <g filter="url(#tg-glow)">
            {points.map((p, i) => {
              const age = n < 2 ? 1 : i / (n - 1);
              const op = (0.18 + 0.82 * age ** 1.6).toFixed(3);
              const cx = x(p.t) - bw / 2;
              const d = hd(p.downGbps);
              const u = hu(p.upGbps);
              const newest = i === n - 1;
              return (
                <g key={i} opacity={op}>
                  <rect x={cx} y={MID - GAP - d} width={bw} height={d} fill={newest ? "#ecfeff" : "url(#tg-down)"} />
                  <rect x={cx} y={MID + GAP} width={bw} height={u} fill={newest ? "#f5f3ff" : "url(#tg-up)"} />
                </g>
              );
            })}
          </g>

          <line
            x1={0}
            x2={W}
            y1={MID}
            y2={MID}
            stroke="rgb(165 243 252 / 0.35)"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <figcaption
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-col justify-between py-1 font-mono text-[0.6rem] text-muted-foreground"
        >
          <span className="w-fit rounded bg-background/60 px-1">
            <span className="text-fiber">↓</span> {axis.down} · {downScale} Gbps
          </span>
          <span className="w-fit rounded bg-background/60 px-1">
            <span className="text-up">↑</span> {axis.up} · {upScale} Gbps
          </span>
        </figcaption>
      </div>
      <div
        aria-hidden
        className="mt-1.5 flex justify-between font-mono text-[0.6rem] text-muted-foreground"
      >
        <span>−{axis.window}</span>
        <span>0 s</span>
      </div>
    </figure>
  );
}
