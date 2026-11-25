import { Frac } from './frac';
import { getGearSpec, idealCenterDistanceMm } from './gears';
import type {
  AxleRole,
  AxleSolution,
  GearForceRow,
  MeshCheck,
  ObjectiveDef,
  ObjectiveState,
  PlacedGear,
  TrainAnalysis,
} from './types';

export const MESH_TOLERANCE_MM = 0.45;
export const MESH_CANDIDATE_MM = 8;
export const MESH_EFFICIENCY = 0.94;
export const BEARING_EFFICIENCY = 0.985;
export const PRESSURE_ANGLE_DEG = 20;
const LUNAR_DAYS = 29.530588853;
const YEAR_DAYS = 365.25;

export interface AnalysisConfig {
  roles?: Record<string, AxleRole>;
  sourceAxleId?: string;
  sourceSpeedRevPerHour?: number;
  sourceTorqueNmm?: number;
  requiredEscapementTorqueNmm?: number | null;
  objectives?: ObjectiveDef[];
  calendarPass?: boolean;
  calendarDetail?: string;
}

interface GraphEdge {
  axleA: string;
  axleB: string;
  gearA: string;
  gearB: string;
  mesh: MeshCheck;
}

function axlePosition(gears: PlacedGear[], axleId: string): { x: number; y: number } {
  const g = gears.find((item) => item.axleId === axleId)!;
  return { x: g.x, y: g.y };
}

export function analyzeMeshes(gears: PlacedGear[]): MeshCheck[] {
  const checks: MeshCheck[] = [];
  for (let i = 0; i < gears.length; i++) {
    for (let j = i + 1; j < gears.length; j++) {
      const a = gears[i];
      const b = gears[j];
      if (a.axleId === b.axleId) continue;
      // Layer is used for exploded rendering. Mesh correctness is resolved from
      // module/center distance; extra coaxial wheels for an already-valid axle
      // pair are suppressed below instead of producing false projection errors.

      const sa = getGearSpec(a.specId);
      const sb = getGearSpec(b.specId);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const cd = Math.hypot(dx, dy);
      const pitchA = (sa.module * sa.teeth) / 2;
      const pitchB = (sb.module * sb.teeth) / 2;
      const pitchSum = pitchA + pitchB;
      const ideal = idealCenterDistanceMm(sa, sb);
      const sameModule = Math.abs(sa.module - sb.module) < 1e-9;
      const reference = ideal ?? pitchSum;
      const difference = cd - reference;

      // Only report pairs the player plausibly brought together. Far-away gears are not attempts.
      if (Math.abs(difference) > MESH_CANDIDATE_MM && cd > pitchSum + 5) continue;

      const reasons: string[] = [];
      let status: MeshCheck['status'] = 'valid';
      if (!sameModule || ideal === null) {
        status = 'module';
        reasons.push(`模数不同：m${sa.module} 不能与 m${sb.module} 直接啮合`);
      } else if (Math.abs(cd - ideal) > MESH_TOLERANCE_MM) {
        status = 'distance';
        const sign = cd > ideal ? '偏远' : '过近';
        reasons.push(
          `中心距${sign} ${Math.abs(difference).toFixed(2)} mm；理论值 ${ideal.toFixed(2)} mm，允许偏差 ±${MESH_TOLERANCE_MM} mm`,
        );
      }

      checks.push({
        a: a.uid,
        b: b.uid,
        axleA: a.axleId,
        axleB: b.axleId,
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        centerDistance: cd,
        idealDistance: ideal,
        difference,
        status,
        ok: reasons.length === 0,
        reasons,
      });
    }
  }
  // Once an axle pair has one correct wheel/pinion mesh, other coaxial wheels
  // seen in 2D projection belong to another plane and must not be reported as
  // a second failed mesh between the same two arbors.
  const axlePairKey = (a: string, b: string) => [a, b].sort().join('::');
  const validAxlePairs = new Set(checks.filter((c) => c.ok).map((c) => axlePairKey(c.axleA, c.axleB)));
  return checks.filter((c) => c.ok || !validAxlePairs.has(axlePairKey(c.axleA, c.axleB)));
}

function buildEdges(meshes: MeshCheck[]): GraphEdge[] {
  return meshes
    .filter((m) => m.ok)
    .map((mesh) => ({
      axleA: mesh.axleA,
      axleB: mesh.axleB,
      gearA: mesh.a,
      gearB: mesh.b,
      mesh,
    }));
}

