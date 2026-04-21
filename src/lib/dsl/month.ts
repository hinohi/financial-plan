import type { YearMonth } from "./types";

export function parseYearMonth(ym: YearMonth): { year: number; month: number } {
  const [yStr, mStr] = ym.split("-");
  return { year: Number(yStr), month: Number(mStr) };
}

export function toYearMonth(year: number, month: number): YearMonth {
  const normYear = year + Math.floor((month - 1) / 12);
  const normMonth = ((((month - 1) % 12) + 12) % 12) + 1;
  return `${normYear}-${String(normMonth).padStart(2, "0")}` as YearMonth;
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const { year, month } = parseYearMonth(ym);
  return toYearMonth(year, month + delta);
}

export function compareYearMonth(a: YearMonth, b: YearMonth): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxYearMonth(a: YearMonth, b: YearMonth): YearMonth {
  return compareYearMonth(a, b) >= 0 ? a : b;
}

export function minYearMonth(a: YearMonth, b: YearMonth): YearMonth {
  return compareYearMonth(a, b) <= 0 ? a : b;
}

export function* iterateMonths(start: YearMonth, end: YearMonth): Generator<YearMonth> {
  if (compareYearMonth(start, end) > 0) return;
  let cur = start;
  while (compareYearMonth(cur, end) <= 0) {
    yield cur;
    cur = addMonths(cur, 1);
  }
}

export function isValidYearMonth(value: string): value is YearMonth {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function currentYearMonth(now: Date = new Date()): YearMonth {
  return toYearMonth(now.getFullYear(), now.getMonth() + 1);
}
