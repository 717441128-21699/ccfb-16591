import type { ClassicTrain, PlacedGear } from './types';

let seq = 0;
function pg(specId: string, axleId: string, x: number, y: number, layer = 0): PlacedGear {
  seq += 1;
  return { uid: `classic-${seq}`, specId, axleId, x, y, layer };
}

function polar(x: number, y: number, dist: number, angleDeg: number): [number, number] {
  const a = (angleDeg * Math.PI) / 180;
  return [x + Math.cos(a) * dist, y + Math.sin(a) * dist];
}

// Grandfather / weight-driven clock: barrel 1 turn / 12 h -> center 1 rev/h,
// third wheel 8 rev/h, escape 60 rev/h. Motion work gives 1:12 hour reduction.
const gfB: [number, number] = [156, 92];
const gfC = polar(gfB[0], gfB[1], 54, -28);
const gfD = polar(gfC[0], gfC[1], 51, 18);
const gfM = polar(gfB[0], gfB[1], 24, 72);
const gfH = polar(gfM[0], gfM[1], 25, 18);

const grandfather: ClassicTrain = {
  id: 'grandfather-going-train',
  name: '落地钟走时轮系',
  origin: '教学化复原 · 英式长case钟',
  years: '约 1680—1850',
  category: '重力摆 / 锚式擒纵',
  summary:
    '发条盒或重锤大轮 96 齿驱动 8 齿中心齿轴，随后 80/10、75/10 两级升速。总升速比恰为 720，因此 12 小时一圈的发条盒对应 60 rev/h 的擒纵/秒轴。',
  teach: [
    '96/8 × 80/10 × 75/10 = 720',
    '中心轴为分针：1 rev/h；运动轮系 12/36 × 10/40 = 1/12 给时针。',
    '30 齿擒纵轮配合秒摆，可得到清晰的一秒一跳。',
  ],
  sourceSpeedRevPerHour: 1 / 12,
  sourceTorqueNmm: 850,
  board: { width: 320, height: 180 },
  outputLabels: [
    { role: 'minute', label: '分针/中心轮', want: '1 rev/h' },
    { role: 'hour', label: '时针', want: '1/12 rev/h' },
    { role: 'escapement', label: '擒纵/秒轴', want: '60 rev/h' },
  ],
  holes: [
    { id: 'barrel', x: 78, y: 92, role: 'barrel', label: '发条盒' },
    { id: 'center', x: gfB[0], y: gfB[1], role: 'minute', label: '中心/分针' },
    { id: 'third', x: gfC[0], y: gfC[1], role: 'generic', label: '三轮' },
    { id: 'escape', x: gfD[0], y: gfD[1], role: 'escapement', label: '擒纵' },
    { id: 'motion', x: gfM[0], y: gfM[1], role: 'generic', label: '跨轮' },
    { id: 'hour', x: gfH[0], y: gfH[1], role: 'hour', label: '时针' },
  ],
  gears: [
    pg('z96-m1.5', 'barrel', 78, 92, 0),
    pg('z8-m1.5', 'center', gfB[0], gfB[1], 0),
    pg('z80-m1.2', 'center', gfB[0], gfB[1], 1),
    pg('z12-m1', 'center', gfB[0], gfB[1], 2),
    pg('z10-m1.2', 'third', gfC[0], gfC[1], 1),
    pg('z75-m1.2', 'third', gfC[0], gfC[1], 2),
    pg('z10-m1.2', 'escape', gfD[0], gfD[1], 2),
    pg('z30-m1.5', 'escape', gfD[0], gfD[1], 3),
    pg('z36-m1', 'motion', gfM[0], gfM[1], 2),
    pg('z10-m1', 'motion', gfM[0], gfM[1], 3),
    pg('z40-m1', 'hour', gfH[0], gfH[1], 3),
  ],
};

// Precision moon train. Day arbor one turn/day; output period exactly 945/32 = 29.53125 days.
const moonB: [number, number] = [39, 78];
const moonC: [number, number] = [70, 78];
const moonD: [number, number] = [106, 78];
const moonClassicB: [number, number] = [55, 132];
const moonClassicD: [number, number] = [89.5, 132];

