import { outerRadiusMm, pitchRadiusMm } from './gears';
import type { GearSpec, LevelDef, MeshCheck, PlacedGear } from './types';

export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  cssWidth: number;
  cssHeight: number;
}

export function makeView(board: { width: number; height: number }, cssWidth: number, cssHeight: number): ViewTransform {
  const pad = 18;
  const scale = Math.min((cssWidth - pad * 2) / board.width, (cssHeight - pad * 2) / board.height);
  const drawnW = board.width * scale;
  const drawnH = board.height * scale;
  return {
    scale,
    offsetX: (cssWidth - drawnW) / 2,
    offsetY: (cssHeight - drawnH) / 2,
    cssWidth,
    cssHeight,
  };
}

export function clientToMm(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  view: ViewTransform,
): { x: number; y: number } {
  const px = clientX - rect.left - view.offsetX;
  const py = clientY - rect.top - view.offsetY;
  return { x: px / view.scale, y: py / view.scale };
}

const spriteCache = new Map<string, HTMLCanvasElement>();

function materialColors(material: GearSpec['material']) {
  if (material === 'steel') return { hi: '#f1f5f9', mid: '#9aa6b2', lo: '#4b5563', stroke: '#26303a' };
  if (material === 'blued') return { hi: '#c7d8f2', mid: '#5d7fa8', lo: '#20344d', stroke: '#102033' };
  return { hi: '#ffe6a1', mid: '#d29a3e', lo: '#76501c', stroke: '#443018' };
}

function gearPath(ctx: CanvasRenderingContext2D, spec: GearSpec) {
  const z = spec.teeth;
  const m = spec.module;
  const r = pitchRadiusMm(spec);
  const ra = outerRadiusMm(spec);
  const rf = Math.max(m * 1.4, r - 1.25 * m);
  const pitch = (Math.PI * 2) / z;

  ctx.beginPath();
  for (let i = 0; i < z; i++) {
    const c = i * pitch;
    const points: [number, number][] = [
      [rf, c - pitch * 0.43],
      [ra, c - pitch * 0.2],
      [ra, c + pitch * 0.2],
      [rf, c + pitch * 0.43],
    ];
    points.forEach(([rad, a], idx) => {
      const x = Math.cos(a) * rad;
      const y = Math.sin(a) * rad;
      if (i === 0 && idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    const next = (i + 1) * pitch - pitch * 0.43;
    ctx.lineTo(Math.cos(next) * rf, Math.sin(next) * rf);
  }
  ctx.closePath();
}

function createGearSprite(spec: GearSpec, pxPerMm: number, dpr: number): HTMLCanvasElement {
  const margin = 2.2;
  const sizeMm = outerRadiusMm(spec) * 2 + margin * 2;
  const key = `${spec.id}-${Math.round(pxPerMm * 100)}-${dpr}`;
  const cached = spriteCache.get(key);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(sizeMm * pxPerMm * dpr);
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr * pxPerMm, dpr * pxPerMm);
  ctx.translate(sizeMm / 2, sizeMm / 2);

  const r = pitchRadiusMm(spec);
  const ra = outerRadiusMm(spec);
  const colors = materialColors(spec.material);

  gearPath(ctx, spec);
  const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, ra + margin);
  grad.addColorStop(0, colors.hi);
  grad.addColorStop(0.55, colors.mid);
  grad.addColorStop(1, colors.lo);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 0.45;
  ctx.strokeStyle = colors.stroke;
  ctx.stroke();

  // Lightening holes are genuinely cut from the sprite.
  if (spec.teeth >= 22 && r > 9) {
    const holes = spec.teeth >= 50 ? 6 : 5;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * Math.PI * 2;
      const hx = Math.cos(a) * r * 0.52;
      const hy = Math.sin(a) * r * 0.52;
      ctx.moveTo(hx + r * 0.17, hy);
      ctx.arc(hx, hy, r * 0.17, 0, Math.PI * 2);
    }
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    for (let i = 0; i < holes; i++) {
      const a = (i / holes) * Math.PI * 2;
      const hx = Math.cos(a) * r * 0.52;
      const hy = Math.sin(a) * r * 0.52;
      ctx.moveTo(hx + r * 0.17, hy);
      ctx.arc(hx, hy, r * 0.17, 0, Math.PI * 2);
    }
    ctx.lineWidth = 0.35;
    ctx.strokeStyle = 'rgba(55,35,12,.55)';
    ctx.stroke();
  }

  const hubR = Math.max(2.4, r * 0.2);
  const hubGrad = ctx.createRadialGradient(-hubR * 0.3, -hubR * 0.35, 0.2, 0, 0, hubR);
  hubGrad.addColorStop(0, colors.hi);
  hubGrad.addColorStop(1, colors.lo);
  ctx.beginPath();
  ctx.arc(0, 0, hubR, 0, Math.PI * 2);
  ctx.fillStyle = hubGrad;
  ctx.fill();
  ctx.lineWidth = 0.35;
  ctx.strokeStyle = colors.stroke;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(0, 0, Math.max(1.1, spec.module * 1.15), 0, Math.PI * 2);
  ctx.fillStyle = '#241a12';
  ctx.fill();
  ctx.lineWidth = 0.25;
  ctx.strokeStyle = 'rgba(255,240,200,.35)';
  ctx.stroke();

  spriteCache.set(key, canvas);
  if (spriteCache.size > 120) {
    const firstKey = spriteCache.keys().next().value;
    if (firstKey) spriteCache.delete(firstKey);
  }
  return canvas;
}

