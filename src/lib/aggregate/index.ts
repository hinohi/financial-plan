import { iterateMonths, parseYearMonth } from "@/lib/dsl/month";
import type { Category, CategoryKind, MonthlyEntry, Plan, Ulid, YearMonth, YearStartMonth } from "@/lib/dsl/types";

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

export const UNCATEGORIZED_KEY = "__uncategorized__";
export const SYSTEM_INTEREST_KEY = "__interest__";
export const SYSTEM_DEPRECIATION_KEY = "__depreciation__";
export const SYSTEM_LOAN_INTEREST_KEY = "__loan_interest__";

export const SYSTEM_CATEGORY_LABEL: Record<string, string> = {
  [UNCATEGORIZED_KEY]: "未分類",
  [SYSTEM_INTEREST_KEY]: "運用益",
  [SYSTEM_DEPRECIATION_KEY]: "減価",
  [SYSTEM_LOAN_INTEREST_KEY]: "支払利息",
};

export type CategoryGroup = "leaf" | "top";

export type FlowPoint = {
  period: string;
  month: YearMonth;
  total: number;
  byCategory: Record<string, number>;
};

export type FlowViewData = {
  kind: CategoryKind;
  period: AggregatePeriod;
  group: CategoryGroup;
  points: FlowPoint[];
  categoryOrder: string[];
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

function topAncestor(categoryId: Ulid, byId: Map<Ulid, Category>): Ulid {
  const seen = new Set<Ulid>();
  let cur: Ulid = categoryId;
  while (true) {
    if (seen.has(cur)) return cur;
    seen.add(cur);
    const c = byId.get(cur);
    if (!c?.parentId) return cur;
    cur = c.parentId;
  }
}

function resolveCategoryKey(
  entry: MonthlyEntry,
  kind: CategoryKind,
  byId: Map<Ulid, Category>,
  group: CategoryGroup,
): string | null {
  if (entry.sourceKind === "interest") return SYSTEM_INTEREST_KEY;
  if (entry.sourceKind === "depreciation") return SYSTEM_DEPRECIATION_KEY;
  if (entry.sourceKind === "loan_interest") return SYSTEM_LOAN_INTEREST_KEY;
  const categoryId = entry.categoryId;
  if (!categoryId) return UNCATEGORIZED_KEY;
  const category = byId.get(categoryId);
  if (!category || category.kind !== kind) return UNCATEGORIZED_KEY;
  if (group === "leaf") return categoryId;
  return topAncestor(categoryId, byId);
}

function matchesKind(entry: MonthlyEntry, kind: CategoryKind): boolean {
  if (kind === "income") {
    return (
      entry.sourceKind === "income" ||
      entry.sourceKind === "interest" ||
      (entry.sourceKind === "event" && entry.amount > 0)
    );
  }
  if (kind === "expense") {
    return (
      entry.sourceKind === "expense" ||
      entry.sourceKind === "depreciation" ||
      entry.sourceKind === "loan_interest" ||
      (entry.sourceKind === "event" && entry.amount < 0)
    );
  }
  return entry.sourceKind === "event";
}

function flowPeriodLabel(month: YearMonth, period: AggregatePeriod, yearStartMonth: YearStartMonth): string {
  if (period === "monthly") return month;
  return toYearLabel(month, yearStartMonth);
}

export function aggregateFlow(
  plan: Plan,
  entries: MonthlyEntry[],
  options: { kind: CategoryKind; period: AggregatePeriod; group: CategoryGroup },
): FlowViewData {
  const { kind, period, group } = options;
  const byId = new Map<Ulid, Category>();
  for (const c of plan.categories) byId.set(c.id, c);

  const periodBuckets = new Map<string, { month: YearMonth; byCategory: Map<string, number> }>();
  for (const month of iterateMonths(plan.settings.planStartMonth, plan.settings.planEndMonth)) {
    const periodKey = flowPeriodLabel(month, period, plan.settings.yearStartMonth);
    if (!periodBuckets.has(periodKey)) periodBuckets.set(periodKey, { month, byCategory: new Map() });
  }

  const usedKeys = new Set<string>();
  for (const entry of entries) {
    if (!matchesKind(entry, kind)) continue;
    const periodKey = flowPeriodLabel(entry.month, period, plan.settings.yearStartMonth);
    const bucket = periodBuckets.get(periodKey);
    if (!bucket) continue;
    const categoryKey = resolveCategoryKey(entry, kind, byId, group);
    if (categoryKey === null) continue;
    const sign = kind === "expense" ? -1 : 1;
    const value = entry.amount * sign;
    bucket.byCategory.set(categoryKey, (bucket.byCategory.get(categoryKey) ?? 0) + value);
    usedKeys.add(categoryKey);
  }

  const categoryOrder: string[] = [];
  for (const category of plan.categories) {
    if (category.kind !== kind) continue;
    if (group === "top" && category.parentId) continue;
    if (usedKeys.has(category.id)) categoryOrder.push(category.id);
  }
  const systemKeysOrder = [SYSTEM_INTEREST_KEY, SYSTEM_DEPRECIATION_KEY, SYSTEM_LOAN_INTEREST_KEY];
  for (const key of systemKeysOrder) {
    if (usedKeys.has(key)) categoryOrder.push(key);
  }
  if (usedKeys.has(UNCATEGORIZED_KEY)) categoryOrder.push(UNCATEGORIZED_KEY);

  const points: FlowPoint[] = [];
  for (const [periodKey, bucket] of periodBuckets) {
    const byCategory: Record<string, number> = {};
    let total = 0;
    for (const key of categoryOrder) {
      const v = bucket.byCategory.get(key) ?? 0;
      byCategory[key] = v;
      total += v;
    }
    points.push({ period: periodKey, month: bucket.month, total, byCategory });
  }

  return { kind, period, group, points, categoryOrder };
}
