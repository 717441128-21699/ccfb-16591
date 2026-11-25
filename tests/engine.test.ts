import { describe, expect, it } from 'vitest';
import { CLASSIC_TRAINS } from '../src/game/classicTrains';
import { simulateCalendar } from '../src/game/calendar';
import { Frac } from '../src/game/frac';
import { annualMoonError, analyzeTrain } from '../src/game/engine';
import { LEVELS } from '../src/game/levels';
import type { AxleRole, LevelDef, PlacedGear } from '../src/game/types';

function hole(level: LevelDef, id: string) {
  const h = level.holes.find((x) => x.id === id);
  if (!h) throw new Error(`missing hole ${id}`);
  return h;
}

function at(level: LevelDef, uid: string, specId: string, axleId: string, layer = 0): PlacedGear {
  const h = hole(level, axleId);
  return { uid, specId, axleId, x: h.x, y: h.y, layer };
}

function roles(level: LevelDef): Record<string, AxleRole> {
  return Object.fromEntries(level.holes.filter((h) => h.role).map((h) => [h.id, h.role!]));
}

function analyzeLevel(level: LevelDef, gears: PlacedGear[]) {
  return analyzeTrain(gears, {
    roles: roles(level),
    sourceSpeedRevPerHour: level.sourceSpeedRevPerHour,
    sourceTorqueNmm: level.sourceTorqueNmm,
    requiredEscapementTorqueNmm: level.requiredEscapementTorqueNmm ?? null,
    objectives: level.objectives,
  });
}

describe('exact rational gear arithmetic', () => {
  it('keeps 12:1 as an exact fraction rather than accumulated floats', () => {
    const ratio = new Frac(-12, 36).mul(new Frac(-10, 40));
    expect(ratio.equals(new Frac(1, 12))).toBe(true);
    expect(ratio.toFractionString()).toBe('1/12');
  });

  it('computes the moon annual error in days per year', () => {
    expect(annualMoonError(29.5)).toBeCloseTo(-0.378339, 5);
    expect(annualMoonError(29.53125)).toBeCloseTo(0.008177, 5);
  });
});

describe('playable level solutions', () => {
  it('passes the first mesh level with a same-module 24T gear at 36 mm', () => {
    const level = LEVELS[0];
    const gears: PlacedGear[] = [
      ...(level.initialGears ?? []),
      at(level, 'target', 'z24-m1.5', 'second', 0),
    ];
    const result = analyzeLevel(level, gears);
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0].ok).toBe(true);
    expect(result.objectives.every((o) => o.done)).toBe(true);
  });

  it('flags wrong module and wrong center distance immediately as failed mesh checks', () => {
    const level = LEVELS[0];
    const wrongModule: PlacedGear[] = [...(level.initialGears ?? []), at(level, 'bad-module', 'z24-m1', 'second')];
    expect(analyzeLevel(level, wrongModule).meshes[0].status).toBe('module');

    const tooLarge = LEVELS[0];
    const wrongTeeth: PlacedGear[] = [...(tooLarge.initialGears ?? []), at(tooLarge, 'bad-distance', 'z36-m1.5', 'second')];
    const mesh = analyzeLevel(tooLarge, wrongTeeth).meshes[0];
    expect(mesh.ok).toBe(false);
    expect(mesh.status).toBe('distance');
  });

  it('builds the exact 1:12 motion work', () => {
    const level = LEVELS.find((l) => l.id === 'hour-minute-12')!;
    const gears = [
      at(level, 'minute12', 'z12-m1', 'minute', 0),
      at(level, 'wheel36', 'z36-m1', 'motion', 0),
      at(level, 'pinion10', 'z10-m1', 'motion', 1),
      at(level, 'hour40', 'z40-m1', 'hour', 1),
    ];
    const result = analyzeLevel(level, gears);
    expect(result.meshes.every((m) => m.ok)).toBe(true);
    const hour = result.axles.find((a) => a.role === 'hour')!;
    expect(hour.ratio?.equals(new Frac(1, 12))).toBe(true);
    expect(result.objectives.every((o) => o.done)).toBe(true);
  });

  it('does not depend on build-order layer numbers when one valid mesh exists per axle pair', () => {
    const level = LEVELS.find((l) => l.id === 'hour-minute-12')!;
    const gears = [
      at(level, 'minute12x', 'z12-m1', 'minute', 0),
      at(level, 'wheel36x', 'z36-m1', 'motion', 0),
      at(level, 'pinion10x', 'z10-m1', 'motion', 0),
      at(level, 'hour40x', 'z40-m1', 'hour', 0),
    ];
    const result = analyzeLevel(level, gears);
    expect(result.objectives.every((o) => o.done)).toBe(true);
    expect(result.axles.find((a) => a.role === 'hour')?.ratio?.equals(new Frac(1, 12))).toBe(true);
  });

  it('builds the precision moon train and reports a tiny annual error', () => {
    const level = LEVELS.find((l) => l.id === 'moon-phase')!;
    const gears = [
      at(level, 'd8', 'z8-m1', 'day', 0),
      at(level, 'b10', 'z10-m1', 'p1', 0),
      at(level, 'b8', 'z8-m1', 'p1', 1),
      at(level, 'c54', 'z54-m1', 'p2', 1),
      at(level, 'c16', 'z16-m1', 'p2', 2),
      at(level, 'moon56', 'z56-m1', 'moon', 2),
    ];
    const result = analyzeLevel(level, gears);
    expect(result.meshes.every((m) => m.ok)).toBe(true);
    expect(result.moon?.periodFraction?.toFractionString()).toBe('945/32');
    expect(Math.abs(result.moon?.errorDaysPerYear ?? 1)).toBeLessThan(0.02);
    expect(result.objectives.every((o) => o.done)).toBe(true);
  });

  it('builds the classic 29.5 day moon alternative', () => {
    const level = LEVELS.find((l) => l.id === 'moon-phase')!;
    const gears = [
      at(level, 'd8b', 'z8-m1', 'day-b', 0),
      at(level, 'b40', 'z40-m1', 'b1', 0),
      at(level, 'b10b', 'z10-m1', 'b1', 1),
      at(level, 'moon59', 'z59-m1', 'moon-b', 1),
    ];
    const result = analyzeLevel(level, gears);
    expect(result.meshes.every((m) => m.ok)).toBe(true);
    expect(result.moon?.periodFraction?.equals(new Frac(59, 2))).toBe(true);
    expect(result.objectives.find((o) => o.id === 'moon')?.done).toBe(true);
  });

  it('passes torque level with the grandfather going train', () => {
    const level = LEVELS.find((l) => l.id === 'mainspring-torque')!;
    const gears = [
      at(level, 'barrel96', 'z96-m1.5', 'barrel', 0),
      at(level, 'center8', 'z8-m1.5', 'center', 0),
      at(level, 'center80', 'z80-m1.2', 'center', 1),
      at(level, 'third10', 'z10-m1.2', 'third', 1),
      at(level, 'third75', 'z75-m1.2', 'third', 2),
      at(level, 'escape10', 'z10-m1.2', 'escape', 2),
      at(level, 'escape30', 'z30-m1.5', 'escape', 3),
    ];
    const result = analyzeLevel(level, gears);
    expect(result.meshes.every((m) => m.ok)).toBe(true);
    const escape = result.axles.find((a) => a.role === 'escapement')!;
    expect(escape.ratio?.equals(new Frac(-720, 1))).toBe(true);
    expect(result.escapementTorque ?? 0).toBeGreaterThan(0.7);
    expect(result.objectives.every((o) => o.done)).toBe(true);
    expect(result.running).toBe(true);
  });
});