export function drawGear(
  ctx: CanvasRenderingContext2D,
  spec: GearSpec,
  x: number,
  y: number,
  angleRad: number,
  view: ViewTransform,
  dpr: number,
  opts: { alpha?: number; ghost?: boolean; selected?: boolean; invalid?: boolean } = {},
) {
  const sprite = createGearSprite(spec, view.scale, dpr);
  const sizeMm = outerRadiusMm(spec) * 2 + 4.4;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angleRad);
  ctx.globalAlpha = opts.alpha ?? 1;
  if (opts.ghost) {
    ctx.shadowColor = 'rgba(95,183,201,.8)';
    ctx.shadowBlur = 8;
  }
  ctx.drawImage(sprite, -sizeMm / 2, -sizeMm / 2, sizeMm, sizeMm);
  ctx.restore();

  if (opts.selected || opts.invalid) {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.arc(0, 0, outerRadiusMm(spec) + 1.4, 0, Math.PI * 2);
    ctx.lineWidth = opts.invalid ? 0.9 : 0.65;
    ctx.setLineDash(opts.invalid ? [2.2, 1.4] : [3, 1.6]);
    ctx.strokeStyle = opts.invalid ? '#ff5d5d' : '#67e8f9';
    ctx.stroke();
    ctx.restore();
  }
}

export function drawBoard(ctx: CanvasRenderingContext2D, level: { board: LevelDef['board']; holes?: LevelDef['holes'] }) {
  const { width, height } = level.board;
  ctx.save();
  const radius = 7;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, radius);
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#3b2c1d');
  bg.addColorStop(0.5, '#241a12');
  bg.addColorStop(1, '#17100b');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = '#8b6a3d';
  ctx.stroke();

  // Fine pegboard grid.
  ctx.fillStyle = 'rgba(230,201,143,.22)';
  for (let x = 10; x < width; x += 10) {
    for (let y = 10; y < height; y += 10) {
      ctx.beginPath();
      ctx.arc(x, y, 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.strokeStyle = 'rgba(230,201,143,.08)';
  ctx.lineWidth = 0.25;
  for (let x = 0; x <= width; x += 20) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 20) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Fixed labelled holes.
  for (const hole of level.holes ?? []) {
    const isRole = Boolean(hole.role && hole.role !== 'generic');
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, isRole ? 3.2 : 2.1, 0, Math.PI * 2);
    ctx.fillStyle = isRole ? 'rgba(103,232,249,.16)' : 'rgba(0,0,0,.42)';
    ctx.fill();
    ctx.lineWidth = isRole ? 0.65 : 0.45;
    ctx.strokeStyle = isRole ? '#67e8f9' : 'rgba(226,196,135,.55)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(hole.x, hole.y, 0.9, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0906';
    ctx.fill();

    if (hole.label) {
      ctx.font = '3.6px "Microsoft YaHei", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelY = hole.y + 4.2;
      const metrics = ctx.measureText(hole.label);
      ctx.fillStyle = 'rgba(12,9,6,.72)';
      ctx.fillRect(hole.x - metrics.width / 2 - 1.2, labelY - 0.6, metrics.width + 2.4, 4.7);
      ctx.fillStyle = isRole ? '#a5f3fc' : '#e8d5aa';
      ctx.fillText(hole.label, hole.x, labelY);
    }
  }
  ctx.restore();
}

export function drawMeshLinks(ctx: CanvasRenderingContext2D, meshes: MeshCheck[], gearById: Map<string, PlacedGear>) {
  for (const mesh of meshes) {
    const a = gearById.get(mesh.a);
    const b = gearById.get(mesh.b);
    if (!a || !b) continue;
    ctx.save();
    ctx.lineWidth = mesh.ok ? 0.7 : 1.1;
    ctx.strokeStyle = mesh.ok ? 'rgba(110,231,183,.72)' : 'rgba(255,93,93,.95)';
    ctx.setLineDash(mesh.ok ? [] : [2.4, 1.5]);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(mx, my, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = mesh.ok ? 'rgba(16,185,129,.92)' : 'rgba(220,38,38,.96)';
    ctx.fill();
    ctx.strokeStyle = '#fff7ed';
    ctx.lineWidth = 0.45;
    ctx.stroke();
    ctx.font = 'bold 4.2px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(mesh.ok ? '✓' : '!', mx, my + 0.1);

    if (!mesh.ok && mesh.reasons[0]) {
      ctx.font = '3.4px "Microsoft YaHei", system-ui, sans-serif';
      const text = mesh.reasons[0];
      const w = ctx.measureText(text).width + 2.4;
      ctx.fillStyle = 'rgba(60,10,10,.88)';
      ctx.fillRect(mx - w / 2, my + 4, w, 5.2);
      ctx.fillStyle = '#fecaca';
      ctx.fillText(text, mx, my + 6.6);
    }
    ctx.restore();
  }
}

export function drawAxleBadges(
  ctx: CanvasRenderingContext2D,
  axles: { id: string; x: number; y: number; ratio: { toFixed: (n: number) => string } | null; speedRevPerHour: number | null }[],
) {
  for (const axle of axles) {
    if (axle.speedRevPerHour === null) continue;
    ctx.save();
    ctx.font = 'bold 3.3px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    const text = `${axle.speedRevPerHour >= 0 ? '+' : ''}${axle.speedRevPerHour.toFixed(2)} r/h`;
    const w = ctx.measureText(text).width + 2;
    ctx.fillStyle = 'rgba(8,47,73,.82)';
    ctx.fillRect(axle.x - w / 2, axle.y - 8.5, w, 4.2);
    ctx.fillStyle = '#bae6fd';
    ctx.fillText(text, axle.x, axle.y - 4.6);
    ctx.restore();
  }
}
