import type { Plan } from "@/lib/dsl/types";

const STORAGE_KEY = "fp.plan.v1";

function hasLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadPlan(): Plan | null {
  if (!hasLocalStorage()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Plan;
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
