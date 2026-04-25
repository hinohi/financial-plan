import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { resolveMonthExpr } from "@/lib/dsl/month";
import { exprRefsPerson, grossSalaryRefsPerson, loanRefsPerson, segmentRefsPerson } from "@/lib/dsl/person-refs";
import { emptyPlan } from "@/lib/dsl/plan";
import type {
  Account,
  Category,
  Expense,
  GrossSalary,
  Income,
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
import { decodeSharedPlan, encodePlanForShare, isShareCode } from "@/lib/storage/share";

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
  | { type: "person/remove"; id: Ulid }
  | { type: "persons/reorder"; order: Ulid[] }
  | { type: "accounts/reorder"; order: Ulid[] }
  | { type: "incomes/reorder"; order: Ulid[] }
  | { type: "expenses/reorder"; order: Ulid[] }
  | { type: "transfers/reorder"; order: Ulid[] }
  | { type: "gross-salary/add"; salary: GrossSalary }
  | { type: "gross-salary/update"; id: Ulid; patch: Partial<Omit<GrossSalary, "id">> }
  | { type: "gross-salary/remove"; id: Ulid }
  | { type: "gross-salaries/reorder"; order: Ulid[] };

function updateItem<T extends { id: Ulid }>(list: T[], id: Ulid, patch: Partial<Omit<T, "id">>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function removeItem<T extends { id: Ulid }>(list: T[], id: Ulid): T[] {
  return list.filter((item) => item.id !== id);
}

function reorderItems<T extends { id: Ulid }>(list: T[], order: Ulid[]): T[] {
  const byId = new Map<Ulid, T>();
  for (const item of list) byId.set(item.id, item);
  const out: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      out.push(item);
      byId.delete(id);
    }
  }
  // order に現れなかった要素は末尾に元の順で付ける
  for (const item of list) if (byId.has(item.id)) out.push(item);
  return out;
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

  const snapshots = state.snapshots.filter((s) => !exprRefsPerson(s.month, personId));
  const incomes = state.incomes.filter((i) => !i.segments.some((seg) => segmentRefsPerson(seg, personId)));
  const expenses = state.expenses.filter(
    (e) => !e.segments.some((seg) => segmentRefsPerson(seg, personId)) && !loanRefsPerson(e.loan, personId),
  );
  const events = state.events.filter((ev) => !exprRefsPerson(ev.month, personId));
  const transfers = state.transfers.filter((t) => !t.segments.some((seg) => segmentRefsPerson(seg, personId)));
  const grossSalaries = state.grossSalaries.filter((s) => !grossSalaryRefsPerson(s, personId));

  const settings: PlanSettings = {
    ...state.settings,
    planStartMonth: resolveSettingsMonth(state.settings.planStartMonth, personId, state.persons, yearStart, "1970-01"),
    planEndMonth: resolveSettingsMonth(state.settings.planEndMonth, personId, state.persons, yearStart, "9999-12"),
  };

  return {
    ...state,
    settings,
    persons: remainingPersons,
    snapshots,
    incomes,
    expenses,
    events,
    transfers,
    grossSalaries,
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
        grossSalaries: state.grossSalaries.filter((s) => s.accountId !== action.id),
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
    case "persons/reorder":
      return { ...state, persons: reorderItems(state.persons, action.order) };
    case "accounts/reorder":
      return { ...state, accounts: reorderItems(state.accounts, action.order) };
    case "incomes/reorder":
      return { ...state, incomes: reorderItems(state.incomes, action.order) };
    case "expenses/reorder":
      return { ...state, expenses: reorderItems(state.expenses, action.order) };
    case "transfers/reorder":
      return { ...state, transfers: reorderItems(state.transfers, action.order) };
    case "gross-salary/add":
      return { ...state, grossSalaries: [...state.grossSalaries, action.salary] };
    case "gross-salary/update":
      return { ...state, grossSalaries: updateItem(state.grossSalaries, action.id, action.patch) };
    case "gross-salary/remove":
      return { ...state, grossSalaries: removeItem(state.grossSalaries, action.id) };
    case "gross-salaries/reorder":
      return { ...state, grossSalaries: reorderItems(state.grossSalaries, action.order) };
  }
}

