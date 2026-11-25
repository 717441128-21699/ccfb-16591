import { useEffect, useRef } from 'react';
import { Frac } from '../game/frac';
import type { TrainAnalysis } from '../game/types';

interface ClockDialProps {
  analysis: TrainAnalysis;
  playing: boolean;
  speed: number;
}

export function ClockDial({ analysis, playing, speed }: ClockDialProps) {
  const hourRef = useRef<SVGGElement>(null);
  const minuteRef = useRef<SVGGElement>(null);
  const secondRef = useRef<SVGGElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const angles = { hour: 0, minute: 0, second: 0 };

    const axleRatio = (role: string): Frac | null => analysis.axles.find((a) => a.role === role)?.ratio ?? null;
    const minuteRatio = axleRatio('minute');
    const rel = (role: 'hour' | 'second') => {
      const r = axleRatio(role);
      if (!r) return null;
      if (minuteRatio && minuteRatio.n !== 0n) return r.div(minuteRatio);
      return r;
    };
    const hour = rel('hour');
    const second = rel('second');
    const hasMinute = Boolean(minuteRatio);

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (playing) {
        // Deliberately relaxed observation rate; relative factors remain exact fractions.
        const minuteRps = 0.018 * speed;
        if (hasMinute) angles.minute += dt * minuteRps * 360;
        if (hour) angles.hour += dt * minuteRps * 360 * hour.toNumber();
        if (second) angles.second += dt * minuteRps * 360 * second.toNumber();
        if (!hasMinute && second) angles.second += dt * 0.16 * speed * 360 * Math.sign(second.toNumber() || 1);
      }
      if (minuteRef.current) minuteRef.current.setAttribute('transform', `rotate(${angles.minute % 360} 60 60)`);
      if (hourRef.current) hourRef.current.setAttribute('transform', `rotate(${angles.hour % 360} 60 60)`);
      if (secondRef.current) secondRef.current.setAttribute('transform', `rotate(${angles.second % 360} 60 60)`);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [analysis, playing, speed]);

  const has = (role: string) => analysis.axles.some((a) => a.role === role && a.ratio);

  return (
    <div className="clock-dial" aria-label="指针读数预览">
      <svg viewBox="0 0 120 120" width="132" height="132">
        <defs>
          <radialGradient id="dialFace" cx="42%" cy="35%" r="70%">
            <stop offset="0%" stopColor="#fff4d6" />
            <stop offset="70%" stopColor="#d8bf86" />
            <stop offset="100%" stopColor="#8b6a3d" />
          </radialGradient>
        </defs>
        <circle cx="60" cy="60" r="55" fill="url(#dialFace)" stroke="#3b2a16" strokeWidth="3" />
        {Array.from({ length: 60 }).map((_, i) => {
          const major = i % 5 === 0;
          const a = (i / 60) * Math.PI * 2;
          return (
            <line
              key={i}
              x1={60 + Math.sin(a) * 49}
              y1={60 - Math.cos(a) * 49}
              x2={60 + Math.sin(a) * (major ? 42 : 46)}
              y2={60 - Math.cos(a) * (major ? 42 : 46)}
              stroke="#3b2a16"
              strokeWidth={major ? 2.2 : 0.8}
            />
          );
        })}
        {[12, 3, 6, 9].map((n, i) => {
          const a = (i / 4) * Math.PI * 2;
          return (
            <text key={n} x={60 + Math.sin(a) * 34} y={64 - Math.cos(a) * 34} textAnchor="middle" fontSize="10" fontWeight="900" fill="#2b1d0d">
              {n}
            </text>
          );
        })}
        {has('hour') && (
          <g ref={hourRef}>
            <line x1="60" y1="64" x2="60" y2="34" stroke="#1f2937" strokeWidth="5" strokeLinecap="round" />
          </g>
        )}
        {has('minute') && (
          <g ref={minuteRef}>
            <line x1="60" y1="66" x2="60" y2="24" stroke="#111827" strokeWidth="3.2" strokeLinecap="round" />
          </g>
        )}
        {has('second') && (
          <g ref={secondRef}>
            <line x1="60" y1="70" x2="60" y2="18" stroke="#dc2626" strokeWidth="1.4" strokeLinecap="round" />
          </g>
        )}
        <circle cx="60" cy="60" r="5" fill="#7c2d12" stroke="#fde68a" strokeWidth="1.5" />
      </svg>
      <span>
        {has('hour') || has('minute') ? '时/分针按 12:1 联动' : has('second') ? '秒轴读数' : '连接指针轴后显示'}
      </span>
    </div>
  );
}
