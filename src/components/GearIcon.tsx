import { useMemo } from 'react';
import type { GearSpec } from '../game/types';

function polar(cx: number, cy: number, r: number, a: number) {
  return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
}

export function gearSvgPath(teeth: number): string {
  const cx = 50;
  const cy = 50;
  const root = 38;
  const outer = 48;
  const pitch = (Math.PI * 2) / teeth;
  let d = '';
  for (let i = 0; i < teeth; i++) {
    const c = i * pitch;
    const pts = [
      polar(cx, cy, root, c - pitch * 0.43),
      polar(cx, cy, outer, c - pitch * 0.2),
      polar(cx, cy, outer, c + pitch * 0.2),
      polar(cx, cy, root, c + pitch * 0.43),
    ];
    pts.forEach(([x, y], idx) => {
      d += `${i === 0 && idx === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)} `;
    });
    const [nx, ny] = polar(cx, cy, root, (i + 1) * pitch - pitch * 0.43);
    d += `L${nx.toFixed(2)},${ny.toFixed(2)} `;
  }
  return `${d}Z`;
}

export function GearIcon({ spec, size = 54, className }: { spec: GearSpec; size?: number; className?: string }) {
  const d = useMemo(() => gearSvgPath(spec.teeth), [spec.teeth]);
  const palette =
    spec.material === 'steel'
      ? ['#eef2f7', '#8b98a8', '#46515e']
      : spec.material === 'blued'
        ? ['#c9dbf4', '#55779f', '#1d3149']
        : ['#ffe59a', '#cf9638', '#714c18'];
  const id = `g-${spec.id.replace(/[^a-zA-Z0-9]/g, '-')}`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} aria-hidden>
      <defs>
        <radialGradient id={id} cx="38%" cy="32%" r="75%">
          <stop offset="0%" stopColor={palette[0]} />
          <stop offset="58%" stopColor={palette[1]} />
          <stop offset="100%" stopColor={palette[2]} />
        </radialGradient>
      </defs>
      <path d={d} fill={`url(#${id})`} stroke="#3a2a17" strokeWidth="1.4" />
      {spec.teeth >= 22 &&
        [0, 1, 2, 3, 4].map((i) => {
          const a = (i / 5) * Math.PI * 2;
          return <circle key={i} cx={50 + Math.cos(a) * 25} cy={50 + Math.sin(a) * 25} r="6.2" fill="rgba(20,13,7,.55)" />;
        })}
      <circle cx="50" cy="50" r="11" fill={palette[1]} stroke="#3a2a17" strokeWidth="1.2" />
      <circle cx="50" cy="50" r="4.2" fill="#20160d" />
    </svg>
  );
}