// undo/redo の履歴上限。プラン 1 つあたりセッション内で保持するスナップショット数。
export const HISTORY_LIMIT = 100;

type History = { past: Plan[]; future: Plan[] };

const emptyHistory: History = { past: [], future: [] };

function pushPast(past: Plan[], plan: Plan): Plan[] {
  if (past.length >= HISTORY_LIMIT) {
    return [...past.slice(past.length - HISTORY_LIMIT + 1), plan];
  }
  return [...past, plan];
}

type AppState = {
  registry: Registry;
  plan: Plan;
  history: History;
};

type AppAction =
  | { type: "plan"; action: PlanAction; now: string }
  | { type: "registry/select"; id: Ulid; plan: Plan }
  | { type: "registry/create"; meta: PlanMeta; plan: Plan }
  | { type: "registry/delete"; id: Ulid; nextCurrentId: Ulid; nextPlan: Plan }
  | { type: "registry/rename"; id: Ulid; name: string; now: string }
  | { type: "registry/replace-current"; plan: Plan; now: string }
  | { type: "history/undo"; now: string }
  | { type: "history/redo"; now: string };

function touchMeta(registry: Registry, id: Ulid, now: string): Registry {
  return {
    ...registry,
    plans: registry.plans.map((p) => (p.id === id ? { ...p, updatedAt: now } : p)),
  };
}

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "plan": {
      const nextPlan = planReducer(state.plan, action.action);
      if (nextPlan === state.plan) return state;
      return {
        registry: touchMeta(state.registry, state.registry.currentPlanId, action.now),
        plan: nextPlan,
        history: { past: pushPast(state.history.past, state.plan), future: [] },
      };
    }
    case "registry/select":
      return {
        registry: { ...state.registry, currentPlanId: action.id },
        plan: action.plan,
        history: emptyHistory,
      };
    case "registry/create":
      return {
        registry: { plans: [...state.registry.plans, action.meta], currentPlanId: action.meta.id },
        plan: action.plan,
        history: emptyHistory,
      };
    case "registry/delete": {
      const plans = state.registry.plans.filter((p) => p.id !== action.id);
      // 現在プランが差し替わる場合のみ履歴をリセット。別プランの削除では現在プランの履歴を保つ。
      const historyChanged = action.nextCurrentId !== state.registry.currentPlanId;
      return {
        registry: { plans, currentPlanId: action.nextCurrentId },
        plan: action.nextPlan,
        history: historyChanged ? emptyHistory : state.history,
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
        history: { past: pushPast(state.history.past, state.plan), future: [] },
      };
    case "history/undo": {
      const { past, future } = state.history;
      const prev = past[past.length - 1];
      if (!prev) return state;
      return {
        registry: touchMeta(state.registry, state.registry.currentPlanId, action.now),
        plan: prev,
        history: { past: past.slice(0, -1), future: [...future, state.plan] },
      };
    }
    case "history/redo": {
      const { past, future } = state.history;
      const next = future[future.length - 1];
      if (!next) return state;
      return {
        registry: touchMeta(state.registry, state.registry.currentPlanId, action.now),
        plan: next,
        history: { past: [...past, state.plan], future: future.slice(0, -1) },
      };
    }
  }
}

type PlanContextValue = {
  plan: Plan;
  dispatch: (action: PlanAction) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
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
  buildShareUrl: () => Promise<{ ok: true; url: string } | { ok: false; error: string }>;
  shareImportNotice: ShareImportNotice | null;
  dismissShareImportNotice: () => void;
};

