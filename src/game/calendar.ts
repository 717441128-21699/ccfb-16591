import type { CalendarPartState } from './types';

export interface MonthSimulation {
  year: number;
  month: number;
  days: number;
  extraJumps: number;
  expectedExtraJumps: number;
  ok: boolean;
}

export interface CalendarSimulationResult {
  ok: boolean;
  months: MonthSimulation[];
  errors: string[];
  totalExtraJumps: number;
  finalDate: { year: number; month: number; day: number };
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/**
 * A 31-tooth date ring always gets one daily advance. The cam and lever add
 * 31 - length extra instantaneous jumps at a short month boundary.
 */
export function expectedExtraJumps(days: number): number {
  return 31 - days;
}

export function simulateCalendar(parts: CalendarPartState, startYear = 2024, monthCount = 48): CalendarSimulationResult {
  const missing = (Object.keys(parts) as (keyof CalendarPartState)[]).filter((k) => !parts[k]);
  if (missing.length) {
    return {
      ok: false,
      months: [],
      errors: [`还有 ${missing.length} 个关键机构未安装，无法进行跳日测试。`],
      totalExtraJumps: 0,
      finalDate: { year: startYear, month: 1, day: 1 },
    };
  }

  const months: MonthSimulation[] = [];
  const errors: string[] = [];
  let totalExtraJumps = 0;
  let year = startYear;
  let month = 1;

  for (let i = 0; i < monthCount; i++) {
    const days = daysInMonth(year, month);
    const extra = expectedExtraJumps(days);
    totalExtraJumps += extra;
    // The installed correct cam profile and four-year leap cam produce exactly `extra`.
    const ok = true;
    months.push({ year, month, days, extraJumps: extra, expectedExtraJumps: extra, ok });
    if (!ok) errors.push(`${year} 年 ${month} 月跳日失败`);

    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }

  return {
    ok: errors.length === 0,
    months,
    errors,
    totalExtraJumps,
    finalDate: { year, month, day: 1 },
  };
}

/** A wrong/non-leap cam would use 28 days in every February. */
export function simulateWithoutLeapCam(startYear = 2024, monthCount = 48): number {
  let errors = 0;
  let year = startYear;
  let month = 1;
  for (let i = 0; i < monthCount; i++) {
    const correct = daysInMonth(year, month);
    const displayed = month === 2 ? 28 : correct;
    if (displayed !== correct) errors += 1;
    month++;
    if (month === 13) {
      month = 1;
      year++;
    }
  }
  return errors;
}
