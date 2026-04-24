import { newId } from "@/lib/dsl/id";
import { isMonthExpr, isValidYearMonth } from "@/lib/dsl/month";
import { emptyPlan } from "@/lib/dsl/plan";
import type {
  Account,
  AccountKind,
  Category,
  Expense,
  FlowRaise,
  FlowRaiseKind,
  FlowSegment,
  GrossSalary,
  Income,
  LoanRateSegment,
  LoanSpec,
  MonthExpr,
  OneShotEvent,
  Person,
  Plan,
  PlanSettings,
  Snapshot,
  Transfer,
  Ulid,
  YearStartMonth,
} from "@/lib/dsl/types";
import samplePlanData from "@/lib/sample-plan.json";

const REGISTRY_KEY = "fp.registry.v1";
const PLAN_KEY_PREFIX = "fp.plans.";
const LEGACY_PLAN_KEY = "fp.plan.v1";

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type PlanMeta = {
  id: Ulid;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type Registry = {
  plans: PlanMeta[];
  currentPlanId: Ulid;
};

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function planStorageKey(id: Ulid): string {
  return `${PLAN_KEY_PREFIX}${id}`;
}

function nowIso(now: Date = new Date()): string {
  return now.toISOString();
}

function hydrateCategories(raw: unknown): Category[] {
  if (!Array.isArray(raw)) return [];
  const out: Category[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const c = v as Partial<Category> & { kind?: unknown };
    if (typeof c.id !== "string" || typeof c.label !== "string") continue;
    // 旧 "event" kind は expense に移行する (イベントは収入/支出カテゴリを共用する仕様に変わった)
    const kind: Category["kind"] = c.kind === "income" ? "income" : "expense";
    const parentId = typeof c.parentId === "string" ? c.parentId : undefined;
    out.push({ id: c.id, label: c.label, kind, parentId });
  }
  return out;
}

function hydratePersons(raw: unknown): Person[] {
  if (!Array.isArray(raw)) return [];
  const out: Person[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const p = v as Partial<Person>;
    if (typeof p.id !== "string" || typeof p.label !== "string" || typeof p.birthMonth !== "string") continue;
    if (!isValidYearMonth(p.birthMonth)) continue;
    const person: Person = { id: p.id, label: p.label, birthMonth: p.birthMonth };
    if (typeof p.previousYearIncome === "number" && Number.isFinite(p.previousYearIncome)) {
      person.previousYearIncome = p.previousYearIncome;
    }
    out.push(person);
  }
  return out;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function hydrateMonthExpr(v: unknown): MonthExpr | null {
  return isMonthExpr(v) ? v : null;
}

function hydrateSettings(raw: unknown): PlanSettings | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Partial<PlanSettings> & Record<string, unknown>;
  const ys = s.yearStartMonth;
  if (typeof ys !== "number" || !Number.isInteger(ys) || ys < 1 || ys > 12) return null;
  const start = hydrateMonthExpr(s.planStartMonth);
  if (!start) return null;
  const end = hydrateMonthExpr(s.planEndMonth);
  if (!end) return null;
  return { yearStartMonth: ys as YearStartMonth, planStartMonth: start, planEndMonth: end };
}

function hydrateAccounts(raw: unknown): Account[] {
  if (!Array.isArray(raw)) return [];
  const out: Account[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const a = v as Partial<Account> & { kind?: unknown; investment?: unknown };
    if (typeof a.id !== "string" || typeof a.label !== "string") continue;
    if (a.kind !== "cash" && a.kind !== "investment") continue;
    const account: Account = { id: a.id, label: a.label, kind: a.kind as AccountKind };
    if (a.kind === "investment" && a.investment && typeof a.investment === "object") {
      const rate = (a.investment as { annualRate?: unknown }).annualRate;
      if (isFiniteNumber(rate)) account.investment = { annualRate: rate };
    }
    out.push(account);
  }
  return out;
}

function hydrateSnapshots(raw: unknown): Snapshot[] {
  if (!Array.isArray(raw)) return [];
  const out: Snapshot[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const s = v as Partial<Snapshot> & { month?: unknown; note?: unknown };
    if (typeof s.id !== "string" || typeof s.accountId !== "string") continue;
    if (!isFiniteNumber(s.balance)) continue;
    const month = hydrateMonthExpr(s.month);
    if (!month) continue;
    const snapshot: Snapshot = { id: s.id, accountId: s.accountId, month, balance: s.balance };
    if (typeof s.note === "string") snapshot.note = s.note;
    out.push(snapshot);
  }
  return out;
}

function hydrateFlowRaise(raw: unknown): FlowRaise | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const r = raw as Partial<FlowRaise> & { kind?: unknown };
  if (r.kind !== "fixed" && r.kind !== "rate") return undefined;
  if (!isFiniteNumber(r.value)) return undefined;
  if (!isFiniteNumber(r.everyMonths)) return undefined;
  return { kind: r.kind as FlowRaiseKind, value: r.value, everyMonths: r.everyMonths };
}

