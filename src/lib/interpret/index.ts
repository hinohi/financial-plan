import { addMonths, compareYearMonth, iterateMonths, maxYearMonth, minYearMonth, monthDiff } from "@/lib/dsl/month";
import {
  type ResolvedExpense,
  type ResolvedFlowSegment,
  type ResolvedLiabilityParams,
  type ResolvedLoanSpec,
  type ResolvedPlan,
  resolvePlan,
} from "@/lib/dsl/resolve";
import type { Account, MonthlyEntry, Plan, Ulid, YearMonth } from "@/lib/dsl/types";

function withinPlan(month: YearMonth, start: YearMonth, end: YearMonth): boolean {
  return compareYearMonth(month, start) >= 0 && compareYearMonth(month, end) <= 0;
}

export function computeSegmentAmount(segment: ResolvedFlowSegment, month: YearMonth): number {
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
  segment: ResolvedFlowSegment,
  planStart: YearMonth,
  planEnd: YearMonth,
  sign: 1 | -1,
  categoryId: Ulid | undefined,
  out: MonthlyEntry[],
): void {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return;
  const interval = segment.intervalMonths && segment.intervalMonths > 0 ? segment.intervalMonths : 1;
  for (const month of iterateMonths(start, end)) {
    if (interval > 1) {
      const delta = monthDiff(segment.startMonth, month);
      if (delta < 0 || delta % interval !== 0) continue;
    }
    out.push({
      month,
      accountId,
      sourceId,
      sourceKind,
      categoryId,
      amount: Math.trunc(computeSegmentAmount(segment, month) * sign),
    });
  }
}

function emitTransferSegment(
  fromAccountId: Ulid,
  toAccountId: Ulid,
  sourceId: Ulid,
  segment: ResolvedFlowSegment,
  planStart: YearMonth,
  planEnd: YearMonth,
  out: MonthlyEntry[],
): void {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return;
  const interval = segment.intervalMonths && segment.intervalMonths > 0 ? segment.intervalMonths : 1;
  for (const month of iterateMonths(start, end)) {
    if (interval > 1) {
      const delta = monthDiff(segment.startMonth, month);
      if (delta < 0 || delta % interval !== 0) continue;
    }
    const amount = Math.trunc(computeSegmentAmount(segment, month));
    if (amount === 0) continue;
    out.push({ month, accountId: fromAccountId, sourceId, sourceKind: "transfer", amount: -amount });
    out.push({ month, accountId: toAccountId, sourceId, sourceKind: "transfer", amount });
  }
}

export function monthlyCompoundRate(annualRate: number): number {
  if (!Number.isFinite(annualRate)) return 0;
  return (1 + annualRate) ** (1 / 12) - 1;
}

type LiabilityPayment = { interest: number; principal: number };