function findEdge(edges: GraphEdge[], a: string, b: string): GraphEdge | undefined {
  return edges.find(
    (e) => (e.axleA === a && e.axleB === b) || (e.axleA === b && e.axleB === a),
  );
}

function gearForAxle(edge: GraphEdge, axleId: string): string {
  return edge.axleA === axleId ? edge.gearA : edge.gearB;
}

/** Exact signed target/source ratio along a BFS path. Cycles are checked separately by analyzeTrain. */
export function relativeRatioBetween(
  gears: PlacedGear[],
  fromAxle: string,
  toAxle: string,
  precomputedMeshes?: MeshCheck[],
): { ratio: Frac; formula: string; edges: GraphEdge[] } | null {
  const meshes = precomputedMeshes ?? analyzeMeshes(gears);
  const edges = buildEdges(meshes);
  const adjacency = new Map<string, GraphEdge[]>();
  for (const g of gears) if (!adjacency.has(g.axleId)) adjacency.set(g.axleId, []);
  for (const e of edges) {
    adjacency.get(e.axleA)?.push(e);
    adjacency.get(e.axleB)?.push(e);
  }
  const queue: { id: string; ratio: Frac; formula: string; path: GraphEdge[] }[] = [
    { id: fromAxle, ratio: Frac.ONE, formula: '1', path: [] },
  ];
  const seen = new Set([fromAxle]);
  while (queue.length) {
    const node = queue.shift()!;
    if (node.id === toAxle) return { ratio: node.ratio, formula: node.formula, edges: node.path };
    for (const edge of adjacency.get(node.id) ?? []) {
      const next = edge.axleA === node.id ? edge.axleB : edge.axleA;
      if (seen.has(next)) continue;
      seen.add(next);
      const currentGearId = gearForAxle(edge, node.id);
      const nextGearId = gearForAxle(edge, next);
      const zCurrent = getGearSpec(gears.find((g) => g.uid === currentGearId)!.specId).teeth;
      const zNext = getGearSpec(gears.find((g) => g.uid === nextGearId)!.specId).teeth;
      const factor = new Frac(-zCurrent, zNext);
      queue.push({
        id: next,
        ratio: node.ratio.mul(factor),
        formula: `${node.formula} × (${factor.toFractionString()})`,
        path: [...node.path, edge],
      });
    }
  }
  return null;
}

export function annualMoonError(periodDays: number): number {
  return ((periodDays - LUNAR_DAYS) * YEAR_DAYS) / LUNAR_DAYS;
}

export function moonGrade(errorDaysPerYear: number | null) {
  if (errorDaysPerYear === null || !Number.isFinite(errorDaysPerYear)) return 'none' as const;
  const v = Math.abs(errorDaysPerYear);
  if (v <= 0.02) return 'gold' as const;
  if (v <= 0.12) return 'silver' as const;
  if (v <= 0.5) return 'bronze' as const;
  return 'none' as const;
}