function hydrateFlowSegments(raw: unknown): FlowSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: FlowSegment[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const s = v as Partial<FlowSegment> & {
      startMonth?: unknown;
      endMonth?: unknown;
      raise?: unknown;
      note?: unknown;
    };
    const startMonth = hydrateMonthExpr(s.startMonth);
    if (!startMonth) continue;
    if (!isFiniteNumber(s.amount)) continue;
    const seg: FlowSegment = { startMonth, amount: s.amount };
    if (s.endMonth !== undefined) {
      const end = hydrateMonthExpr(s.endMonth);
      if (!end) continue;
      seg.endMonth = end;
    }
    if (isFiniteNumber(s.intervalMonths)) seg.intervalMonths = s.intervalMonths;
    const raise = hydrateFlowRaise(s.raise);
    if (raise) seg.raise = raise;
    if (typeof s.note === "string") seg.note = s.note;
    out.push(seg);
  }
  return out;
}

function hydrateIncomes(raw: unknown): Income[] {
  if (!Array.isArray(raw)) return [];
  const out: Income[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const i = v as Partial<Income> & { categoryId?: unknown };
    if (typeof i.id !== "string" || typeof i.label !== "string" || typeof i.accountId !== "string") continue;
    const income: Income = {
      id: i.id,
      label: i.label,
      accountId: i.accountId,
      segments: hydrateFlowSegments(i.segments),
    };
    if (typeof i.categoryId === "string") income.categoryId = i.categoryId;
    out.push(income);
  }
  return out;
}

function hydrateLoan(raw: unknown): LoanSpec | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const l = raw as Partial<LoanSpec> & { rateSegments?: unknown };
  if (!isFiniteNumber(l.principal)) return undefined;
  if (!Array.isArray(l.rateSegments)) return undefined;
  const rateSegments: LoanRateSegment[] = [];
  for (const v of l.rateSegments) {
    if (!v || typeof v !== "object") continue;
    const r = v as Partial<LoanRateSegment> & { startMonth?: unknown; endMonth?: unknown };
    const startMonth = hydrateMonthExpr(r.startMonth);
    if (!startMonth) continue;
    if (!isFiniteNumber(r.annualRate)) continue;
    const seg: LoanRateSegment = { startMonth, annualRate: r.annualRate };
    if (r.endMonth !== undefined) {
      const end = hydrateMonthExpr(r.endMonth);
      if (!end) continue;
      seg.endMonth = end;
    }
    rateSegments.push(seg);
  }
  return { principal: l.principal, rateSegments };
}

function hydrateExpenses(raw: unknown): Expense[] {
  if (!Array.isArray(raw)) return [];
  const out: Expense[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const e = v as Partial<Expense> & { categoryId?: unknown; loan?: unknown };
    if (typeof e.id !== "string" || typeof e.label !== "string" || typeof e.accountId !== "string") continue;
    const expense: Expense = {
      id: e.id,
      label: e.label,
      accountId: e.accountId,
      segments: hydrateFlowSegments(e.segments),
    };
    if (typeof e.categoryId === "string") expense.categoryId = e.categoryId;
    const loan = hydrateLoan(e.loan);
    if (loan) expense.loan = loan;
    out.push(expense);
  }
  return out;
}