export function computeLiabilitySchedule(params: ResolvedLiabilityParams): Map<YearMonth, LiabilityPayment> {
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

export function loanMonthlyPayment(balance: number, monthlyRate: number, remainingMonths: number): number {
  if (remainingMonths <= 0 || balance <= 0) return 0;
  if (monthlyRate === 0) return balance / remainingMonths;
  const pow = (1 + monthlyRate) ** remainingMonths;
  return (balance * monthlyRate * pow) / (pow - 1);
}

function emitLoanExpense(
  expense: ResolvedExpense,
  planStart: YearMonth,
  planEnd: YearMonth,
  out: MonthlyEntry[],
): void {
  const loan = expense.loan;
  if (!loan || loan.rateSegments.length === 0 || loan.principal <= 0) return;
  const sorted = [...loan.rateSegments].sort((a, b) => compareYearMonth(a.startMonth, b.startMonth));
  const firstStart = sorted[0]?.startMonth;
  const lastSeg = sorted[sorted.length - 1];
  const lastEnd = lastSeg?.endMonth;
  if (!firstStart || !lastSeg) return;
  const loanEnd = lastEnd ?? planEnd;
  if (compareYearMonth(firstStart, loanEnd) > 0) return;

  let balance = loan.principal;
  for (let i = 0; i < sorted.length; i++) {
    const segStart = sorted[i]?.startMonth;
    if (!segStart) continue;
    const nextSeg = sorted[i + 1];
    const annualRate = sorted[i]?.annualRate ?? 0;
    const segEnd = nextSeg ? addMonths(nextSeg.startMonth, -1) : (sorted[i]?.endMonth ?? loanEnd);
    if (compareYearMonth(segStart, segEnd) > 0) continue;
    if (balance <= 0) break;
    const monthlyRate = annualRate / 12;
    const remainingToLoanEnd = monthDiff(segStart, loanEnd) + 1;
    if (remainingToLoanEnd <= 0) break;
    const payment = loanMonthlyPayment(balance, monthlyRate, remainingToLoanEnd);

    for (const month of iterateMonths(segStart, segEnd)) {
      if (compareYearMonth(month, planEnd) > 0) return;
      if (balance <= 0) break;
      const interest = balance * monthlyRate;
      const principalAmt = Math.min(balance, payment - interest);
      const total = interest + principalAmt;
      balance -= principalAmt;
      if (compareYearMonth(month, planStart) < 0) continue;
      const amount = Math.trunc(-total);
      if (amount === 0) continue;
      out.push({
        month,
        accountId: expense.accountId,
        sourceId: expense.id,
        sourceKind: "expense",
        categoryId: expense.categoryId,
        amount,
      });
    }
  }
}

function isLoanExpense(expense: ResolvedExpense): boolean {
  return !!expense.loan && expense.loan.rateSegments.length > 0 && expense.loan.principal > 0;
}

export function loanTotalMonths(loan: ResolvedLoanSpec): number {
  if (loan.rateSegments.length === 0) return 0;
  const sorted = [...loan.rateSegments].sort((a, b) => compareYearMonth(a.startMonth, b.startMonth));
  const start = sorted[0]?.startMonth;
  const end = sorted[sorted.length - 1]?.endMonth;
  if (!start || !end) return 0;
  return monthDiff(start, end) + 1;
}

function buildStaticEntriesByMonth(plan: ResolvedPlan): Map<YearMonth, MonthlyEntry[]> {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const tmp: MonthlyEntry[] = [];

  for (const snapshot of plan.snapshots) {
    if (!withinPlan(snapshot.month, start, end)) continue;
    tmp.push({
      month: snapshot.month,
      accountId: snapshot.accountId,
      sourceId: snapshot.id,
      sourceKind: "snapshot",
      amount: Math.trunc(snapshot.balance),
    });
  }
  for (const income of plan.incomes) {
    for (const segment of income.segments) {
      emitSegment(income.accountId, income.id, "income", segment, start, end, 1, income.categoryId, tmp);
    }
  }
  for (const expense of plan.expenses) {
    if (isLoanExpense(expense)) {
      emitLoanExpense(expense, start, end, tmp);
      continue;
    }
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
      amount: Math.trunc(event.amount),
    });
  }
  for (const transfer of plan.transfers) {
    if (transfer.fromAccountId === transfer.toAccountId) continue;
    if (transfer.minFromBalance !== undefined) continue;
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
  plan: ResolvedPlan,
  balances: Record<Ulid, number>,
  liabilitySchedules: Map<Ulid, Map<YearMonth, LiabilityPayment>>,
): MonthlyEntry[] {
  const { planStartMonth: start, planEndMonth: end } = plan.settings;
  const out: MonthlyEntry[] = [];

  for (const account of plan.accounts) {
    if (account.kind === "investment" && account.investment && account.investment.annualRate !== 0) {
      const base = balances[account.id] ?? 0;
      const rate = monthlyCompoundRate(account.investment.annualRate);
      const amount = Math.trunc(base * rate);
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
      const amount = Math.trunc(base * rate);
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
      const interest = Math.trunc(payment.interest);
      const principalTrunc = Math.trunc(payment.principal);
      if (interest !== 0) {
        out.push({
          month,
          accountId: paymentAccountId,
          sourceId: account.id,
          sourceKind: "loan_interest",
          amount: -interest,
        });
      }
      if (principalTrunc !== 0) {
        out.push({
          month,
          accountId: paymentAccountId,
          sourceId: account.id,
          sourceKind: "loan_principal",
          amount: -principalTrunc,
        });
        out.push({
          month,
          accountId: account.id,
          sourceId: account.id,
          sourceKind: "loan_principal",
          amount: principalTrunc,
        });
      }
    }
  }

  for (const transfer of plan.transfers) {
    if (transfer.minFromBalance === undefined) continue;
    if (transfer.fromAccountId === transfer.toAccountId) continue;
    for (const segment of transfer.segments) {
      if (!segmentActiveOnMonth(segment, month, start, end)) continue;
      const desired = computeSegmentAmount(segment, month);
      if (desired <= 0) continue;
      const fromBalance = balances[transfer.fromAccountId] ?? 0;
      const available = fromBalance - transfer.minFromBalance;
      const amount = Math.trunc(Math.max(0, Math.min(desired, available)));
      if (amount <= 0) continue;
      out.push({
        month,
        accountId: transfer.fromAccountId,
        sourceId: transfer.id,
        sourceKind: "transfer",
        amount: -amount,
      });
      out.push({
        month,
        accountId: transfer.toAccountId,
        sourceId: transfer.id,
        sourceKind: "transfer",
        amount,
      });
    }
  }

  return out;
}

function segmentActiveOnMonth(
  segment: ResolvedFlowSegment,
  month: YearMonth,
  planStart: YearMonth,
  planEnd: YearMonth,
): boolean {
  const start = maxYearMonth(segment.startMonth, planStart);
  const end = minYearMonth(segment.endMonth ?? planEnd, planEnd);
  if (compareYearMonth(start, end) > 0) return false;
  if (compareYearMonth(month, start) < 0 || compareYearMonth(month, end) > 0) return false;
  const interval = segment.intervalMonths && segment.intervalMonths > 0 ? segment.intervalMonths : 1;
  if (interval > 1) {
    const delta = monthDiff(segment.startMonth, month);
    if (delta < 0 || delta % interval !== 0) return false;
  }
  return true;
}

function buildLiabilitySchedules(plan: ResolvedPlan): Map<Ulid, Map<YearMonth, LiabilityPayment>> {
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
  const resolved = resolvePlan(plan);
  const { planStartMonth: start, planEndMonth: end } = resolved.settings;
  const staticByMonth = buildStaticEntriesByMonth(resolved);
  const liabilitySchedules = buildLiabilitySchedules(resolved);

  const balances: Record<Ulid, number> = {};
  for (const account of resolved.accounts) balances[account.id] = 0;

  const entries: MonthlyEntry[] = [];
  for (const month of iterateMonths(start, end)) {
    const dynamic = computeDynamicEntriesForMonth(month, resolved, balances, liabilitySchedules);
    const staticEntries = staticByMonth.get(month) ?? [];
    const monthEntries = [...staticEntries, ...dynamic];
    for (const e of monthEntries) entries.push(e);
    applyMonthEntries(balances, monthEntries);
  }
  return entries;
}

// Re-exported type used by tests / UI
export type { Account };
