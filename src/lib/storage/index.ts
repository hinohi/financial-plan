import type { Plan } from "@/lib/dsl/types";

const STORAGE_KEY = "fp.plan.v1";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function hydratePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Plan> & Record<string, unknown>;
  if (!p.settings) return null;
  return {
    schemaVersion: 1,
    settings: p.settings,
    accounts: p.accounts ?? [],
    snapshots: p.snapshots ?? [],
    incomes: p.incomes ?? [],
    expenses: p.expenses ?? [],
    events: p.events ?? [],
    transfers: p.transfers ?? [],
  };
}

export function loadPlan(): Plan | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return hydratePlan(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePlan(plan: Plan): void {
  if (!hasLocalStorage()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
}

export function clearPlan(): void {
  if (!hasLocalStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
