import { compareYearMonth, iterateMonths, maxYearMonth, minYearMonth, monthDiff } from "@/lib/dsl/month";
import type { FlowSegment, MonthlyEntry, Plan, Ulid, YearMonth } from "@/lib/dsl/types";

function withinPlan(month: YearMonth, start: YearMonth, end: YearMonth): boolean {
  return compareYearMonth(month, start) >= 0 && compareYearMonth(month, end) <= 0;
}

export function computeSegmentAmount(segment: FlowSegment, month: YearMonth): number {
  const base = segment.amount;
  const raise = segment.raise;
  if (!raise || raise.everyMonths <= 0) return base;
  const delta = monthDiff(segment.startMonth, month);
  if (delta <= 0) return base;
  const steps = Math.floor(delta / raise.everyMonths);
  if (steps <= 0) return base;
  if (raise.kind === "fixed") return base + steps * raise.value;
  return base * (1 + raise.value) ** steps;
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
      amount: computeSegmentAmount(segment, month) * sign,
    });
  }
}

function emitTransferSegment(
  fromAccountId: Ulid,
  toAccountId: Ulid,
  sourceId: Ulid,
  segment: FlowSegment,
  planStart: YearMonth,
  planEnd: YearMonth,
  out: MonthlyEntry[],
): void {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return;
  for (const month of iterateMonths(start, end)) {
    const amount = computeSegmentAmount(segment, month);
    out.push({ month, accountId: fromAccountId, sourceId, sourceKind: "transfer", amount: -amount });
    out.push({ month, accountId: toAccountId, sourceId, sourceKind: "transfer", amount });
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

  for (const event of plan.events) {
    if (!withinPlan(event.month, planStartMonth, planEndMonth)) continue;
    entries.push({
      month: event.month,
      accountId: event.accountId,
      sourceId: event.id,
      sourceKind: "event",
      amount: event.amount,
    });
  }

  for (const transfer of plan.transfers) {
    if (transfer.fromAccountId === transfer.toAccountId) continue;
    for (const segment of transfer.segments) {
      emitTransferSegment(
        transfer.fromAccountId,
        transfer.toAccountId,
        transfer.id,
        segment,
        planStartMonth,
        planEndMonth,
        entries,
      );
    }
  }

  return entries;
}
