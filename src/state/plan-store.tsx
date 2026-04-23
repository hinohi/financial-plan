import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { isPersonAgeRef, resolveMonthExpr } from "@/lib/dsl/month";
import { emptyPlan } from "@/lib/dsl/plan";
import type {
  Account,
  Category,
  Expense,
  FlowSegment,
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
  YearMonth,
} from "@/lib/dsl/types";
import {
  bootstrap,
  createPlanMeta,
  exportPlanJson,
  loadPlanById,
  type PlanMeta,
  parsePlanJson,
  type Registry,
  removePlanById,
  savePlanById,
  saveRegistry,
} from "@/lib/storage";

export type PlanAction =
  | { type: "plan/replace"; plan: Plan }
  | { type: "settings/update"; patch: Partial<PlanSettings> }
  | { type: "account/add"; account: Account }
  | { type: "account/update"; id: Ulid; patch: Partial<Omit<Account, "id">> }
  | { type: "account/remove"; id: Ulid }
  | { type: "snapshot/add"; snapshot: Snapshot }
  | { type: "snapshot/update"; id: Ulid; patch: Partial<Omit<Snapshot, "id">> }
  | { type: "snapshot/remove"; id: Ulid }
  | { type: "income/add"; income: Income }
  | { type: "income/update"; id: Ulid; patch: Partial<Omit<Income, "id">> }
  | { type: "income/remove"; id: Ulid }
  | { type: "expense/add"; expense: Expense }
  | { type: "expense/update"; id: Ulid; patch: Partial<Omit<Expense, "id">> }
  | { type: "expense/remove"; id: Ulid }
  | { type: "event/add"; event: OneShotEvent }
  | { type: "event/update"; id: Ulid; patch: Partial<Omit<OneShotEvent, "id">> }
  | { type: "event/remove"; id: Ulid }
  | { type: "transfer/add"; transfer: Transfer }
  | { type: "transfer/update"; id: Ulid; patch: Partial<Omit<Transfer, "id">> }
  | { type: "transfer/remove"; id: Ulid }
  | { type: "category/add"; category: Category }
  | { type: "category/update"; id: Ulid; patch: Partial<Omit<Category, "id">> }
  | { type: "category/remove"; id: Ulid }
  | { type: "person/add"; person: Person }
  | { type: "person/update"; id: Ulid; patch: Partial<Omit<Person, "id">> }
  | { type: "person/remove"; id: Ulid };