export function analyzeTrain(gears: PlacedGear[], config: AnalysisConfig = {}): TrainAnalysis {
  const meshes = analyzeMeshes(gears);
  const validMeshes = meshes.filter((m) => m.ok);
  const edges = buildEdges(meshes);
  const graphErrors: string[] = [];

  const axleIds = Array.from(new Set(gears.map((g) => g.axleId)));
  const axleGears = new Map<string, PlacedGear[]>();
  for (const id of axleIds) axleGears.set(id, gears.filter((g) => g.axleId === id));

  const roles = config.roles ?? {};
  const roleEntries = Object.entries(roles);
  const axleForRole = (role: AxleRole | undefined): string | undefined =>
    role ? roleEntries.find(([id, r]) => r === role && axleIds.includes(id))?.[0] : undefined;

  let sourceAxleId = config.sourceAxleId ?? axleForRole('barrel') ?? axleForRole('source') ?? axleForRole('day');
  if (!sourceAxleId && axleIds.length) {
    // Choose the leftmost axle as a neutral analysis reference.
    sourceAxleId = [...axleIds].sort((a, b) => axlePosition(gears, a).x - axlePosition(gears, b).x)[0];
  }

  const adjacency = new Map<string, GraphEdge[]>();
  for (const id of axleIds) adjacency.set(id, []);
  for (const e of edges) {
    adjacency.get(e.axleA)?.push(e);
    adjacency.get(e.axleB)?.push(e);
  }

  const ratioMap = new Map<string, Frac>();
  const formulaMap = new Map<string, string>();
  const parentMap = new Map<string, string>();
  const torqueMap = new Map<string, number>();
  const depthMap = new Map<string, number>();

  if (sourceAxleId) {
    ratioMap.set(sourceAxleId, Frac.ONE);
    formulaMap.set(sourceAxleId, '1');
    torqueMap.set(sourceAxleId, config.sourceTorqueNmm ?? 100);
    depthMap.set(sourceAxleId, 0);
    const queue = [sourceAxleId];

    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of adjacency.get(current) ?? []) {
        const next = edge.axleA === current ? edge.axleB : edge.axleA;
        const currentGearId = gearForAxle(edge, current);
        const nextGearId = gearForAxle(edge, next);
        const currentGear = gears.find((g) => g.uid === currentGearId)!;
        const nextGear = gears.find((g) => g.uid === nextGearId)!;
        const zCurrent = getGearSpec(currentGear.specId).teeth;
        const zNext = getGearSpec(nextGear.specId).teeth;
        const factor = new Frac(-zCurrent, zNext);
        const candidate = ratioMap.get(current)!.mul(factor);
        const candidateFormula = `${formulaMap.get(current)} × (${factor.toFractionString()})`;

        if (!ratioMap.has(next)) {
          ratioMap.set(next, candidate);
          formulaMap.set(next, candidateFormula);
          parentMap.set(next, current);
          depthMap.set(next, (depthMap.get(current) ?? 0) + 1);
          const tau = torqueMap.get(current)! * MESH_EFFICIENCY * (zNext / zCurrent) * BEARING_EFFICIENCY;
          torqueMap.set(next, tau);
          queue.push(next);
        } else if (!ratioMap.get(next)!.equals(candidate)) {
          graphErrors.push(
            `轮系闭环冲突：${next} 同时得到 ${ratioMap.get(next)!.toFractionString()} 和 ${candidate.toFractionString()}，检查齿数或多余啮合。`,
          );
        }
      }
    }
  }

  const sourceSpeed = config.sourceSpeedRevPerHour ?? 1;
  const axles: AxleSolution[] = axleIds.map((id) => {
    const pos = axlePosition(gears, id);
    const ratio = ratioMap.get(id) ?? null;
    return {
      id,
      role: roles[id],
      x: pos.x,
      y: pos.y,
      gearUids: axleGears.get(id)!.map((g) => g.uid),
      ratio,
      speedRevPerHour: ratio ? ratio.toNumber() * sourceSpeed : null,
      torqueNmm: torqueMap.get(id) ?? null,
      pathGearUids: [],
    };
  });

  const gearRows: GearForceRow[] = gears.map((placed) => {
    const spec = getGearSpec(placed.specId);
    const ratio = ratioMap.get(placed.axleId) ?? null;
    const torque = torqueMap.get(placed.axleId) ?? null;
    const radius = (spec.module * spec.teeth) / 2;
    const angle = (PRESSURE_ANGLE_DEG * Math.PI) / 180;
    const ft = torque === null ? null : torque / radius;
    return {
      uid: placed.uid,
      spec,
      axleId: placed.axleId,
      role: roles[placed.axleId],
      layer: placed.layer,
      ratio,
      rpm: ratio ? (ratio.toNumber() * sourceSpeed) / 60 : null,
      revPerHour: ratio ? ratio.toNumber() * sourceSpeed : null,
      torqueNmm: torque,
      pitchRadiusMm: radius,
      tangentialForceN: ft,
      radialForceN: ft === null ? null : ft * Math.tan(angle),
      totalToothForceN: ft === null ? null : ft / Math.cos(angle),
    };
  });

  // Moon report is computed from day -> moon when those roles exist.
  let moon = null as TrainAnalysis['moon'];
  const dayAxle = axleForRole('day');
  const moonAxle = axleForRole('moon');
  if (dayAxle && moonAxle) {
    const relative = relativeRatioBetween(gears, dayAxle, moonAxle, meshes);
    if (relative && relative.ratio.n !== 0n) {
      const moonRatio = relative.ratio;
      const periodFraction = new Frac(moonRatio.d, moonRatio.n).abs();
      const periodDays = periodFraction.toNumber();
      const error = annualMoonError(periodDays);
      moon = {
        periodDays,
        periodFraction,
        targetDays: LUNAR_DAYS,
        errorPerCycleDays: periodDays - LUNAR_DAYS,
        errorDaysPerYear: error,
        grade: moonGrade(error),
      };
    }
  }

  const objectives: ObjectiveState[] = (config.objectives ?? []).map((def) =>
    evaluateObjective(def, {
      gears,
      roles,
      ratioMap,
      meshes,
      moon,
      config,
      torqueMap,
      axleForRole,
    }),
  );

  const escapeAxle = axleForRole('escapement');
  const escapementTorque = escapeAxle ? torqueMap.get(escapeAxle) ?? null : null;
  const requiredTorque = config.requiredEscapementTorqueNmm ?? null;
  let stopReason: string | null = null;
  if (graphErrors.length) stopReason = '轮系存在冲突，轮系被卡死';
  if (requiredTorque !== null && escapeAxle && escapementTorque !== null && escapementTorque < requiredTorque) {
    stopReason = `擒纵端力矩 ${escapementTorque.toFixed(3)} N·mm 低于起步阈值 ${requiredTorque.toFixed(3)} N·mm，摆轮/擒纵无法解锁`;
  }
  if (requiredTorque !== null && escapeAxle && escapementTorque === null) {
    stopReason = '发条到擒纵之间没有完整啮合路径';
  }

  const escapeDepth = escapeAxle ? depthMap.get(escapeAxle) : undefined;
  const meshCount = escapeDepth ?? validMeshes.length;
  // sourceTorqueNmm is treated as torque already available on the source arbor;
  // every crossed mesh adds one mesh loss and the driven arbor adds one bearing loss.
  const efficiency = Math.pow(MESH_EFFICIENCY, meshCount) * Math.pow(BEARING_EFFICIENCY, meshCount);
  const meshEfficiency = Math.pow(MESH_EFFICIENCY, meshCount);

  const exactRatios = buildExactRatios(roles, axleForRole, ratioMap, formulaMap, sourceSpeed);

  return {
    meshes,
    validMeshes,
    axles,
    gearRows,
    objectives,
    moon,
    efficiency,
    meshEfficiency,
    escapementTorque,
    requiredEscapementTorque: requiredTorque,
    running: stopReason === null,
    stopReason,
    graphErrors,
    exactRatios,
  };
}

