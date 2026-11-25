import type { Frac } from './frac';

export type AxleRole =
  | 'barrel'
  | 'source'
  | 'minute'
  | 'hour'
  | 'second'
  | 'day'
  | 'moonDrive'
  | 'moon'
  | 'calendar'
  | 'escapement'
  | 'generic';

export interface GearSpec {
  id: string;
  teeth: number;
  module: number;
  name: string;
  material: 'brass' | 'steel' | 'blued';
  tags?: string[];
  fact?: string;
}

export interface PlacedGear {
  uid: string;
  specId: string;
  axleId: string;
  x: number; // mm in board coordinates
  y: number;
  layer: number;
}

export interface BoardHole {
  id: string;
  x: number;
  y: number;
  role?: AxleRole;
  label?: string;
}

export type MeshStatus = 'valid' | 'module' | 'distance' | 'collision';

export interface MeshCheck {
  a: string;
  b: string;
  axleA: string;
  axleB: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  centerDistance: number;
  idealDistance: number | null;
  difference: number | null;
  status: MeshStatus;
  ok: boolean;
  reasons: string[];
}

export interface AxleSolution {
  id: string;
  role?: AxleRole;
  x: number;
  y: number;
  gearUids: string[];
  ratio: Frac | null; // turns of this axle per one source turn
  speedRevPerHour: number | null;
  torqueNmm: number | null;
  pathGearUids: string[];
}

export interface GearForceRow {
  uid: string;
  spec: GearSpec;
  axleId: string;
  role?: AxleRole;
  layer: number;
  ratio: Frac | null;
  rpm: number | null;
  revPerHour: number | null;
  torqueNmm: number | null;
  pitchRadiusMm: number;
  tangentialForceN: number | null;
  radialForceN: number | null;
  totalToothForceN: number | null;
}

export interface MoonReport {
  periodDays: number | null;
  periodFraction: Frac | null;
  targetDays: number;
  errorPerCycleDays: number | null;
  errorDaysPerYear: number | null;
  grade: 'none' | 'bronze' | 'silver' | 'gold';
}

export interface ObjectiveState {
  id: string;
  label: string;
  done: boolean;
  detail: string;
  tone?: 'good' | 'bad' | 'pending';
}

export interface TrainAnalysis {
  meshes: MeshCheck[];
  validMeshes: MeshCheck[];
  axles: AxleSolution[];
  gearRows: GearForceRow[];
  objectives: ObjectiveState[];
  moon: MoonReport | null;
  efficiency: number;
  meshEfficiency: number;
  escapementTorque: number | null;
  requiredEscapementTorque: number | null;
  running: boolean;
  stopReason: string | null;
  graphErrors: string[];
  exactRatios: { label: string; fraction: Frac; decimal: number; formula: string }[];
}

export interface InventoryEntry {
  specId: string;
  count: number;
}

export type ObjectiveKind = 'ratio' | 'moon' | 'torque' | 'calendar' | 'allValid' | 'gearCount';

export interface ObjectiveDef {
  id: string;
  kind: ObjectiveKind;
  label: string;
  sourceRole?: AxleRole;
  targetRole?: AxleRole;
  expected?: [number, number];
  maxAnnualErrorDays?: number;
  minTorqueNmm?: number;
  maxGearCount?: number;
}

export interface CalendarPartState {
  dateWheel: boolean;
  monthCam: boolean;
  leapCam: boolean;
  lever: boolean;
  spring: boolean;
}

export interface LevelDef {
  id: string;
  index: number;
  name: string;
  subtitle: string;
  era: string;
  difficulty: 1 | 2 | 3 | 4;
  estimatedMinutes: number;
  accent: string;
  brief: string;
  theory: string;
  board: { width: number; height: number };
  sourceRole: AxleRole;
  sourceLabel: string;
  sourceSpeedRevPerHour: number;
  sourceTorqueNmm: number;
  requiredEscapementTorqueNmm?: number;
  holes: BoardHole[];
  inventory: InventoryEntry[];
  initialGears?: PlacedGear[];
  calendarSlots?: { id: keyof CalendarPartState; x: number; y: number; label: string }[];
  initialCalendar?: Partial<CalendarPartState>;
  objectives: ObjectiveDef[];
  classicTrainId?: string;
  tags: string[];
}

export interface ClassicTrain {
  id: string;
  name: string;
  origin: string;
  years: string;
  category: string;
  summary: string;
  teach: string[];
  sourceSpeedRevPerHour: number;
  sourceTorqueNmm: number;
  board: { width: number; height: number };
  gears: PlacedGear[];
  holes?: BoardHole[];
  outputLabels: { role: AxleRole; label: string; want: string }[];
}
