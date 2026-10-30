// Lightweight, flat SVG charts themed with our CSS-variable colors.

export interface Segment {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  segments,
  centerValue,
  centerLabel,
  size = 168,
}: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
  size?: number;
}) {
  const r = 60;
  const cx = 80;
  const cy = 80;
  const circ = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;

  return (
    <svg viewBox="0 0 160 160" width={size} height={size} className="shrink-0">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--color-surface)" strokeWidth={18} />
      {total > 0 &&
        segments.map((s) => {
          if (s.value === 0) return null;
          const dash = (s.value / total) * circ;
          const el = (
            <circle
              key={s.label}
              cx={cx}
              cy={cy}
              r={r}
              fill="none"
              stroke={s.color}
              strokeWidth={18}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          );
          offset += dash;
          return el;
        })}
      <text x={cx} y={cy - 2} textAnchor="middle" className="fill-fg text-2xl font-semibold" style={{ fontSize: 26 }}>
        {centerValue}
      </text>
      <text x={cx} y={cy + 18} textAnchor="middle" className="fill-muted" style={{ fontSize: 11 }}>
        {centerLabel}
      </text>
    </svg>
  );
}

export function TrendArea({
  points,
  color = "var(--color-brand)",
}: {
  points: { label: string; count: number }[];
  color?: string;
}) {
  const W = 460;
  const H = 220;
  const pad = { top: 16, right: 12, bottom: 26, left: 28 };
  const rawMax = Math.max(1, ...points.map((p) => p.count));
  // Nice integer max + tick step (2 or 3 ticks).
  const max = Math.ceil(rawMax / 2) * 2;
  const ticks = [0, max / 2, max];
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const step = points.length > 1 ? innerW / (points.length - 1) : 0;
  const x = (i: number) => pad.left + i * step;
  const y = (v: number) => pad.top + innerH - (v / max) * innerH;

  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.count)}`).join(" ");
  const area = `${line} L ${x(points.length - 1)} ${pad.top + innerH} L ${x(0)} ${pad.top + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" className="h-auto">
      {/* Y axis gridlines + labels */}
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={pad.left}
            x2={W - pad.right}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--color-border)"
            strokeWidth={1}
          />
          <text x={pad.left - 6} y={y(t) + 3} textAnchor="end" className="fill-muted" style={{ fontSize: 10 }}>
            {t}
          </text>
        </g>
      ))}

      <path d={area} fill={color} opacity={0.12} />
      <path d={line} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(p.count)} r={3.5} fill={color} />
          <text x={x(i)} y={H - 8} textAnchor="middle" className="fill-muted" style={{ fontSize: 11 }}>
            {p.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HBar({
  label,
  value,
  max,
  color,
}: {
  label: React.ReactNode;
  value: number;
  max: number;
  color: string;
}) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5">{label}</span>
        <span className="text-muted">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-2 rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
