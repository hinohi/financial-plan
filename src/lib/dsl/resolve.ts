import { resolveMonthExpr } from "./month";
import type {
  Account,
  Expense,
  FlowSegment,
  GrossSalary,
  Income,
  LiabilityParams,
  LoanRateSegment,
  LoanSpec,
  MonthExpr,
  OneShotEvent,
  Person,
  Plan,
  PlanSettings,
  Snapshot,
  Transfer,
  YearMonth,
  YearStartMonth,
} from "./types";

export type ResolvedSnapshot = Omit<Snapshot, "month"> & { month: YearMonth };
export type ResolvedFlowSegment = Omit<FlowSegment, "startMonth" | "endMonth"> & {
  startMonth: YearMonth;
  endMonth?: YearMonth;
};
export type ResolvedLoanRateSegment = Omit<LoanRateSegment, "startMonth" | "endMonth"> & {
  startMonth: YearMonth;
  endMonth?: YearMonth;
};
export type ResolvedLoanSpec = Omit<LoanSpec, "rateSegments"> & { rateSegments: ResolvedLoanRateSegment[] };
export type ResolvedIncome = Omit<Income, "segments"> & { segments: ResolvedFlowSegment[] };
export type ResolvedExpense = Omit<Expense, "segments" | "loan"> & {
  segments: ResolvedFlowSegment[];
  loan?: ResolvedLoanSpec;
};
export type ResolvedEvent = Omit<OneShotEvent, "month"> & { month: YearMonth };
export type ResolvedTransfer = Omit<Transfer, "segments"> & { segments: ResolvedFlowSegment[] };
export type ResolvedGrossSalary = Omit<GrossSalary, "startMonth" | "endMonth"> & {
  startMonth: YearMonth;
  endMonth?: YearMonth;
};
export type ResolvedLiabilityParams = Omit<LiabilityParams, "startMonth"> & { startMonth: YearMonth };
export type ResolvedAccount = Omit<Account, "liability"> & { liability?: ResolvedLiabilityParams };
export type ResolvedPlanSettings = Omit<PlanSettings, "planStartMonth" | "planEndMonth"> & {
  planStartMonth: YearMonth;
  planEndMonth: YearMonth;
};
export type ResolvedPlan = Omit<
  Plan,
  "settings" | "accounts" | "snapshots" | "incomes" | "expenses" | "events" | "transfers" | "grossSalaries"
> & {
  settings: ResolvedPlanSettings;
  accounts: ResolvedAccount[];
  snapshots: ResolvedSnapshot[];
  incomes: ResolvedIncome[];
  expenses: ResolvedExpense[];
  events: ResolvedEvent[];
  transfers: ResolvedTransfer[];
  grossSalaries: ResolvedGrossSalary[];
};

const FALLBACK_START: YearMonth = "1970-01";
const FALLBACK_END: YearMonth = "9999-12";

function tryResolve(expr: MonthExpr, persons: Person[], yearStart: YearStartMonth): YearMonth | null {
  if (typeof expr === "string") return expr;
  return resolveMonthExpr(expr, persons, yearStart);
}

function tryResolveOptional(
  expr: MonthExpr | undefined,
  persons: Person[],
  yearStart: YearStartMonth,
): { ok: true; value: YearMonth | undefined } | { ok: false } {
  if (expr === undefined) return { ok: true, value: undefined };
  const r = tryResolve(expr, persons, yearStart);
  if (r === null) return { ok: false };
  return { ok: true, value: r };
}

function resolveSegment(
  segment: FlowSegment,
  persons: Person[],
  yearStart: YearStartMonth,
): ResolvedFlowSegment | null {
  const start = tryResolve(segment.startMonth, persons, yearStart);
  if (start === null) return null;
  const end = tryResolveOptional(segment.endMonth, persons, yearStart);
  if (!end.ok) return null;
  return { ...segment, startMonth: start, endMonth: end.value };
}

function resolveSegments(segments: FlowSegment[], persons: Person[], yearStart: YearStartMonth): ResolvedFlowSegment[] {
  const out: ResolvedFlowSegment[] = [];
  for (const s of segments) {
    const r = resolveSegment(s, persons, yearStart);
    if (r) out.push(r);
  }
  return out;
}

function resolveLoan(
  loan: LoanSpec | undefined,
  persons: Person[],
  yearStart: YearStartMonth,
): ResolvedLoanSpec | undefined {
  if (!loan) return undefined;
  const rateSegments: ResolvedLoanRateSegment[] = [];
  for (const rs of loan.rateSegments) {
    const start = tryResolve(rs.startMonth, persons, yearStart);
    if (start === null) continue;
    const end = tryResolveOptional(rs.endMonth, persons, yearStart);
    if (!end.ok) continue;
    rateSegments.push({ ...rs, startMonth: start, endMonth: end.value });
  }
  return { ...loan, rateSegments };
}

export function resolvePlan(plan: Plan): ResolvedPlan {
  const { persons, settings } = plan;
  const yearStart = settings.yearStartMonth;

  const planStartMonth = tryResolve(settings.planStartMonth, persons, yearStart) ?? FALLBACK_START;
  const planEndMonth = tryResolve(settings.planEndMonth, persons, yearStart) ?? FALLBACK_END;

  const accounts: ResolvedAccount[] = [];
  for (const a of plan.accounts) {
    if (a.liability) {
      const start = tryResolve(a.liability.startMonth, persons, yearStart);
      if (start === null) continue;
      accounts.push({ ...a, liability: { ...a.liability, startMonth: start } });
    } else {
      accounts.push({ ...a, liability: undefined });
    }
  }

  const snapshots: ResolvedSnapshot[] = [];
  for (const s of plan.snapshots) {
    const m = tryResolve(s.month, persons, yearStart);
    if (m === null) continue;
    snapshots.push({ ...s, month: m });
  }

  const incomes: ResolvedIncome[] = plan.incomes.map((i) => ({
    ...i,
    segments: resolveSegments(i.segments, persons, yearStart),
  }));

  const expenses: ResolvedExpense[] = plan.expenses.map((e) => ({
    ...e,
    segments: resolveSegments(e.segments, persons, yearStart),
    loan: resolveLoan(e.loan, persons, yearStart),
  }));

  const events: ResolvedEvent[] = [];
  for (const ev of plan.events) {
    const m = tryResolve(ev.month, persons, yearStart);
    if (m === null) continue;
    events.push({ ...ev, month: m });
  }

  const transfers: ResolvedTransfer[] = plan.transfers.map((t) => ({
    ...t,
    segments: resolveSegments(t.segments, persons, yearStart),
  }));

  const grossSalaries: ResolvedGrossSalary[] = [];
  for (const s of plan.grossSalaries ?? []) {
    const start = tryResolve(s.startMonth, persons, yearStart);
    if (start === null) continue;
    const end = tryResolveOptional(s.endMonth, persons, yearStart);
    if (!end.ok) continue;
    grossSalaries.push({ ...s, startMonth: start, endMonth: end.value });
  }

  return {
    ...plan,
    settings: { ...settings, planStartMonth, planEndMonth },
    accounts,
    snapshots,
    incomes,
    expenses,
    events,
    transfers,
    grossSalaries,
  };
}
