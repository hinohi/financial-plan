import { newId } from "@/lib/dsl/id";
import { emptyPlan } from "@/lib/dsl/plan";
import type { Category, Person, Plan, Ulid } from "@/lib/dsl/types";

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
    const person: Person = { id: p.id, label: p.label, birthMonth: p.birthMonth };
    if (typeof p.previousYearIncome === "number" && Number.isFinite(p.previousYearIncome)) {
      person.previousYearIncome = p.previousYearIncome;
    }
    out.push(person);
  }
  return out;
}

export function hydratePlan(raw: unknown): Plan | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Plan> & Record<string, unknown>;
  if (!p.settings) return null;
  if (p.schemaVersion !== undefined && p.schemaVersion !== CURRENT_SCHEMA_VERSION) return null;
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    settings: p.settings,
    persons: hydratePersons(p.persons),
    accounts: p.accounts ?? [],
    snapshots: p.snapshots ?? [],
    incomes: p.incomes ?? [],
    expenses: p.expenses ?? [],
    events: p.events ?? [],
    transfers: p.transfers ?? [],
    categories: hydrateCategories(p.categories),
    grossSalaries: Array.isArray(p.grossSalaries) ? p.grossSalaries : [],
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

  const plan = emptyPlan(now);
  const meta = createPlanMeta("新しいプラン", now);
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
