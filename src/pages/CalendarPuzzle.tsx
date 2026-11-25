import { useEffect, useMemo, useRef, useState } from 'react';
import { GearIcon } from '../components/GearIcon';
import { simulateCalendar, type CalendarSimulationResult } from '../game/calendar';
import { clientToMm, makeView } from '../game/render';
import { getGearSpec } from '../game/gears';
import { actions, useAppState } from '../game/store';
import type { CalendarPartState, LevelDef } from '../game/types';

type PartKey = keyof CalendarPartState;

interface PartMeta {
  key: PartKey;
  name: string;
  desc: string;
  gearSpecId?: string;
}

const PARTS: PartMeta[] = [
  { key: 'dateWheel', name: '31齿日历环', desc: '每天只走一齿；短月末由杠杆补跳。', gearSpecId: 'z36-m1.5' },
  { key: 'monthCam', name: '12月大小月凸轮', desc: '轮廓记录 31/30/28 天月份。', gearSpecId: 'z48-m1.5' },
  { key: 'leapCam', name: '四年闰年凸轮', desc: '2024、2028 等闰年把二月改为29天。', gearSpecId: 'z24-m1' },
  { key: 'lever', name: '跳日杠杆', desc: '跌入凸轮缺口后拨动日历环。' },
  { key: 'spring', name: '复位弹簧', desc: '让杠杆每次跳日后回到凸轮表面。' },
];

interface CalendarDrag {
  part: PartKey;
  x: number;
  y: number;
  inside: boolean;
}

interface BadMarker {
  id: number;
  x: number;
  y: number;
  text: string;
}

