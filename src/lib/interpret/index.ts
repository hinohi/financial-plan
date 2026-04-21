import { compareYearMonth, iterateMonths, maxYearMonth, minYearMonth } from "@/lib/dsl/month";
import type { FlowSegment, MonthlyEntry, Plan, Ulid, YearMonth } from "@/lib/dsl/types";

function withinPlan(month: YearMonth, start: YearMonth, end: YearMonth): boolean {
  return compareYearMonth(month, start) >= 0 && compareYearMonth(month, end) <= 0;
}

function emitSegment(
  accountId: Ulid,
  sourceId: Ulid,
  sourceKind: "income" | "expense",
  segment: FlowSegment,
  planStart: YearMonth,
  planEnd: YearMonth,
  sign: 1 | -1,
  out: MonthlyEntry[],
): void {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return;
  for (const month of iterateMonths(start, end)) {
    out.push({
      month,
      accountId,
      sourceId,
      sourceKind,
      amount: segment.amount * sign,
    });
  }
}

export function interpret(plan: Plan): MonthlyEntry[] {
  const { planStartMonth, planEndMonth } = plan.settings;
  const entries: MonthlyEntry[] = [];

  for (const snapshot of plan.snapshots) {
    if (!withinPlan(snapshot.month, planStartMonth, planEndMonth)) continue;
    entries.push({
      month: snapshot.month,
      accountId: snapshot.accountId,
      sourceId: snapshot.id,
      sourceKind: "snapshot",
      amount: snapshot.balance,
    });
  }

  for (const income of plan.incomes) {
    for (const segment of income.segments) {
      emitSegment(income.accountId, income.id, "income", segment, planStartMonth, planEndMonth, 1, entries);
    }
  }

  for (const expense of plan.expenses) {
    for (const segment of expense.segments) {
      emitSegment(expense.accountId, expense.id, "expense", segment, planStartMonth, planEndMonth, -1, entries);
    }
  }

  return entries;
}
