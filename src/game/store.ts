import { useSyncExternalStore } from 'react';
import { LEVELS } from './levels';
import type { CalendarPartState, PlacedGear } from './types';

export type Route = 'workbench' | 'analysis' | 'levels' | 'codex';

export interface ProgressState {
  completed: Record<string, boolean>;
  bestMoonError: Record<string, number>;
  inspectedGears?: number;
}

interface PersistState {
  currentLevelId: string;
  builds: Record<string, PlacedGear[]>;
  calendar: Record<string, CalendarPartState>;
  progress: ProgressState;
  analysisClassicId: string | null;
}

interface AppState extends PersistState {
  route: Route;
}

const STORAGE_KEY = 'clockmakers-workbench-v1';

export const EMPTY_CALENDAR: CalendarPartState = {
  dateWheel: false,
  monthCam: false,
  leapCam: false,
  lever: false,
  spring: false,
};

function cloneInitialBuilds(): Record<string, PlacedGear[]> {
  const builds: Record<string, PlacedGear[]> = {};
  for (const level of LEVELS) {
    builds[level.id] = (level.initialGears ?? []).map((g) => ({ ...g }));
  }
  return builds;
}

function defaultState(): AppState {
  const calendar: Record<string, CalendarPartState> = {};
  for (const level of LEVELS) calendar[level.id] = { ...EMPTY_CALENDAR, ...(level.initialCalendar ?? {}) };
  return {
    route: 'levels',
    currentLevelId: LEVELS[0].id,
    builds: cloneInitialBuilds(),
    calendar,
    progress: { completed: {}, bestMoonError: {} },
    analysisClassicId: null,
  };
}

function loadState(): AppState {
  const base = defaultState();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<PersistState>;
    return {
      ...base,
      ...parsed,
      route: (parsed as Partial<AppState>).route ?? 'levels',
      builds: { ...base.builds, ...(parsed.builds ?? {}) },
      calendar: { ...base.calendar, ...(parsed.calendar ?? {}) },
      progress: { ...base.progress, ...(parsed.progress ?? {}) },
    };
  } catch {
    return base;
  }
}

let state: AppState = loadState();
const listeners = new Set<() => void>();

function persist() {
  try {
    const { route: _route, ...data } = state;
    void _route;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Storage may be unavailable; the game remains playable in memory.
  }
}

function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
  const p = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...p };
  persist();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(state),
    () => selector(state),
  );
}

export const actions = {
  navigate(route: Route) {
    setState({ route });
  },
  selectLevel(levelId: string, route: Route = 'workbench') {
    setState({ currentLevelId: levelId, route });
  },
  setAnalysisClassic(id: string | null) {
    setState({ analysisClassicId: id, route: 'analysis' });
  },
  addGear(levelId: string, gear: PlacedGear) {
    setState((s) => ({
      builds: { ...s.builds, [levelId]: [...(s.builds[levelId] ?? []), gear] },
    }));
  },
  replaceBuild(levelId: string, gears: PlacedGear[]) {
    setState((s) => ({ builds: { ...s.builds, [levelId]: gears } }));
  },
  moveAxle(levelId: string, axleId: string, x: number, y: number, mergeToAxleId?: string) {
    setState((s) => {
      const current = s.builds[levelId] ?? [];
      const targetId = mergeToAxleId ?? axleId;
      const source = current.filter((g) => g.axleId === axleId);
      const next = current
        .filter((g) => g.axleId !== axleId)
        .map((g) => {
          if (mergeToAxleId && g.axleId === mergeToAxleId) {
            return { ...g, x, y };
          }
          return g;
        });
      for (const g of source) {
        next.push({ ...g, axleId: targetId, x, y });
      }
      return { builds: { ...s.builds, [levelId]: next } };
    });
  },
  updateGear(levelId: string, uid: string, patch: Partial<PlacedGear>) {
    setState((s) => ({
      builds: {
        ...s.builds,
        [levelId]: (s.builds[levelId] ?? []).map((g) => (g.uid === uid ? { ...g, ...patch } : g)),
      },
    }));
  },
  removeGear(levelId: string, uid: string) {
    setState((s) => ({
      builds: { ...s.builds, [levelId]: (s.builds[levelId] ?? []).filter((g) => g.uid !== uid) },
    }));
  },
  detachGear(levelId: string, uid: string) {
    setState((s) => ({
      builds: {
        ...s.builds,
        [levelId]: (s.builds[levelId] ?? []).map((g) =>
          g.uid === uid ? { ...g, axleId: `axle-${uid}`, layer: 0 } : g,
        ),
      },
    }));
  },
  resetLevel(levelId: string) {
    const level = LEVELS.find((l) => l.id === levelId);
    setState((s) => ({
      builds: { ...s.builds, [levelId]: (level?.initialGears ?? []).map((g) => ({ ...g })) },
      calendar: { ...s.calendar, [levelId]: { ...EMPTY_CALENDAR, ...(level?.initialCalendar ?? {}) } },
    }));
  },
  setCalendarPart(levelId: string, key: keyof CalendarPartState, value: boolean) {
    setState((s) => ({
      calendar: {
        ...s.calendar,
        [levelId]: { ...(s.calendar[levelId] ?? EMPTY_CALENDAR), [key]: value },
      },
    }));
  },
  completeLevel(levelId: string, moonError?: number | null) {
    setState((s) => {
      const previousBest = s.progress.bestMoonError[levelId];
      const bestMoonError = { ...s.progress.bestMoonError };
      if (typeof moonError === 'number' && Number.isFinite(moonError)) {
        bestMoonError[levelId] =
          previousBest === undefined ? moonError : Math.min(previousBest, Math.abs(moonError));
      }
      return {
        progress: {
          ...s.progress,
          completed: { ...s.progress.completed, [levelId]: true },
          bestMoonError,
        },
      };
    });
  },
};

export function newUid(prefix = 'gear'): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}