function updateItem<T extends { id: Ulid }>(list: T[], id: Ulid, patch: Partial<Omit<T, "id">>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function removeItem<T extends { id: Ulid }>(list: T[], id: Ulid): T[] {
  return list.filter((item) => item.id !== id);
}

function exprRefsPerson(expr: MonthExpr | undefined, personId: Ulid): boolean {
  return !!expr && isPersonAgeRef(expr) && expr.personId === personId;
}

function segmentRefsPerson(segment: FlowSegment, personId: Ulid): boolean {
  return exprRefsPerson(segment.startMonth, personId) || exprRefsPerson(segment.endMonth, personId);
}

function loanRateSegmentRefsPerson(rs: LoanRateSegment, personId: Ulid): boolean {
  return exprRefsPerson(rs.startMonth, personId) || exprRefsPerson(rs.endMonth, personId);
}

function loanRefsPerson(loan: LoanSpec | undefined, personId: Ulid): boolean {
  if (!loan) return false;
  return loan.rateSegments.some((rs) => loanRateSegmentRefsPerson(rs, personId));
}

function resolveSettingsMonth(
  expr: MonthExpr,
  personId: Ulid,
  persons: Person[],
  yearStart: PlanSettings["yearStartMonth"],
  fallback: YearMonth,
): MonthExpr {
  if (!exprRefsPerson(expr, personId)) return expr;
  return resolveMonthExpr(expr, persons, yearStart) ?? fallback;
}

function cascadePersonRemoval(state: Plan, personId: Ulid): Plan {
  const remainingPersons = removeItem(state.persons, personId);
  const yearStart = state.settings.yearStartMonth;

  const accounts = state.accounts.filter((a) => !(a.liability && exprRefsPerson(a.liability.startMonth, personId)));
  const removedAccountIds = new Set<Ulid>();
  for (const a of state.accounts) if (!accounts.some((x) => x.id === a.id)) removedAccountIds.add(a.id);

  const snapshots = state.snapshots.filter(
    (s) => !removedAccountIds.has(s.accountId) && !exprRefsPerson(s.month, personId),
  );
  const incomes = state.incomes.filter(
    (i) => !removedAccountIds.has(i.accountId) && !i.segments.some((seg) => segmentRefsPerson(seg, personId)),
  );
  const expenses = state.expenses.filter(
    (e) =>
      !removedAccountIds.has(e.accountId) &&
      !e.segments.some((seg) => segmentRefsPerson(seg, personId)) &&
      !loanRefsPerson(e.loan, personId),
  );
  const events = state.events.filter(
    (ev) => !removedAccountIds.has(ev.accountId) && !exprRefsPerson(ev.month, personId),
  );
  const transfers = state.transfers.filter(
    (t) =>
      !removedAccountIds.has(t.fromAccountId) &&
      !removedAccountIds.has(t.toAccountId) &&
      !t.segments.some((seg) => segmentRefsPerson(seg, personId)),
  );

  const settings: PlanSettings = {
    ...state.settings,
    planStartMonth: resolveSettingsMonth(state.settings.planStartMonth, personId, state.persons, yearStart, "1970-01"),
    planEndMonth: resolveSettingsMonth(state.settings.planEndMonth, personId, state.persons, yearStart, "9999-12"),
  };

  return {
    ...state,
    settings,
    persons: remainingPersons,
    accounts,
    snapshots,
    incomes,
    expenses,
    events,
    transfers,
  };
}

export function planReducer(state: Plan, action: PlanAction): Plan {
  switch (action.type) {
    case "plan/replace":
      return action.plan;
    case "settings/update":
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case "account/add":
      return { ...state, accounts: [...state.accounts, action.account] };
    case "account/update":
      return { ...state, accounts: updateItem(state.accounts, action.id, action.patch) };
    case "account/remove":
      return {
        ...state,
        accounts: removeItem(state.accounts, action.id),
        snapshots: state.snapshots.filter((s) => s.accountId !== action.id),
        incomes: state.incomes.filter((i) => i.accountId !== action.id),
        expenses: state.expenses.filter((e) => e.accountId !== action.id),
        events: state.events.filter((e) => e.accountId !== action.id),
        transfers: state.transfers.filter((t) => t.fromAccountId !== action.id && t.toAccountId !== action.id),
      };
    case "snapshot/add":
      return { ...state, snapshots: [...state.snapshots, action.snapshot] };
    case "snapshot/update":
      return { ...state, snapshots: updateItem(state.snapshots, action.id, action.patch) };
    case "snapshot/remove":
      return { ...state, snapshots: removeItem(state.snapshots, action.id) };
    case "income/add":
      return { ...state, incomes: [...state.incomes, action.income] };
    case "income/update":
      return { ...state, incomes: updateItem(state.incomes, action.id, action.patch) };
    case "income/remove":
      return { ...state, incomes: removeItem(state.incomes, action.id) };
    case "expense/add":
      return { ...state, expenses: [...state.expenses, action.expense] };
    case "expense/update":
      return { ...state, expenses: updateItem(state.expenses, action.id, action.patch) };
    case "expense/remove":
      return { ...state, expenses: removeItem(state.expenses, action.id) };
    case "event/add":
      return { ...state, events: [...state.events, action.event] };
    case "event/update":
      return { ...state, events: updateItem(state.events, action.id, action.patch) };
    case "event/remove":
      return { ...state, events: removeItem(state.events, action.id) };
    case "transfer/add":
      return { ...state, transfers: [...state.transfers, action.transfer] };
    case "transfer/update":
      return { ...state, transfers: updateItem(state.transfers, action.id, action.patch) };
    case "transfer/remove":
      return { ...state, transfers: removeItem(state.transfers, action.id) };
    case "category/add":
      return { ...state, categories: [...state.categories, action.category] };
    case "category/update":
      return { ...state, categories: updateItem(state.categories, action.id, action.patch) };
    case "category/remove": {
      const clearRef = <T extends { categoryId?: Ulid }>(items: T[]): T[] =>
        items.map((item) => (item.categoryId === action.id ? { ...item, categoryId: undefined } : item));
      return {
        ...state,
        categories: state.categories
          .filter((c) => c.id !== action.id)
          .map((c) => (c.parentId === action.id ? { ...c, parentId: undefined } : c)),
        incomes: clearRef(state.incomes),
        expenses: clearRef(state.expenses),
        events: clearRef(state.events),
      };
    }
    case "person/add":
      return { ...state, persons: [...state.persons, action.person] };
    case "person/update":
      return { ...state, persons: updateItem(state.persons, action.id, action.patch) };
    case "person/remove":
      return cascadePersonRemoval(state, action.id);
  }
}

type AppState = {
  registry: Registry;
  plan: Plan;
};

type AppAction =
  | { type: "plan"; action: PlanAction; now: string }
  | { type: "registry/select"; id: Ulid; plan: Plan }
  | { type: "registry/create"; meta: PlanMeta; plan: Plan }
  | { type: "registry/delete"; id: Ulid; nextCurrentId: Ulid; nextPlan: Plan }
  | { type: "registry/rename"; id: Ulid; name: string; now: string }
  | { type: "registry/replace-current"; plan: Plan; now: string };

function touchMeta(registry: Registry, id: Ulid, now: string): Registry {
  return {
    ...registry,
    plans: registry.plans.map((p) => (p.id === id ? { ...p, updatedAt: now } : p)),
  };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "plan": {
      const nextPlan = planReducer(state.plan, action.action);
      if (nextPlan === state.plan) return state;
      return {
        registry: touchMeta(state.registry, state.registry.currentPlanId, action.now),
        plan: nextPlan,
      };
    }
    case "registry/select":
      return { registry: { ...state.registry, currentPlanId: action.id }, plan: action.plan };
    case "registry/create":
      return {
        registry: { plans: [...state.registry.plans, action.meta], currentPlanId: action.meta.id },
        plan: action.plan,
      };
    case "registry/delete": {
      const plans = state.registry.plans.filter((p) => p.id !== action.id);
      return {
        registry: { plans, currentPlanId: action.nextCurrentId },
        plan: action.nextPlan,
      };
    }
    case "registry/rename":
      return {
        ...state,
        registry: {
          ...state.registry,
          plans: state.registry.plans.map((p) =>
            p.id === action.id ? { ...p, name: action.name, updatedAt: action.now } : p,
          ),
        },
      };
    case "registry/replace-current":
      return {
        registry: touchMeta(state.registry, state.registry.currentPlanId, action.now),
        plan: action.plan,
      };
  }
}