function hydrateEvents(raw: unknown): OneShotEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: OneShotEvent[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const ev = v as Partial<OneShotEvent> & { month?: unknown; categoryId?: unknown; note?: unknown };
    if (typeof ev.id !== "string" || typeof ev.label !== "string" || typeof ev.accountId !== "string") continue;
    const month = hydrateMonthExpr(ev.month);
    if (!month) continue;
    if (!isFiniteNumber(ev.amount)) continue;
    const event: OneShotEvent = { id: ev.id, label: ev.label, accountId: ev.accountId, month, amount: ev.amount };
    if (typeof ev.categoryId === "string") event.categoryId = ev.categoryId;
    if (typeof ev.note === "string") event.note = ev.note;
    out.push(event);
  }
  return out;
}

function hydrateTransfers(raw: unknown): Transfer[] {
  if (!Array.isArray(raw)) return [];
  const out: Transfer[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const t = v as Partial<Transfer> & { minFromBalance?: unknown };
    if (
      typeof t.id !== "string" ||
      typeof t.label !== "string" ||
      typeof t.fromAccountId !== "string" ||
      typeof t.toAccountId !== "string"
    ) {
      continue;
    }
    const transfer: Transfer = {
      id: t.id,
      label: t.label,
      fromAccountId: t.fromAccountId,
      toAccountId: t.toAccountId,
      segments: hydrateFlowSegments(t.segments),
    };
    if (isFiniteNumber(t.minFromBalance)) transfer.minFromBalance = t.minFromBalance;
    out.push(transfer);
  }
  return out;
}

function hydrateGrossSalaries(raw: unknown): GrossSalary[] {
  if (!Array.isArray(raw)) return [];
  const out: GrossSalary[] = [];
  for (const v of raw) {
    if (!v || typeof v !== "object") continue;
    const s = v as Partial<GrossSalary> & {
      startMonth?: unknown;
      endMonth?: unknown;
      raise?: unknown;
      dependents?: unknown;
      hasSpouseDeduction?: unknown;
      note?: unknown;
    };
    if (
      typeof s.id !== "string" ||
      typeof s.label !== "string" ||
      typeof s.accountId !== "string" ||
      typeof s.personId !== "string"
    ) {
      continue;
    }
    if (!isFiniteNumber(s.annualAmount)) continue;
    const startMonth = hydrateMonthExpr(s.startMonth);
    if (!startMonth) continue;
    const salary: GrossSalary = {
      id: s.id,
      label: s.label,
      accountId: s.accountId,
      personId: s.personId,
      annualAmount: s.annualAmount,
      startMonth,
    };
    if (s.endMonth !== undefined) {
      const end = hydrateMonthExpr(s.endMonth);
      if (!end) continue;
      salary.endMonth = end;
    }
    const raise = hydrateFlowRaise(s.raise);
    if (raise) salary.raise = raise;
    if (isFiniteNumber(s.dependents)) salary.dependents = s.dependents;
    if (typeof s.hasSpouseDeduction === "boolean") salary.hasSpouseDeduction = s.hasSpouseDeduction;
    if (typeof s.note === "string") salary.note = s.note;
    out.push(salary);
  }
  return out;
}

export function hydratePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Plan> & Record<string, unknown>;
  if (p.schemaVersion !== undefined && p.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
  const settings = hydrateSettings(p.settings);
  if (!settings) return null;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings,
    persons: hydratePersons(p.persons),
    accounts: hydrateAccounts(p.accounts),
    snapshots: hydrateSnapshots(p.snapshots),
    incomes: hydrateIncomes(p.incomes),
    expenses: hydrateExpenses(p.expenses),
    events: hydrateEvents(p.events),
    transfers: hydrateTransfers(p.transfers),
    categories: hydrateCategories(p.categories),
    grossSalaries: hydrateGrossSalaries(p.grossSalaries),
  };
}

