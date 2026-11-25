import type { GearSpec } from './types';

function make(teeth: number, module: number, material: GearSpec['material'] = 'brass', fact?: string): GearSpec {
  return {
    id: `z${teeth}-m${module}`,
    teeth,
    module,
    name: `${teeth} 齿 · m${module}`,
    material,
    fact,
  };
}

export const GEAR_SPECS: GearSpec[] = [
  // Fine module 1.0 — moon phase and compact motion work
  make(8, 1, 'steel', '常用小齿轴；齿数太少时会有轻微根切。'),
  make(10, 1, 'steel'),
  make(12, 1, 'brass', '分针轮系的起点之一。'),
  make(16, 1, 'brass'),
  make(18, 1, 'brass'),
  make(20, 1, 'brass'),
  make(24, 1, 'brass'),
  make(36, 1, 'brass'),
  make(40, 1, 'brass'),
  make(54, 1, 'brass', '高精度月相轮系中的关键从动轮。'),
  make(56, 1, 'brass'),
  make(59, 1, 'blued', '经典 59 齿月相轮：两个月相图案交替，约 29.5 天换相。'),
  make(72, 1, 'brass'),
  make(108, 1, 'brass', '与小齿轴组合可给出 29.53125 天的精密近似。'),

  // Module 1.2 — classic clock wheel/pinion trains
  make(8, 1.2, 'steel'),
  make(10, 1.2, 'steel'),
  make(12, 1.2, 'steel'),
  make(36, 1.2, 'brass'),
  make(40, 1.2, 'brass'),
  make(48, 1.2, 'brass'),
  make(60, 1.2, 'brass'),
  make(72, 1.2, 'brass', '天文钟轮系中与12齿齿轴配对的精密轮片。'),
  make(75, 1.2, 'brass', '落地钟三轮片，和 10 齿擒纵齿轴配对。'),
  make(80, 1.2, 'brass', '中心轮；落地钟里常由它把运动传给三轮。'),

  // Module 1.5 — robust tutorial and going train
  make(8, 1.5, 'steel', '落地钟中心齿轴，与 96 发条大轮啮合。'),
  make(12, 1.5, 'steel'),
  make(24, 1.5, 'brass'),
  make(30, 1.5, 'brass', '30 齿擒纵轮，配秒摆锚式擒纵。'),
  make(36, 1.5, 'brass'),
  make(40, 1.5, 'brass'),
  make(48, 1.5, 'brass'),
  make(60, 1.5, 'brass'),
  make(72, 1.5, 'brass'),
  make(80, 1.5, 'brass'),
  make(96, 1.5, 'brass', '发条盒大轮；每 12 小时转一圈，经 96/8 驱动中心轮。'),

  // Module 2 — visibly mismatched distractor family
  make(12, 2, 'steel'),
  make(24, 2, 'brass'),
  make(36, 2, 'brass'),
  make(48, 2, 'brass'),
];

const SPEC_MAP = new Map(GEAR_SPECS.map((g) => [g.id, g]));

export function getGearSpec(id: string): GearSpec {
  const g = SPEC_MAP.get(id);
  if (!g) throw new Error(`Unknown gear spec: ${id}`);
  return g;
}

export function pitchRadiusMm(spec: GearSpec): number {
  return (spec.module * spec.teeth) / 2;
}

export function outerRadiusMm(spec: GearSpec): number {
  return (spec.module * (spec.teeth + 2)) / 2;
}

export function idealCenterDistanceMm(a: GearSpec, b: GearSpec): number | null {
  if (Math.abs(a.module - b.module) > 1e-9) return null;
  return (a.module * (a.teeth + b.teeth)) / 2;
}
