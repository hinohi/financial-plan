import { createContext, type ReactNode, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import { emptyPlan } from "@/lib/dsl/plan";
import type {
  Account,
  Category,
  Expense,
  Income,
  OneShotEvent,
  Plan,
  PlanSettings,
  Snapshot,
  Transfer,
  Ulid,
} from "@/lib/dsl/types";
import { loadPlan, savePlan } from "@/lib/storage";

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
  | { type: "category/remove"; id: Ulid };

function updateItem<T extends { id: Ulid }>(list: T[], id: Ulid, patch: Partial<T>): T[] {
  return list.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

function removeItem<T extends { id: Ulid }>(list: T[], id: Ulid): T[] {
  return list.filter((item) => item.id !== id);
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
  }
}

type PlanContextValue = {
  plan: Plan;
  dispatch: (action: PlanAction) => void;
};

const PlanContext = createContext<PlanContextValue | null>(null);

function initialPlan(): Plan {
  return loadPlan() ?? emptyPlan();
}

export function PlanProvider({ children }: { children: ReactNode }) {
  const [plan, dispatch] = useReducer(planReducer, undefined, initialPlan);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    savePlan(plan);
  }, [plan]);

  const value = useMemo<PlanContextValue>(() => ({ plan, dispatch }), [plan]);
  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanContextValue {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