export type ShareImportNotice = { kind: "success"; planName: string } | { kind: "error"; error: string };

const PlanContext = createContext<PlanContextValue | null>(null);
const RegistryContext = createContext<RegistryContextValue | null>(null);

function initialState(): AppState {
  const boot = bootstrap();
  const plan = boot.plans[boot.registry.currentPlanId] ?? emptyPlan();
  return { registry: boot.registry, plan, history: emptyHistory };
}

// prerender (SSR) 用。bootstrap を呼ばず固定 ID の registry と渡された plan で初期化する。
// ID を固定にするのは、ビルド出力の HTML を毎回同一にするため。
const PRERENDER_PLAN_ID = "00000000-0000-4000-8000-000000000000";

function prerenderInitialState(plan: Plan): AppState {
  const meta: PlanMeta = {
    id: PRERENDER_PLAN_ID,
    name: "プラン",
    createdAt: "1970-01-01T00:00:00.000Z",
    updatedAt: "1970-01-01T00:00:00.000Z",
  };
  return {
    registry: { plans: [meta], currentPlanId: meta.id },
    plan,
    history: emptyHistory,
  };
}

const SHARE_IMPORT_PLAN_NAME = "共有から取り込んだプラン";

export function PlanProvider({ children, initialPlan }: { children: ReactNode; initialPlan?: Plan }) {
  const [state, dispatch] = useReducer(
    appReducer,
    undefined,
    initialPlan ? () => prerenderInitialState(initialPlan) : initialState,
  );
  const [shareImportNotice, setShareImportNotice] = useState<ShareImportNotice | null>(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    savePlanById(state.registry.currentPlanId, state.plan);
    saveRegistry(state.registry);
    // 履歴のみ変化した場合に副作用を走らせないよう plan / registry を個別に依存させる
  }, [state.plan, state.registry]);

  const planDispatch = useCallback((action: PlanAction) => {
    dispatch({ type: "plan", action, now: new Date().toISOString() });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: "history/undo", now: new Date().toISOString() });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: "history/redo", now: new Date().toISOString() });
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

  const buildShareUrl = useCallback(async () => {
    try {
      const code = await encodePlanForShare(planRef.current);
      if (typeof window === "undefined") return { ok: false as const, error: "window が利用できません" };
      const { origin, pathname, search } = window.location;
      const url = `${origin}${pathname}${search}#${code}`;
      return { ok: true as const, url };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "共有URLの生成に失敗しました" };
    }
  }, []);

  const dismissShareImportNotice = useCallback(() => setShareImportNotice(null), []);

  // hash fragment に共有コードが載っていれば初回マウント時に新規プランとして取り込む。
  // 取り込み可否に関わらず hash は消して、リロードで重複追加されないようにする。
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    if (!raw || !isShareCode(raw)) return;
    const clearHash = () => {
      try {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {
        // history API が使えない環境 (古いブラウザ等) は諦める。
      }
    };
    let cancelled = false;
    (async () => {
      const result = await decodeSharedPlan(raw);
      clearHash();
      if (cancelled) return;
      if (!result.ok) {
        setShareImportNotice({ kind: "error", error: result.error });
        return;
      }
      savePlanById(registryRef.current.currentPlanId, planRef.current);
      const meta = createPlanMeta(SHARE_IMPORT_PLAN_NAME);
      savePlanById(meta.id, result.plan);
      dispatch({ type: "registry/create", meta, plan: result.plan });
      setShareImportNotice({ kind: "success", planName: meta.name });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;
  const planValue = useMemo<PlanContextValue>(
    () => ({ plan: state.plan, dispatch: planDispatch, undo, redo, canUndo, canRedo }),
    [state.plan, planDispatch, undo, redo, canUndo, canRedo],
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
      buildShareUrl,
      shareImportNotice,
      dismissShareImportNotice,
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
      buildShareUrl,
      shareImportNotice,
      dismissShareImportNotice,
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
