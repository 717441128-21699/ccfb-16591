import { useEffect, useRef } from 'react';
import { getGearSpec, outerRadiusMm } from '../game/gears';
import { analyzeMeshes, analyzeTrain } from '../game/engine';
import { clampToBoard, resolveDrop, type DropTarget } from '../game/geometry';
import {
  clientToMm,
  drawAxleBadges,
  drawBoard,
  drawGear,
  drawMeshLinks,
  makeView,
  type ViewTransform,
} from '../game/render';
import type { LevelDef, PlacedGear, TrainAnalysis } from '../game/types';
import type { DragState } from './dragTypes';

interface GearCanvasProps {
  level: LevelDef;
  gears: PlacedGear[];
  analysis: TrainAnalysis;
  selectedUid: string | null;
  playing: boolean;
  speed: number;
  exploded: boolean;
  showForces: boolean;
  dragRef: React.MutableRefObject<DragState | null>;
  canvasRef: React.MutableRefObject<HTMLCanvasElement | null>;
  onSelect: (uid: string | null) => void;
  onMoveRelease: (axleId: string, target: DropTarget) => void;
}

export function computePhases(gears: PlacedGear[], meshes: ReturnType<typeof analyzeMeshes>) {
  const phase = new Map<string, number>();
  const adj = new Map<string, typeof meshes>();
  for (const uid of gears.map((g) => g.uid)) adj.set(uid, []);
  for (const m of meshes) {
    if (!m.ok) continue;
    adj.get(m.a)?.push(m);
    adj.get(m.b)?.push(m);
  }
  for (const root of gears) {
    if (phase.has(root.uid)) continue;
    phase.set(root.uid, 0);
    const queue = [root.uid];
    while (queue.length) {
      const uid = queue.shift()!;
      for (const m of adj.get(uid) ?? []) {
        const otherUid = m.a === uid ? m.b : m.a;
        if (phase.has(otherUid)) continue;
        const ug = gears.find((g) => g.uid === uid)!;
        const og = gears.find((g) => g.uid === otherUid)!;
        const us = getGearSpec(ug.specId);
        const os = getGearSpec(og.specId);
        const thetaU = phase.get(uid)!;
        const phi = Math.atan2(og.y - ug.y, og.x - ug.x);
        const featureU = (us.teeth * (phi - thetaU)) / (Math.PI * 2);
        const thetaV = phi + Math.PI - ((Math.PI * 2) / os.teeth) * (featureU + 0.5);
        phase.set(otherUid, thetaV);
        queue.push(otherUid);
      }
    }
  }
  return phase;
}