describe('classic trains authored in the codex', () => {
  it('grandfather has exact 720x going train and 12:1 motion work', () => {
    const train = CLASSIC_TRAINS.find((t) => t.id === 'grandfather-going-train')!;
    const result = analyzeTrain(train.gears, { roles: roles({ holes: train.holes ?? [] } as LevelDef) });
    expect(result.axles.find((a) => a.role === 'escapement')?.ratio?.equals(new Frac(-720))).toBe(true);
    expect(result.axles.find((a) => a.role === 'hour')?.ratio?.equals(new Frac(-1))).toBe(true);
  });

  it('marine chronometer has exact 5760x step-up', () => {
    const train = CLASSIC_TRAINS.find((t) => t.id === 'marine-chronometer-train')!;
    const result = analyzeTrain(train.gears, { roles: roles({ holes: train.holes ?? [] } as LevelDef) });
    expect(result.axles.find((a) => a.role === 'escapement')?.ratio?.equals(new Frac(5760))).toBe(true);
  });

  it('moon codex includes both exact approximations', () => {
    const train = CLASSIC_TRAINS.find((t) => t.id === 'precision-moon-train')!;
    const result = analyzeTrain(train.gears, { roles: roles({ holes: train.holes ?? [] } as LevelDef) });
    expect(result.moon?.periodFraction?.toFractionString()).toBe('945/32');
  });
});

describe('calendar cam simulation', () => {
  it('requires all parts and passes 48 months from leap year 2024', () => {
    expect(simulateCalendar({ dateWheel: false, monthCam: true, leapCam: true, lever: true, spring: true }).ok).toBe(false);
    const result = simulateCalendar({ dateWheel: true, monthCam: true, leapCam: true, lever: true, spring: true }, 2024, 48);
    expect(result.ok).toBe(true);
    expect(result.months.find((m) => m.year === 2024 && m.month === 2)?.days).toBe(29);
    expect(result.months.find((m) => m.year === 2025 && m.month === 2)?.extraJumps).toBe(3);
    expect(result.months.find((m) => m.year === 2024 && m.month === 2)?.extraJumps).toBe(2);
  });
});