interface ObjectiveContext {
  gears: PlacedGear[];
  roles: Record<string, AxleRole>;
  ratioMap: Map<string, Frac>;
  meshes: MeshCheck[];
  moon: TrainAnalysis['moon'];
  config: AnalysisConfig;
  torqueMap: Map<string, number>;
  axleForRole: (role: AxleRole | undefined) => string | undefined;
}

function evaluateObjective(def: ObjectiveDef, ctx: ObjectiveContext): ObjectiveState {
  const base = { id: def.id, label: def.label };
  if (def.kind === 'allValid') {
    const invalid = ctx.meshes.filter((m) => !m.ok);
    const disconnectedHint = ctx.gears.length === 0 ? '尚未安装齿轮' : invalid.length ? `${invalid.length} 处啮合失败` : '所有接近的齿轮均正确啮合';
    return { ...base, done: invalid.length === 0 && ctx.gears.length > 0, detail: disconnectedHint, tone: invalid.length ? 'bad' : 'good' };
  }

  if (def.kind === 'gearCount') {
    const count = ctx.gears.length;
    const max = def.maxGearCount ?? 999;
    return { ...base, done: count <= max && count > 0, detail: `当前 ${count} 个齿轮，限制 ${max} 个`, tone: count > max ? 'bad' : 'good' };
  }

  if (def.kind === 'calendar') {
    return {
      ...base,
      done: Boolean(ctx.config.calendarPass),
      detail: ctx.config.calendarDetail ?? '尚未完成凸轮与杠杆测试',
      tone: ctx.config.calendarPass ? 'good' : 'pending',
    };
  }

  if (def.kind === 'moon') {
    if (!ctx.moon) return { ...base, done: false, detail: '需要把“日”轴连接到月相盘轴', tone: 'pending' };
    const limit = def.maxAnnualErrorDays ?? 0.5;
    const done = Math.abs(ctx.moon.errorDaysPerYear ?? Infinity) <= limit;
    return {
      ...base,
      done,
      detail: `周期 ${ctx.moon.periodDays?.toFixed(5)} 天；年误差 ${ctx.moon.errorDaysPerYear?.toFixed(4)} 天/年（门槛 ±${limit}）`,
      tone: done ? 'good' : 'bad',
    };
  }

  if (def.kind === 'torque') {
    const role = def.targetRole ?? 'escapement';
    const axle = ctx.axleForRole(role);
    const actual = axle ? ctx.torqueMap.get(axle) ?? null : null;
    const min = def.minTorqueNmm ?? ctx.config.requiredEscapementTorqueNmm ?? 0;
    const done = actual !== null && actual >= min;
    return {
      ...base,
      done,
      detail: actual === null ? '擒纵轴未接入动力' : `擒纵力矩 ${actual.toFixed(3)} N·mm / 需要 ${min.toFixed(3)} N·mm`,
      tone: done ? 'good' : 'bad',
    };
  }

  // ratio objective
  const sourceAxle = ctx.axleForRole(def.sourceRole ?? 'source');
  const targetAxle = ctx.axleForRole(def.targetRole);
  if (!sourceAxle || !targetAxle) {
    return { ...base, done: false, detail: '指定轴尚未出现在工作台上', tone: 'pending' };
  }
  const relativeResult = relativeRatioBetween(ctx.gears, sourceAxle, targetAxle, ctx.meshes);
  if (!relativeResult) {
    return { ...base, done: false, detail: '两个轴还没有完整啮合路径', tone: 'pending' };
  }
  const relative = relativeResult.ratio;
  if (!def.expected) return { ...base, done: false, detail: `当前 ${relative.toFractionString()}`, tone: 'pending' };
  const expected = new Frac(def.expected[0], def.expected[1]);
  const done = relative.equals(expected);
  return {
    ...base,
    done,
    detail: done
      ? `精确等于 ${expected.toFractionString()}（${expected.toNumber()}）`
      : `当前 ${relative.toFractionString()} = ${relative.toNumber().toFixed(6)}，目标 ${expected.toFractionString()}`,
    tone: done ? 'good' : 'bad',
  };
}