export function CalendarPuzzle({ level }: { level: LevelDef }) {
  const parts = useAppState((s) => s.calendar[level.id]!);
  const completed = useAppState((s) => Boolean(s.progress.completed[level.id]));
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<CalendarDrag | null>(null);
  const badMarkersRef = useRef<BadMarker[]>([]);
  const [badMarkers, setBadMarkers] = useState<BadMarker[]>([]);
  const [result, setResult] = useState<CalendarSimulationResult | null>(null);
  const [runToken, setRunToken] = useState(0);
  const [message, setMessage] = useState('把五个机构拖到对应虚线安装位；也可使用“自动装配”。');

  const installedCount = Object.values(parts).filter(Boolean).length;
  const allInstalled = installedCount === 5;

  const slotByKey = useMemo(() => new Map(level.calendarSlots?.map((s) => [s.id, s])), [level]);

  function addBadMarker(x: number, y: number, text: string) {
    const marker = { id: Date.now() + Math.random(), x, y, text };
    badMarkersRef.current = [...badMarkersRef.current, marker];
    setBadMarkers(badMarkersRef.current);
    window.setTimeout(() => {
      badMarkersRef.current = badMarkersRef.current.filter((m) => m.id !== marker.id);
      setBadMarkers(badMarkersRef.current);
    }, 2600);
  }

  function startPartDrag(e: React.PointerEvent, part: PartKey) {
    e.preventDefault();
    const drag: CalendarDrag = { part, x: 0, y: 0, inside: false };
    dragRef.current = drag;
    const onMove = (ev: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      drag.inside = ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom;
      if (drag.inside) {
        const view = makeView(level.board, rect.width, rect.height);
        const mm = clientToMm(ev.clientX, ev.clientY, rect, view);
        drag.x = mm.x;
        drag.y = mm.y;
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      if (drag.inside) {
        const slots = level.calendarSlots ?? [];
        const hit = slots
          .map((s) => ({ s, d: Math.hypot(s.x - drag.x, s.y - drag.y) }))
          .filter((v) => v.d <= 20)
          .sort((a, b) => a.d - b.d)[0];
        if (!hit) {
          addBadMarker(drag.x, drag.y, '没有对准安装位');
          setMessage('请拖到发光的虚线安装位。');
        } else if (hit.s.id !== part) {
          actions.setCalendarPart(level.id, hit.s.id, false);
          addBadMarker(hit.s.x, hit.s.y, `装不上：这是“${hit.s.label}”`);
          setMessage(`零件与安装位不匹配：${hit.s.label}。`);
        } else {
          actions.setCalendarPart(level.id, part, true);
          setMessage(`${PARTS.find((p) => p.key === part)?.name} 安装正确。`);
        }
      }
      dragRef.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  }

  function runTest() {
    const sim = simulateCalendar(parts, 2024, 48);
    setResult(sim);
    setRunToken((n) => n + 1);
    if (sim.ok) {
      actions.completeLevel(level.id);
      setMessage('48个月全部正确：包含2024闰年二月29天，以及2025—2027平年二月28天。');
    } else {
      setMessage(sim.errors[0] ?? '机构未装齐。');
    }
  }

  function autoInstall() {
    PARTS.map((p) => p.key).forEach((key) => actions.setCalendarPart(level.id, key, true));
    setMessage('已自动装配全部凸轮与杠杆，可以运行测试。');
  }

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const observer = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    });
    observer.observe(wrap);
    let raf = 0;
    const start = performance.now();

    const draw = (now: number) => {
      raf = requestAnimationFrame(draw);
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(devicePixelRatio || 1, 2);
      const view = makeView(level.board, rect.width, rect.height);
      const ctx = canvas.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.setTransform(dpr, 0, 0, dpr, view.offsetX * dpr, view.offsetY * dpr);
      ctx.scale(view.scale, view.scale);

      // board
      ctx.fillStyle = '#241a12';
      ctx.beginPath();
      ctx.roundRect(0, 0, level.board.width, level.board.height, 8);
      ctx.fill();
      ctx.strokeStyle = '#8b6a3d';
      ctx.lineWidth = 1;
      ctx.stroke();

      const t = (now - start) / 1000;
      let displayYear = 2024;
      let displayMonth = 1;
      let displayDays = 1;
      let extra = 0;
      let leverKick = 0;
      if (result && runToken > 0) {
        const elapsed = (now - start) / 1000;
        const idx = Math.min(result.months.length - 1, Math.floor(elapsed / 0.18));
        const m = result.months[idx];
        if (m) {
          displayYear = m.year;
          displayMonth = m.month;
          displayDays = m.days;
          extra = m.extraJumps;
          const phase = (elapsed % 0.18) / 0.18;
          if (phase < 0.35) leverKick = Math.sin((phase / 0.35) * Math.PI);
        }
      }

      drawDateWheel(ctx, slotByKey.get('dateWheel')!, parts.dateWheel, t, displayYear, displayMonth, displayDays, extra, leverKick);
      drawMonthCam(ctx, slotByKey.get('monthCam')!, parts.monthCam, t * 0.15);
      drawLeapCam(ctx, slotByKey.get('leapCam')!, parts.leapCam, displayYear);
      drawLever(ctx, slotByKey.get('lever')!, parts.lever, leverKick);
      drawSpring(ctx, slotByKey.get('spring')!, parts.spring, leverKick);

      // slot labels / missing outlines are included in each draw helper via slot.
      for (const slot of level.calendarSlots ?? []) {
        const installed = parts[slot.id];
        if (installed) continue;
        ctx.save();
        ctx.setLineDash([2, 1.5]);
        ctx.strokeStyle = 'rgba(251,191,36,.75)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(slot.x, slot.y, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.font = '3.5px "Microsoft YaHei", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fde68a';
        const words = slot.label.length > 7 ? [slot.label.slice(0, 7), slot.label.slice(7)] : [slot.label];
        words.forEach((w, i) => ctx.fillText(w, slot.x, slot.y + 18 + i * 4));
        ctx.restore();
      }

      for (const marker of badMarkersRef.current) {
        ctx.save();
        ctx.translate(marker.x, marker.y);
        ctx.fillStyle = 'rgba(220,38,38,.95)';
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 0.5);
        ctx.font = '3.8px "Microsoft YaHei", sans-serif';
        const w = ctx.measureText(marker.text).width + 3;
        ctx.fillStyle = 'rgba(69,10,10,.92)';
        ctx.fillRect(-w / 2, 9, w, 6);
        ctx.fillStyle = '#fecaca';
        ctx.fillText(marker.text, 0, 12);
        ctx.restore();
      }

      const drag = dragRef.current;
      if (drag?.inside) {
        const meta = PARTS.find((p) => p.key === drag.part)!;
        ctx.save();
        ctx.globalAlpha = 0.75;
        ctx.translate(drag.x, drag.y);
        ctx.fillStyle = '#67e8f9';
        ctx.beginPath();
        ctx.arc(0, 0, 10 + Math.sin(t * 8) * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#083344';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.name.slice(0, 1), 0, 0.5);
        ctx.restore();
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [level, parts, result, runToken, slotByKey]);

  return (
    <div className="workbench-grid calendar-grid">
      <aside className="panel gear-pile">
        <div className="panel-title"><h3>机构零件盒</h3><span>{installedCount}/5</span></div>
        <p className="panel-hint">拖到 Canvas 上同名的虚线安装位；放错会立即弹红。</p>
        <div className="calendar-parts">
          {PARTS.map((p) => {
            const spec = p.gearSpecId ? getGearSpec(p.gearSpecId) : null;
            return (
              <button
                key={p.key}
                className={`calendar-part-card ${parts[p.key] ? 'installed' : ''}`}
                onPointerDown={(e) => startPartDrag(e, p.key)}
              >
                {spec ? <GearIcon spec={spec} size={48} /> : <PartGlyph part={p.key} />}
                <div>
                  <b>{p.name}</b>
                  <span>{p.desc}</span>
                </div>
                {parts[p.key] && <em>已装 ✓</em>}
              </button>
            );
          })}
        </div>
        <button className="btn secondary" onClick={autoInstall}>自动装配（无障碍）</button>
      </aside>

      <main className="canvas-column">
        <div className="canvas-toolbar panel">
          <button className="btn primary" onClick={runTest} disabled={!allInstalled}>
            ▶ 快进 2024—2027（48个月）
          </button>
          <span className="toolbar-message">{message}</span>
        </div>
        <div className="canvas-shell panel calendar-shell">
          <div className="canvas-wrap" ref={wrapRef}>
            <canvas ref={canvasRef} className="gear-canvas" />
          </div>
        </div>
      </main>

      <aside className="panel inspector">
        <div className="panel-title"><h3>跳日记录</h3>{completed && <span className="completed-pill">已通过</span>}</div>
        {!result && <p className="panel-hint">安装凸轮与杠杆后运行测试。30天月额外跳1齿，平年2月额外跳3齿，闰年2月额外跳2齿。</p>}
        {result && (
          <>
            <div className={`test-summary ${result.ok ? 'good' : 'bad'}`}>
              {result.ok ? '48个月全部正确跳日' : result.errors.join('；')}
              <small>累计补跳 {result.totalExtraJumps} 齿</small>
            </div>
            <div className="month-table">
              {result.months.map((m) => (
                <div key={`${m.year}-${m.month}`} className={`month-row days-${m.days}`}>
                  <span>{m.year}.{String(m.month).padStart(2, '0')}</span>
                  <b>{m.days}天</b>
                  <code>+{m.extraJumps}跳</code>
                </div>
              ))}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function PartGlyph({ part }: { part: PartKey }) {
  const text = part === 'lever' ? '╱' : part === 'spring' ? '〰' : '◉';
  return <div className="part-glyph">{text}</div>;
}

type Slot = NonNullable<LevelDef['calendarSlots']>[number];

function drawSlotBase(ctx: CanvasRenderingContext2D, slot: Slot | undefined, installed: boolean) {
  if (!slot) return null;
  ctx.save();
  ctx.translate(slot.x, slot.y);
  if (!installed) {
    ctx.setLineDash([2, 1.4]);
    ctx.strokeStyle = 'rgba(251,191,36,.55)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.arc(0, 0, 17, 0, Math.PI * 2);
    ctx.stroke();
  }
  return ctx;
}

function drawDateWheel(ctx: CanvasRenderingContext2D, slot: Slot | undefined, installed: boolean, t: number, y: number, m: number, days: number, extra: number, kick: number) {
  if (!slot) return;
  const c = drawSlotBase(ctx, slot, installed);
  if (!c) return;
  if (installed) {
    ctx.rotate(t * 0.08 + kick * 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, 43, 0, Math.PI * 2);
    ctx.fillStyle = '#f3e3bd';
    ctx.fill();
    ctx.strokeStyle = '#7c5a27';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    for (let i = 1; i <= 31; i++) {
      const a = (i / 31) * Math.PI * 2 - Math.PI / 2;
      const r1 = 38;
      const r2 = i % 5 === 0 ? 33 : 35.5;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * r1, Math.sin(a) * r1);
      ctx.lineTo(Math.cos(a) * r2, Math.sin(a) * r2);
      ctx.strokeStyle = '#5b4321';
      ctx.lineWidth = 0.55;
      ctx.stroke();
      if (i === 1 || i === 15 || i === 30 || i === days) {
        ctx.save();
        ctx.translate(Math.cos(a) * 29, Math.sin(a) * 29);
        ctx.rotate(a + Math.PI / 2);
        ctx.font = 'bold 4px ui-monospace, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#3f2d13';
        ctx.fillText(String(i), 0, 0);
        ctx.restore();
      }
    }
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, Math.PI * 2);
    ctx.fillStyle = '#8b6a3d';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(slot.x, slot.y);
    ctx.font = 'bold 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#1f2937';
    ctx.fillText(String(days), 0, 0.5);
    ctx.font = '3.4px sans-serif';
    ctx.fillStyle = extra ? '#b91c1c' : '#374151';
    ctx.fillText(`${y}.${m}${extra ? ` +${extra}` : ''}`, 0, 11);
    ctx.restore();
  } else ctx.restore();
}

function drawMonthCam(ctx: CanvasRenderingContext2D, slot: Slot | undefined, installed: boolean, rot: number) {
  if (!slot) return;
  const c = drawSlotBase(ctx, slot, installed);
  if (!c) return;
  if (installed) {
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i <= 120; i++) {
      const month = Math.floor(i / 10) % 12;
      const len = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month];
      const rad = 15 + (len - 28) * 0.9;
      const a = (i / 120) * Math.PI * 2;
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = '#c9933c';
    ctx.fill();
    ctx.strokeStyle = '#443018';
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2118';
    ctx.fill();
  }
  ctx.restore();
}

function drawLeapCam(ctx: CanvasRenderingContext2D, slot: Slot | undefined, installed: boolean, year: number) {
  if (!slot) return;
  const c = drawSlotBase(ctx, slot, installed);
  if (!c) return;
  if (installed) {
    const leap = (year - 2024) % 4 === 0;
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = leap ? '#7c3aed' : '#64748b';
    ctx.fillRect(-13, -13, 26, 26);
    ctx.strokeStyle = '#1e1b4b';
    ctx.lineWidth = 0.8;
    ctx.strokeRect(-13, -13, 26, 26);
    ctx.rotate(-Math.PI / 4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 5px ui-monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(leap ? '29' : '28', 0, 0);
  }
  ctx.restore();
}

function drawLever(ctx: CanvasRenderingContext2D, slot: Slot | undefined, installed: boolean, kick: number) {
  if (!slot) return;
  const c = drawSlotBase(ctx, slot, installed);
  if (!c) return;
  if (installed) {
    ctx.rotate(-0.5 + kick * 0.55);
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-34, -18);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#475569';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-34, -18, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fill();
  }
  ctx.restore();
}

function drawSpring(ctx: CanvasRenderingContext2D, slot: Slot | undefined, installed: boolean, kick: number) {
  if (!slot) return;
  const c = drawSlotBase(ctx, slot, installed);
  if (!c) return;
  if (installed) {
    ctx.strokeStyle = '#93c5fd';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
      const x = -12 + i * 3;
      const y = (i % 2 ? -4 : 4) * (1 - kick * 0.25);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}
