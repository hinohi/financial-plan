import { iterateMonths, parseYearMonth } from "@/lib/dsl/month";
import type { MonthlyEntry, Plan, Ulid, YearMonth, YearStartMonth } from "@/lib/dsl/types";

export type AggregatePeriod = "monthly" | "yearly";

export type BalancePoint = {
  period: string;
  month: YearMonth;
  total: number;
  byAccount: Record<Ulid, number>;
};

export type ViewData = {
  period: AggregatePeriod;
  points: BalancePoint[];
};

type PerMonthPerAccount = Map<YearMonth, Map<Ulid, { snapshot?: number; flow: number }>>;

function groupEntries(entries: MonthlyEntry[]): PerMonthPerAccount {
  const map: PerMonthPerAccount = new Map();
  for (const e of entries) {
    let byAccount = map.get(e.month);
    if (!byAccount) {
      byAccount = new Map();
      map.set(e.month, byAccount);
    }
    let bucket = byAccount.get(e.accountId);
    if (!bucket) {
      bucket = { flow: 0 };
      byAccount.set(e.accountId, bucket);
    }
    if (e.sourceKind === "snapshot") {
      bucket.snapshot = e.amount;
    } else {
      bucket.flow += e.amount;
    }
  }
  return map;
}

function computeMonthlyBalances(plan: Plan, entries: MonthlyEntry[]): BalancePoint[] {
  const grouped = groupEntries(entries);
  const balances: Record<Ulid, number> = {};
  for (const account of plan.accounts) balances[account.id] = 0;

  const points: BalancePoint[] = [];
  for (const month of iterateMonths(plan.settings.planStartMonth, plan.settings.planEndMonth)) {
    const monthBuckets = grouped.get(month);
    for (const account of plan.accounts) {
      const bucket = monthBuckets?.get(account.id);
      if (!bucket) continue;
      if (bucket.snapshot !== undefined) {
        balances[account.id] = bucket.snapshot;
      } else {
        balances[account.id] = (balances[account.id] ?? 0) + bucket.flow;
      }
    }
    let total = 0;
    const snapshot: Record<Ulid, number> = {};
    for (const account of plan.accounts) {
      const v = balances[account.id] ?? 0;
      snapshot[account.id] = v;
      total += v;
    }
    points.push({ period: month, month, total, byAccount: snapshot });
  }
  return points;
}

function toYearLabel(month: YearMonth, yearStartMonth: YearStartMonth): string {
  const { year, month: m } = parseYearMonth(month);
  const fiscalYear = m >= yearStartMonth ? year : year - 1;
  return yearStartMonth === 1 ? String(fiscalYear) : `${fiscalYear}年度`;
}

function toYearly(monthly: BalancePoint[], yearStartMonth: YearStartMonth): BalancePoint[] {
  const byYear = new Map<string, BalancePoint>();
  for (const p of monthly) {
    const label = toYearLabel(p.month, yearStartMonth);
    byYear.set(label, { ...p, period: label });
  }
  return [...byYear.values()];
}

export function aggregate(plan: Plan, entries: MonthlyEntry[], options: { period: AggregatePeriod }): ViewData {
  const monthly = computeMonthlyBalances(plan, entries);
  if (options.period === "monthly") {
    return { period: "monthly", points: monthly };
  }
  return { period: "yearly", points: toYearly(monthly, plan.settings.yearStartMonth) };
}
