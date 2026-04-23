import type { MonthExpr, Person, PersonAgeMonth, PersonAgeRef, YearMonth, YearStartMonth } from "./types";

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

export function monthDiff(from: YearMonth, to: YearMonth): number {
  const a = parseYearMonth(from);
  const b = parseYearMonth(to);
  return (b.year - a.year) * 12 + (b.month - a.month);
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

export function isPersonAgeRef(v: unknown): v is PersonAgeRef {
  if (v === null || typeof v !== "object") return false;
  const r = v as Partial<PersonAgeRef>;
  return (
    r.kind === "person-age" &&
    typeof r.personId === "string" &&
    typeof r.age === "number" &&
    Number.isInteger(r.age) &&
    r.age >= 0 &&
    typeof r.month === "number" &&
    Number.isInteger(r.month) &&
    r.month >= 1 &&
    r.month <= 12
  );
}

export function isMonthExpr(v: unknown): v is MonthExpr {
  if (typeof v === "string") return isValidYearMonth(v);
  return isPersonAgeRef(v);
}

export function resolvePersonAgeRef(ref: PersonAgeRef, persons: Person[], yearStart: YearStartMonth): YearMonth | null {
  const person = persons.find((p) => p.id === ref.personId);
  if (!person) return null;
  if (!isValidYearMonth(person.birthMonth)) return null;
  const { year: by, month: bm } = parseYearMonth(person.birthMonth);
  const fy = bm >= yearStart ? by + ref.age : by + ref.age - 1;
  const year = ref.month >= yearStart ? fy : fy + 1;
  return toYearMonth(year, ref.month);
}

export function resolveMonthExpr(expr: MonthExpr, persons: Person[], yearStart: YearStartMonth): YearMonth | null {
  if (typeof expr === "string") return expr;
  return resolvePersonAgeRef(expr, persons, yearStart);
}

export function personAgeMonthFromNumber(n: number): PersonAgeMonth | null {
  if (!Number.isInteger(n) || n < 1 || n > 12) return null;
  return n as PersonAgeMonth;
}