const moonWatch: ClassicTrain = {
  id: 'precision-moon-train',
  name: 'Cal. L-2953 精密月相轮系',
  origin: '游戏编订的瑞士风怀表机芯',
  years: '虚拟修复档案',
  category: '月相 / 天文误差',
  summary:
    '三级减速 10/8 × 54/8 × 56/16 = 945/32 = 29.53125 天。相对真实朔望月 29.530588853 天，每年约快 0.0082 天（约 11.8 分钟）。旁边的 40/8 × 59/10 是经典 29.5 天近似。',
  teach: [
    '精密解：10/8 × 54/8 × 56/16 = 29.53125 天。',
    '经典解：40/8 × 59/10 = 29.5 天，年误差约 −0.3783 天。',
    '年误差 = (P − 29.530588853) × 365.25 / 29.530588853。',
  ],
  sourceSpeedRevPerHour: 1 / 24,
  sourceTorqueNmm: 18,
  board: { width: 230, height: 165 },
  outputLabels: [{ role: 'moon', label: '月相盘', want: '≈29.5306 天/圈' }],
  holes: [
    { id: 'day', x: 30, y: 78, role: 'day', label: '拨日轴' },
    { id: 'mb', x: moonB[0], y: moonB[1] },
    { id: 'mc', x: moonC[0], y: moonC[1] },
    { id: 'moon', x: moonD[0], y: moonD[1], role: 'moon', label: '月相' },
    { id: 'dayClassic', x: 31, y: 132, role: 'day', label: '经典日轴' },
    { id: 'cb', x: moonClassicB[0], y: moonClassicB[1] },
    { id: 'moonClassic', x: moonClassicD[0], y: moonClassicD[1], role: 'moon', label: '59齿月相' },
  ],
  gears: [
    pg('z8-m1', 'day', 30, 78, 0),
    pg('z10-m1', 'mb', moonB[0], moonB[1], 0),
    pg('z8-m1', 'mb', moonB[0], moonB[1], 1),
    pg('z54-m1', 'mc', moonC[0], moonC[1], 1),
    pg('z16-m1', 'mc', moonC[0], moonC[1], 2),
    pg('z56-m1', 'moon', moonD[0], moonD[1], 2),

    pg('z8-m1', 'dayClassic', 31, 132, 0),
    pg('z40-m1', 'cb', moonClassicB[0], moonClassicB[1], 0),
    pg('z10-m1', 'cb', moonClassicB[0], moonClassicB[1], 1),
    pg('z59-m1', 'moonClassic', moonClassicD[0], moonClassicD[1], 1),
  ],
};

// Marine chronometer style fast train: total step-up 5760; barrel 1/12 rev/h -> escape 480 rev/h.
const mcB: [number, number] = [123, 92];
const mcC = polar(mcB[0], mcB[1], 54, -35);
const mcD = polar(mcC[0], mcC[1], 50.4, 20);
const mcE = polar(mcD[0], mcD[1], 52.8, -18);

const chronometer: ClassicTrain = {
  id: 'marine-chronometer-train',
  name: '航海天文钟高速轮系',
  origin: '游戏编订 · 航海天文台风格',
  years: '约 1760 年后的精密方向',
  category: '发条 / 擒纵 / 等时性',
  summary:
    '96/8 × 80/10 × 72/12 × 80/8 = 5760。若发条盒 12 小时一圈，擒纵齿轴为 480 rev/h（8 rpm），可对应高频摆轮与精密擒纵的教学化节拍。',
  teach: [
    '总升速比：12 × 8 × 6 × 10 = 5760。',
    '轮片与齿轴同轴：大轮被上一级驱动后，同轴小齿轴继续传向下一级。',
    '天文钟更重视力矩稳定与等时性，而不只是齿数比。',
  ],
  sourceSpeedRevPerHour: 1 / 12,
  sourceTorqueNmm: 520,
  board: { width: 320, height: 180 },
  outputLabels: [{ role: 'escapement', label: '擒纵齿轴', want: '480 rev/h' }],
  holes: [
    { id: 'barrel', x: 45, y: 92, role: 'barrel' },
    { id: 'center', x: mcB[0], y: mcB[1] },
    { id: 'third', x: mcC[0], y: mcC[1] },
    { id: 'fourth', x: mcD[0], y: mcD[1] },
    { id: 'escape', x: mcE[0], y: mcE[1], role: 'escapement' },
  ],
  gears: [
    pg('z96-m1.5', 'barrel', 45, 92, 0),
    pg('z8-m1.5', 'center', mcB[0], mcB[1], 0),
    pg('z80-m1.2', 'center', mcB[0], mcB[1], 1),
    pg('z10-m1.2', 'third', mcC[0], mcC[1], 1),
    pg('z72-m1.2', 'third', mcC[0], mcC[1], 2),
    pg('z12-m1.2', 'fourth', mcD[0], mcD[1], 2),
    pg('z80-m1.2', 'fourth', mcD[0], mcD[1], 3),
    pg('z8-m1.2', 'escape', mcE[0], mcE[1], 3),
  ],
};

export const CLASSIC_TRAINS: ClassicTrain[] = [grandfather, moonWatch, chronometer];

export function getClassicTrain(id: string | null | undefined): ClassicTrain | undefined {
  return CLASSIC_TRAINS.find((t) => t.id === id);
}