function buildExactRatios(
  roles: Record<string, AxleRole>,
  axleForRole: (role: AxleRole) => string | undefined,
  ratioMap: Map<string, Frac>,
  formulaMap: Map<string, string>,
  sourceSpeed: number,
) {
  const labels: [AxleRole, string][] = [
    ['barrel', '发条盒'],
    ['source', '输入轴'],
    ['minute', '分针'],
    ['hour', '时针'],
    ['second', '秒针'],
    ['day', '日历拨日轴'],
    ['moon', '月相盘'],
    ['calendar', '日历轮'],
    ['escapement', '擒纵轮'],
  ];
  const out: TrainAnalysis['exactRatios'] = [];
  for (const [role, label] of labels) {
    const id = axleForRole(role);
    if (!id) continue;
    const fraction = ratioMap.get(id);
    if (!fraction) continue;
    out.push({
      label,
      fraction,
      decimal: fraction.toNumber(),
      formula: formulaMap.get(id) ?? fraction.toFractionString(),
    });
  }
  void roles;
  void sourceSpeed;
  return out;
}

/** Find a simple axle path; exported for UI hints. */
export function findAxlePath(gears: PlacedGear[], fromAxle: string, toAxle: string): string[] | null {
  const edges = buildEdges(analyzeMeshes(gears));
  const adj = new Map<string, string[]>();
  for (const g of gears) if (!adj.has(g.axleId)) adj.set(g.axleId, []);
  for (const e of edges) {
    adj.get(e.axleA)?.push(e.axleB);
    adj.get(e.axleB)?.push(e.axleA);
  }
  const q: string[][] = [[fromAxle]];
  const seen = new Set([fromAxle]);
  while (q.length) {
    const path = q.shift()!;
    const last = path[path.length - 1];
    if (last === toAxle) return path;
    for (const n of adj.get(last) ?? []) {
      if (seen.has(n)) continue;
      seen.add(n);
      q.push([...path, n]);
    }
  }
  return null;
}