export function GearCanvas(props: GearCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ViewTransform | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const anglesRef = useRef(new Map<string, number>());
  const sizeRef = useRef({ width: 800, height: 520, dpr: 1 });

  useEffect(() => {
    const wrap = wrapRef.current!;
    const canvas = props.canvasRef.current!;
    const observer = new ResizeObserver(() => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: rect.width, height: rect.height, dpr };
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      viewRef.current = makeView(propsRef.current.level.board, rect.width, rect.height);
    });
    observer.observe(wrap);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const render = (now: number) => {
      raf = requestAnimationFrame(render);
      const p = propsRef.current;
      const canvas = p.canvasRef.current;
      const view = viewRef.current;
      if (!canvas || !view) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const { dpr } = sizeRef.current;

      const drag = p.dragRef.current;
      let displayGears = p.gears;
      let moveCenter: { axleId: string; x: number; y: number } | null = null;
      if (drag?.kind === 'move') {
        const cx = drag.px - drag.grabDx;
        const cy = drag.py - drag.grabDy;
        moveCenter = { axleId: drag.axleId, x: cx, y: cy };
        displayGears = p.gears.map((g) =>
          g.axleId === drag.axleId ? { ...g, x: cx, y: cy } : g,
        );
      }

      const ghost: PlacedGear | null =
        drag?.kind === 'new' && drag.inside
          ? { uid: '__ghost__', specId: drag.specId, axleId: '__ghostAxle__', x: drag.x, y: drag.y, layer: 0 }
          : null;
      const meshSource = ghost ? [...displayGears, ghost] : displayGears;
      const liveMeshes = drag ? analyzeMeshes(meshSource) : p.analysis.meshes;
      const phases = computePhases(meshSource, liveMeshes.filter((m) => m.ok));

      // Choose a source speed that keeps the fastest visible axle readable while preserving exact ratios.
      let maxRatio = 1;
      for (const axle of p.analysis.axles) {
        if (axle.ratio) maxRatio = Math.max(maxRatio, Math.abs(axle.ratio.toNumber()));
      }
      const visualSourceRps = (0.22 * Math.min(1, 5 / maxRatio)) * p.speed;
      if (p.playing) {
        for (const axle of p.analysis.axles) {
          if (!axle.ratio) continue;
          const prev = anglesRef.current.get(axle.id) ?? 0;
          anglesRef.current.set(axle.id, prev + dt * visualSourceRps * Math.PI * 2 * axle.ratio.toNumber());
        }
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, sizeRef.current.width, sizeRef.current.height);
      ctx.setTransform(dpr, 0, 0, dpr, view.offsetX * dpr, view.offsetY * dpr);
      ctx.scale(view.scale, view.scale);
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, p.level.board.width, p.level.board.height);
      ctx.clip();

      drawBoard(ctx, p.level);

      const gearById = new Map(meshSource.map((g) => [g.uid, g]));
      drawMeshLinks(ctx, liveMeshes, gearById);

      // Exploded-view offsets for coaxial layers.
      const axleLayerCounts = new Map<string, number>();
      for (const g of displayGears) axleLayerCounts.set(g.axleId, Math.max(axleLayerCounts.get(g.axleId) ?? 0, g.layer + 1));
      const renderPos = (g: PlacedGear) => {
        if (!p.exploded) return { x: g.x, y: g.y };
        const count = axleLayerCounts.get(g.axleId) ?? 1;
        const offset = (g.layer - (count - 1) / 2) * 8.5;
        return { x: g.x + offset * 0.28, y: g.y - offset };
      };

      if (p.exploded) {
        ctx.save();
        ctx.strokeStyle = 'rgba(165,243,252,.45)';
        ctx.setLineDash([1.4, 1.4]);
        ctx.lineWidth = 0.45;
        for (const g of displayGears) {
          const pos = renderPos(g);
          ctx.beginPath();
          ctx.moveTo(g.x, g.y);
          ctx.lineTo(pos.x, pos.y);
          ctx.stroke();
        }
        ctx.restore();
      }

      for (const g of displayGears) {
        const spec = getGearSpec(g.specId);
        const pos = renderPos(g);
        const axleAngle = anglesRef.current.get(g.axleId) ?? 0;
        const phase = phases.get(g.uid) ?? 0;
        const hasInvalid = p.analysis.meshes.some((m) => !m.ok && (m.a === g.uid || m.b === g.uid));
        drawGear(ctx, spec, pos.x, pos.y, axleAngle + phase, view, dpr, {
          selected: p.selectedUid === g.uid,
          invalid: hasInvalid,
        });
      }

      if (ghost && drag?.kind === 'new') {
        const spec = getGearSpec(ghost.specId);
        const ghostMeshes = liveMeshes.filter((m) => m.a === '__ghost__' || m.b === '__ghost__');
        const bad = ghostMeshes.some((m) => !m.ok);
        drawGear(ctx, spec, ghost.x, ghost.y, performance.now() / 1400, view, dpr, {
          alpha: 0.62,
          ghost: true,
          selected: true,
          invalid: bad,
        });
        ctx.save();
        ctx.font = '3.7px "Microsoft YaHei", system-ui, sans-serif';
        ctx.textAlign = 'center';
        const text = bad ? '松开：啮合失败' : ghostMeshes.length ? '松开：可以啮合' : '松开：建立新轴';
        const w = ctx.measureText(text).width + 3;
        ctx.fillStyle = bad ? 'rgba(127,29,29,.9)' : 'rgba(6,78,59,.9)';
        ctx.fillRect(ghost.x - w / 2, ghost.y - outerRadiusMm(spec) - 8, w, 5.2);
        ctx.fillStyle = '#ecfeff';
        ctx.fillText(text, ghost.x, ghost.y - outerRadiusMm(spec) - 4.3);
        ctx.restore();
      }

      if (p.showForces) {
        ctx.save();
        ctx.font = '2.9px ui-monospace, monospace';
        ctx.textAlign = 'center';
        for (const row of p.analysis.gearRows) {
          const g = displayGears.find((item) => item.uid === row.uid);
          if (!g || row.tangentialForceN === null) continue;
          const pos = renderPos(g);
          const text = `${row.revPerHour?.toFixed(1) ?? '?'}r/h · Ft${row.tangentialForceN.toFixed(2)}N`;
          const w = ctx.measureText(text).width + 1.6;
          const y = pos.y + outerRadiusMm(row.spec) + 2.2;
          ctx.fillStyle = 'rgba(15,23,42,.82)';
          ctx.fillRect(pos.x - w / 2, y, w, 3.8);
          ctx.fillStyle = '#fde68a';
          ctx.fillText(text, pos.x, y + 2.8);
        }
        ctx.restore();
      }

      drawAxleBadges(
        ctx,
        p.analysis.axles.map((a) => ({ id: a.id, x: a.x, y: a.y, ratio: a.ratio, speedRevPerHour: a.speedRevPerHour })),
      );

      if (moveCenter) {
        ctx.save();
        ctx.strokeStyle = 'rgba(103,232,249,.8)';
        ctx.lineWidth = 0.7;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.arc(moveCenter.x, moveCenter.y, 4.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      ctx.restore();
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  function getMm(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return clientToMm(e.clientX, e.clientY, rect, viewRef.current!);
  }

  function hitGear(mm: { x: number; y: number }) {
    for (let i = props.gears.length - 1; i >= 0; i--) {
      const g = props.gears[i];
      const r = outerRadiusMm(getGearSpec(g.specId)) + 1.8;
      if (Math.hypot(g.x - mm.x, g.y - mm.y) <= r) return g;
    }
    return null;
  }

  return (
    <div ref={wrapRef} className="canvas-wrap">
      <canvas
        ref={props.canvasRef}
        className="gear-canvas"
        onPointerDown={(e) => {
          if (!viewRef.current) return;
          const mm = getMm(e);
          const hit = hitGear(mm);
          if (hit) {
            props.onSelect(hit.uid);
            e.currentTarget.setPointerCapture(e.pointerId);
            props.dragRef.current = {
              kind: 'move',
              axleId: hit.axleId,
              pointerId: e.pointerId,
              px: mm.x,
              py: mm.y,
              grabDx: mm.x - hit.x,
              grabDy: mm.y - hit.y,
            };
          } else {
            props.onSelect(null);
          }
        }}
        onPointerMove={(e) => {
          const drag = props.dragRef.current;
          if (!drag || drag.kind !== 'move' || drag.pointerId !== e.pointerId || !viewRef.current) return;
          const mm = getMm(e);
          drag.px = mm.x;
          drag.py = mm.y;
        }}
        onPointerUp={(e) => {
          const drag = props.dragRef.current;
          if (!drag || drag.kind !== 'move' || drag.pointerId !== e.pointerId || !viewRef.current) return;
          const mm = getMm(e);
          let cx = mm.x - drag.grabDx;
          let cy = mm.y - drag.grabDy;
          const clamped = clampToBoard(cx, cy, props.level.board.width, props.level.board.height, 8);
          cx = clamped.x;
          cy = clamped.y;
          const target = resolveDrop(cx, cy, props.level.id, props.level.holes, props.gears, {
            movingAxleId: drag.axleId,
          });
          props.onMoveRelease(drag.axleId, target);
          props.dragRef.current = null;
          try {
            e.currentTarget.releasePointerCapture(e.pointerId);
          } catch {
            // pointer capture may already be gone
          }
        }}
        onPointerCancel={() => {
          props.dragRef.current = null;
        }}
      />
      <div className="canvas-hint">滚轮外的画布会自适应缩放；拖动齿轮可移动整根同轴轴，落到另一轴上可合并同轴。</div>
    </div>
  );
}

// Re-export for callers that want a one-off analysis with the same engine configuration.
export { analyzeTrain };
