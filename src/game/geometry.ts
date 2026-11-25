import type { BoardHole, PlacedGear } from './types';

export const AXLE_SNAP_MM = 7;
export const HOLE_SNAP_MM = 6;

export interface DropTarget {
  x: number;
  y: number;
  axleId: string;
  snapped: 'axle' | 'hole' | 'grid';
}

export function roundHalf(v: number): number {
  // Snap to a fine 0.1 mm construction grid; the mesh tolerance is ±0.45 mm.
  return Math.round(v * 10) / 10;
}

/** Resolve a pointer release to a coaxial axle, a labelled hole, or a fine grid position. */
export function resolveDrop(
  x: number,
  y: number,
  levelId: string,
  holes: BoardHole[],
  gears: PlacedGear[],
  options: { movingAxleId?: string } = {},
): DropTarget {
  const axlePositions = new Map<string, { x: number; y: number }>();
  for (const g of gears) {
    if (options.movingAxleId && g.axleId === options.movingAxleId) continue;
    if (!axlePositions.has(g.axleId)) axlePositions.set(g.axleId, { x: g.x, y: g.y });
  }

  let bestAxle: { id: string; dist: number; x: number; y: number } | null = null;
  for (const [id, p] of axlePositions) {
    const dist = Math.hypot(p.x - x, p.y - y);
    if (dist <= AXLE_SNAP_MM && (!bestAxle || dist < bestAxle.dist)) {
      bestAxle = { id, dist, x: p.x, y: p.y };
    }
  }
  if (bestAxle) return { x: bestAxle.x, y: bestAxle.y, axleId: bestAxle.id, snapped: 'axle' };

  let bestHole: BoardHole | null = null;
  let bestHoleDist = Infinity;
  for (const h of holes) {
    const dist = Math.hypot(h.x - x, h.y - y);
    if (dist <= HOLE_SNAP_MM && dist < bestHoleDist) {
      bestHole = h;
      bestHoleDist = dist;
    }
  }
  if (bestHole) return { x: bestHole.x, y: bestHole.y, axleId: bestHole.id, snapped: 'hole' };

  return {
    x: roundHalf(x),
    y: roundHalf(y),
    axleId: options.movingAxleId ?? `axle-${levelId}-${Math.round(x * 10)}-${Math.round(y * 10)}`,
    snapped: 'grid',
  };
}

export function clampToBoard(x: number, y: number, width: number, height: number, margin = 4) {
  return {
    x: Math.max(margin, Math.min(width - margin, x)),
    y: Math.max(margin, Math.min(height - margin, y)),
  };
}