export function hydrateRegistry(raw: unknown): Registry | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<Registry>;
  if (!Array.isArray(r.plans)) return null;
  if (typeof r.currentPlanId !== "string") return null;
  const plans = r.plans.filter(
    (p): p is PlanMeta =>
      p !== null &&
      typeof p === "object" &&
      typeof p.id === "string" &&
      typeof p.name === "string" &&
      typeof p.createdAt === "string" &&
      typeof p.updatedAt === "string",
  );
  if (plans.length === 0) return null;
  const currentPlanId = plans.some((p) => p.id === r.currentPlanId) ? r.currentPlanId : (plans[0]?.id ?? "");
  if (!currentPlanId) return null;
  return { plans, currentPlanId };
}

export function createPlanMeta(name: string, now: Date = new Date()): PlanMeta {
  const iso = nowIso(now);
  return { id: newId(), name, createdAt: iso, updatedAt: iso };
}

export function loadRegistry(): Registry | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(REGISTRY_KEY);
  if (!raw) return null;
  try {
    return hydrateRegistry(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function saveRegistry(registry: Registry): void {
  if (!hasLocalStorage()) return;
  window.localStorage.setItem(REGISTRY_KEY, JSON.stringify(registry));
}

export function loadPlanById(id: Ulid): Plan | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(planStorageKey(id));
  if (!raw) return null;
  try {
    return hydratePlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePlanById(id: Ulid, plan: Plan): void {
  if (!hasLocalStorage()) return;
  window.localStorage.setItem(planStorageKey(id), JSON.stringify(plan));
}

export function removePlanById(id: Ulid): void {
  if (!hasLocalStorage()) return;
  window.localStorage.removeItem(planStorageKey(id));
}

export function loadLegacyPlan(): Plan | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(LEGACY_PLAN_KEY);
  if (!raw) return null;
  try {
    return hydratePlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearLegacyPlan(): void {
  if (!hasLocalStorage()) return;
  window.localStorage.removeItem(LEGACY_PLAN_KEY);
}

export type Bootstrap = {
  registry: Registry;
  plans: Record<Ulid, Plan>;
};

export function bootstrap(now: Date = new Date()): Bootstrap {
  const existing = loadRegistry();
  if (existing) {
    const plans: Record<Ulid, Plan> = {};
    for (const meta of existing.plans) {
      const plan = loadPlanById(meta.id);
      if (plan) plans[meta.id] = plan;
    }
    const knownIds = new Set(existing.plans.map((m) => m.id));
    const available = existing.plans.filter((m) => plans[m.id]);
    if (available.length === existing.plans.length) {
      return { registry: existing, plans };
    }
    const filtered: Registry = {
      plans: available,
      currentPlanId: available.some((m) => m.id === existing.currentPlanId)
        ? existing.currentPlanId
        : (available[0]?.id ?? ""),
    };
    if (filtered.plans.length > 0) {
      saveRegistry(filtered);
      return { registry: filtered, plans };
    }
    void knownIds;
  }

  const legacy = loadLegacyPlan();
  if (legacy) {
    const meta = createPlanMeta("既定のプラン", now);
    const registry: Registry = { plans: [meta], currentPlanId: meta.id };
    savePlanById(meta.id, legacy);
    saveRegistry(registry);
    clearLegacyPlan();
    return { registry, plans: { [meta.id]: legacy } };
  }

  const plan = hydratePlan(samplePlanData) ?? emptyPlan(now);
  const meta = createPlanMeta("サンプル", now);
  const registry: Registry = { plans: [meta], currentPlanId: meta.id };
  savePlanById(meta.id, plan);
  saveRegistry(registry);
  return { registry, plans: { [meta.id]: plan } };
}

export function exportPlanJson(plan: Plan): string {
  return JSON.stringify(plan, null, 2);
}

export function parsePlanJson(json: string): Plan | null {
  try {
    return hydratePlan(JSON.parse(json));
  } catch {
    return null;
  }
}