type PlanContextValue = {
  plan: Plan;
  dispatch: (action: PlanAction) => void;
};

type RegistryContextValue = {
  registry: Registry;
  createPlan: (name: string) => void;
  selectPlan: (id: Ulid) => void;
  renamePlan: (id: Ulid, name: string) => void;
  deletePlan: (id: Ulid) => void;
  exportCurrentPlan: () => string;
  importPlanAsNew: (json: string, name?: string) => { ok: true } | { ok: false; error: string };
  replaceCurrentPlan: (json: string) => { ok: true } | { ok: false; error: string };
};

const PlanContext = createContext<PlanContextValue | null>(null);
const RegistryContext = createContext<RegistryContextValue | null>(null);

function initialState(): AppState {
  const boot = bootstrap();
  const plan = boot.plans[boot.registry.currentPlanId] ?? emptyPlan();
  return { registry: boot.registry, plan };
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, undefined, initialState);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    savePlanById(state.registry.currentPlanId, state.plan);
    saveRegistry(state.registry);
  }, [state]);

  const planDispatch = useCallback((action: PlanAction) => {
    dispatch({ type: "plan", action, now: new Date().toISOString() });
  }, []);

  const registryRef = useRef(state.registry);
  registryRef.current = state.registry;
  const planRef = useRef(state.plan);
  planRef.current = state.plan;

  const createPlan = useCallback((name: string) => {
    savePlanById(registryRef.current.currentPlanId, planRef.current);
    const meta = createPlanMeta(name.trim() === "" ? "新しいプラン" : name.trim());
    const plan = emptyPlan();
    savePlanById(meta.id, plan);
    dispatch({ type: "registry/create", meta, plan });
  }, []);

  const selectPlan = useCallback((id: Ulid) => {
    if (id === registryRef.current.currentPlanId) return;
    savePlanById(registryRef.current.currentPlanId, planRef.current);
    const next = loadPlanById(id) ?? emptyPlan();
    dispatch({ type: "registry/select", id, plan: next });
  }, []);

  const renamePlan = useCallback((id: Ulid, name: string) => {
    const trimmed = name.trim();
    if (trimmed === "") return;
    dispatch({ type: "registry/rename", id, name: trimmed, now: new Date().toISOString() });
  }, []);

  const deletePlan = useCallback((id: Ulid) => {
    const { plans, currentPlanId } = registryRef.current;
    if (plans.length <= 1) return;
    if (currentPlanId === id) {
      const nextMeta = plans.find((p) => p.id !== id);
      if (!nextMeta) return;
      const nextPlan = loadPlanById(nextMeta.id) ?? emptyPlan();
      dispatch({ type: "registry/delete", id, nextCurrentId: nextMeta.id, nextPlan });
    } else {
      dispatch({ type: "registry/delete", id, nextCurrentId: currentPlanId, nextPlan: planRef.current });
    }
    removePlanById(id);
  }, []);

  const exportCurrentPlan = useCallback(() => exportPlanJson(planRef.current), []);

  const importPlanAsNew = useCallback((json: string, name?: string) => {
    const plan = parsePlanJson(json);
    if (!plan) return { ok: false as const, error: "JSON が不正、または schemaVersion が未対応です" };
    savePlanById(registryRef.current.currentPlanId, planRef.current);
    const meta = createPlanMeta(name?.trim() || "インポートしたプラン");
    savePlanById(meta.id, plan);
    dispatch({ type: "registry/create", meta, plan });
    return { ok: true as const };
  }, []);

  const replaceCurrentPlan = useCallback((json: string) => {
    const plan = parsePlanJson(json);
    if (!plan) return { ok: false as const, error: "JSON が不正、または schemaVersion が未対応です" };
    dispatch({ type: "registry/replace-current", plan, now: new Date().toISOString() });
    return { ok: true as const };
  }, []);

  const planValue = useMemo<PlanContextValue>(
    () => ({ plan: state.plan, dispatch: planDispatch }),
    [state.plan, planDispatch],
  );
  const registryValue = useMemo<RegistryContextValue>(
    () => ({
      registry: state.registry,
      createPlan,
      selectPlan,
      renamePlan,
      deletePlan,
      exportCurrentPlan,
      importPlanAsNew,
      replaceCurrentPlan,
    }),
    [
      state.registry,
      createPlan,
      selectPlan,
      renamePlan,
      deletePlan,
      exportCurrentPlan,
      importPlanAsNew,
      replaceCurrentPlan,
    ],
  );

  return (
    <RegistryContext.Provider value={registryValue}>
      <PlanContext.Provider value={planValue}>{children}</PlanContext.Provider>
    </RegistryContext.Provider>
  );
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}

export function usePlanRegistry(): RegistryContextValue {
  const ctx = useContext(RegistryContext);
  if (!ctx) throw new Error("usePlanRegistry must be used within PlanProvider");
  return ctx;
}
