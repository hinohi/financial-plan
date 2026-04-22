import { addMonths, compareYearMonth, iterateMonths, maxYearMonth, minYearMonth, monthDiff } from "@/lib/dsl/month";
import type { Account, FlowSegment, LiabilityParams, MonthlyEntry, Plan, Ulid, YearMonth } from "@/lib/dsl/types";

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
  categoryId: Ulid | undefined,
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
      categoryId,
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

export function monthlyCompoundRate(annualRate: number): number {
  if (!Number.isFinite(annualRate)) return 0;
  return (1 + annualRate) ** (1 / 12) - 1;
}

type LiabilityPayment = { interest: number; principal: number };

export function computeLiabilitySchedule(params: LiabilityParams): Map<YearMonth, LiabilityPayment> {
  const { annualRate, scheduleKind, principal, termMonths, startMonth } = params;
  const result = new Map<YearMonth, LiabilityPayment>();
  if (principal <= 0 || termMonths <= 0) return result;
  const r = annualRate / 12;

  if (scheduleKind === "equal-payment") {
    const payment =
      r === 0 ? principal / termMonths : (principal * r * (1 + r) ** termMonths) / ((1 + r) ** termMonths - 1);
    let remaining = principal;
    for (let i = 0; i < termMonths; i++) {
      const month = addMonths(startMonth, i);
      const interest = remaining * r;
      const principalAmt = Math.min(remaining, payment - interest);
      remaining -= principalAmt;
      result.set(month, { interest, principal: principalAmt });
    }
  } else {
    const principalMonthly = principal / termMonths;
    let remaining = principal;
    for (let i = 0; i < termMonths; i++) {
      const month = addMonths(startMonth, i);
      const interest = remaining * r;
      const principalAmt = Math.min(remaining, principalMonthly);
      remaining -= principalAmt;
      result.set(month, { interest, principal: principalAmt });
    }
  }
  return result;
}

function buildStaticEntriesByMonth(plan: Plan): Map<YearMonth, MonthlyEntry[]> {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const tmp: MonthlyEntry[] = [];

  for (const snapshot of plan.snapshots) {
    if (!withinPlan(snapshot.month, start, end)) continue;
    tmp.push({
      month: snapshot.month,
      accountId: snapshot.accountId,
      sourceId: snapshot.id,
      sourceKind: "snapshot",
      amount: snapshot.balance,
    });
  }
  for (const income of plan.incomes) {
    for (const segment of income.segments) {
      emitSegment(income.accountId, income.id, "income", segment, start, end, 1, income.categoryId, tmp);
    }
  }
  for (const expense of plan.expenses) {
    for (const segment of expense.segments) {
      emitSegment(expense.accountId, expense.id, "expense", segment, start, end, -1, expense.categoryId, tmp);
    }
  }
  for (const event of plan.events) {
    if (!withinPlan(event.month, start, end)) continue;
    tmp.push({
      month: event.month,
      accountId: event.accountId,
      sourceId: event.id,
      sourceKind: "event",
      categoryId: event.categoryId,
      amount: event.amount,
    });
  }
  for (const transfer of plan.transfers) {
    if (transfer.fromAccountId === transfer.toAccountId) continue;
    for (const segment of transfer.segments) {
      emitTransferSegment(transfer.fromAccountId, transfer.toAccountId, transfer.id, segment, start, end, tmp);
    }
  }

  const byMonth = new Map<YearMonth, MonthlyEntry[]>();
  for (const entry of tmp) {
    let arr = byMonth.get(entry.month);
    if (!arr) {
      arr = [];
      byMonth.set(entry.month, arr);
    }
    arr.push(entry);
  }
  return byMonth;
}

function computeDynamicEntriesForMonth(
  month: YearMonth,
  plan: Plan,
  balances: Record<Ulid, number>,
  liabilitySchedules: Map<Ulid, Map<YearMonth, LiabilityPayment>>,
): MonthlyEntry[] {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const out: MonthlyEntry[] = [];

  for (const account of plan.accounts) {
    if (account.kind === "investment" && account.investment && account.investment.annualRate !== 0) {
      const base = balances[account.id] ?? 0;
      const rate = monthlyCompoundRate(account.investment.annualRate);
      const amount = base * rate;
      if (Number.isFinite(amount) && amount !== 0) {
        out.push({
          month,
          accountId: account.id,
          sourceId: account.id,
          sourceKind: "interest",
          amount,
        });
      }
    } else if (account.kind === "property" && account.property && account.property.annualDepreciationRate !== 0) {
      const base = balances[account.id] ?? 0;
      const rate = monthlyCompoundRate(-account.property.annualDepreciationRate);
      const amount = base * rate;
      if (Number.isFinite(amount) && amount !== 0) {
        out.push({
          month,
          accountId: account.id,
          sourceId: account.id,
          sourceKind: "depreciation",
          amount,
        });
      }
    }
  }

  for (const account of plan.accounts) {
    if (account.kind !== "liability" || !account.liability) continue;
    if (!withinPlan(month, start, end)) continue;
    const schedule = liabilitySchedules.get(account.id);
    if (!schedule) continue;
    const payment = schedule.get(month);
    if (!payment) continue;
    const paymentAccountId = account.liability.paymentAccountId;
    if (paymentAccountId) {
      if (payment.interest !== 0) {
        out.push({
          month,
          accountId: paymentAccountId,
          sourceId: account.id,
          sourceKind: "loan_interest",
          amount: -payment.interest,
        });
      }
      if (payment.principal !== 0) {
        out.push({
          month,
          accountId: paymentAccountId,
          sourceId: account.id,
          sourceKind: "loan_principal",
          amount: -payment.principal,
        });
        out.push({
          month,
          accountId: account.id,
          sourceId: account.id,
          sourceKind: "loan_principal",
          amount: payment.principal,
        });
      }
    }
  }

  return out;
}

function buildLiabilitySchedules(plan: Plan): Map<Ulid, Map<YearMonth, LiabilityPayment>> {
  const map = new Map<Ulid, Map<YearMonth, LiabilityPayment>>();
  for (const account of plan.accounts) {
    if (account.kind !== "liability" || !account.liability) continue;
    map.set(account.id, computeLiabilitySchedule(account.liability));
  }
  return map;
}

function applyMonthEntries(balances: Record<Ulid, number>, entries: MonthlyEntry[]): void {
  for (const e of entries) {
    if (e.sourceKind === "snapshot") {
      balances[e.accountId] = e.amount;
    } else {
      balances[e.accountId] = (balances[e.accountId] ?? 0) + e.amount;
    }
  }
}

export function interpret(plan: Plan): MonthlyEntry[] {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const staticByMonth = buildStaticEntriesByMonth(plan);
  const liabilitySchedules = buildLiabilitySchedules(plan);

  const balances: Record<Ulid, number> = {};
  for (const account of plan.accounts) balances[account.id] = 0;

  const entries: MonthlyEntry[] = [];
  for (const month of iterateMonths(start, end)) {
    const dynamic = computeDynamicEntriesForMonth(month, plan, balances, liabilitySchedules);
    const staticEntries = staticByMonth.get(month) ?? [];
    const monthEntries = [...staticEntries, ...dynamic];
    for (const e of monthEntries) entries.push(e);
    applyMonthEntries(balances, monthEntries);
  }
  return entries;
}

// Re-exported type used by tests / UI
export type { Account };
