import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { emptyPlan } from "@/lib/dsl/plan";
import type { Plan } from "@/lib/dsl/types";
import {
  bootstrap,
  exportPlanJson,
  hydratePlan,
  hydrateRegistry,
  loadPlanById,
  loadRegistry,
  parsePlanJson,
  savePlanById,
  saveRegistry,
} from "./index";

class MemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get size(): number {
    return this.store.size;
  }
}

const memory = new MemoryStorage();
const globalRef = globalThis as unknown as { window?: { localStorage: MemoryStorage } };

beforeAll(() => {
  globalRef.window = { localStorage: memory };
});

afterAll(() => {
  delete globalRef.window;
});

beforeEach(() => {
  memory.clear();
});

describe("hydratePlan", () => {
  test("null / 非オブジェクトは null", () => {
    expect(hydratePlan(null)).toBeNull();
    expect(hydratePlan(undefined)).toBeNull();
    expect(hydratePlan("plan")).toBeNull();
  });

  test("settings が無ければ null", () => {
    expect(hydratePlan({ accounts: [] })).toBeNull();
  });

  test("Phase 1 時点の Plan は events/transfers/categories を空補完して読める", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [{ id: "a1", label: "cash", kind: "cash" }],
      snapshots: [],
      incomes: [],
      expenses: [],
    };
    const plan = hydratePlan(raw);
    expect(plan).not.toBeNull();
    expect(plan?.events).toEqual([]);
    expect(plan?.transfers).toEqual([]);
    expect(plan?.categories).toEqual([]);
    expect(plan?.accounts).toEqual([{ id: "a1", label: "cash", kind: "cash" }]);
  });

  test("完全な Plan はそのまま通る", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [],
      snapshots: [],
      incomes: [],
      expenses: [],
      events: [{ id: "ev1", label: "x", accountId: "a1", month: "2026-06", amount: 100 }],
      transfers: [
        {
          id: "t1",
          label: "t",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-01", amount: 50 }],
        },
      ],
    };
    expect(hydratePlan(raw)?.events).toHaveLength(1);
    expect(hydratePlan(raw)?.transfers).toHaveLength(1);
  });

  test("schemaVersion が未対応なら null", () => {
    const raw = {
      schemaVersion: 999,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
    };
    expect(hydratePlan(raw)).toBeNull();
  });

  test("persons を持つ Plan は復元される", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      persons: [{ id: "p1", label: "自分", birthMonth: "1990-05" }],
      accounts: [],
      snapshots: [],
      incomes: [],
      expenses: [],
    };
    const plan = hydratePlan(raw);
    expect(plan?.persons).toEqual([{ id: "p1", label: "自分", birthMonth: "1990-05" }]);
  });

  test("persons 欠損時は空配列で補完される (後方互換)", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [],
      snapshots: [],
      incomes: [],
      expenses: [],
    };
    expect(hydratePlan(raw)?.persons).toEqual([]);
  });

  test("persons の不正な要素は除外される", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      persons: [{ id: "p1", label: "ok", birthMonth: "1990-05" }, { id: "p2", label: "no-birth" }, null, "broken"],
      accounts: [],
      snapshots: [],
      incomes: [],
      expenses: [],
    };
    expect(hydratePlan(raw)?.persons).toEqual([{ id: "p1", label: "ok", birthMonth: "1990-05" }]);
  });

  test("不正な birthMonth を持つ person は除外される", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      persons: [
        { id: "p1", label: "ok", birthMonth: "1990-05" },
        { id: "p2", label: "bad", birthMonth: "1990-13" },
        { id: "p3", label: "bad", birthMonth: "not-a-date" },
      ],
    };
    expect(hydratePlan(raw)?.persons).toHaveLength(1);
  });

  test("settings.yearStartMonth が範囲外なら null", () => {
    expect(
      hydratePlan({
        settings: { yearStartMonth: 13, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      }),
    ).toBeNull();
    expect(
      hydratePlan({
        settings: { yearStartMonth: 0, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      }),
    ).toBeNull();
    expect(
      hydratePlan({
        settings: { yearStartMonth: 1.5, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      }),
    ).toBeNull();
  });

  test("settings.planStartMonth / planEndMonth が不正な MonthExpr なら null", () => {
    expect(
      hydratePlan({
        settings: { yearStartMonth: 1, planStartMonth: "invalid", planEndMonth: "2026-12" },
      }),
    ).toBeNull();
    expect(
      hydratePlan({
        settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: 42 },
      }),
    ).toBeNull();
  });

  test("account.kind が不正な要素は除外される", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "old", kind: "real-estate" },
        { id: "a3", label: "broken", kind: null },
        null,
      ],
    };
    expect(hydratePlan(raw)?.accounts.map((a) => a.id)).toEqual(["a1"]);
  });

  test("investment account の annualRate が不正なら設定は落とすが account 自体は残す", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      accounts: [
        { id: "a1", label: "inv", kind: "investment", investment: { annualRate: 0.03 } },
        { id: "a2", label: "inv-bad", kind: "investment", investment: { annualRate: "bad" } },
        { id: "a3", label: "inv-no-params", kind: "investment" },
      ],
    };
    const plan = hydratePlan(raw);
    expect(plan?.accounts[0]?.investment).toEqual({ annualRate: 0.03 });
    expect(plan?.accounts[1]?.investment).toBeUndefined();
    expect(plan?.accounts[2]?.investment).toBeUndefined();
  });

  test("snapshot.balance が非数値なら除外、note は保持", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      snapshots: [
        { id: "s1", accountId: "a1", month: "2026-03", balance: 100, note: "初期" },
        { id: "s2", accountId: "a1", month: "2026-04", balance: "bad" },
        { id: "s3", accountId: "a1", month: "bad", balance: 100 },
      ],
    };
    const plan = hydratePlan(raw);
    expect(plan?.snapshots).toHaveLength(1);
    expect(plan?.snapshots[0]?.note).toBe("初期");
  });

  test("flow segment の startMonth / amount が必須、raise の不正値は落とす", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      incomes: [
        {
          id: "i1",
          label: "ok",
          accountId: "a1",
          segments: [
            { startMonth: "2026-01", amount: 100, raise: { kind: "rate", value: 0.02, everyMonths: 12 } },
            { startMonth: "2026-02", amount: 200, raise: { kind: "bogus", value: 0 } },
            { amount: 300 }, // startMonth 欠損
          ],
        },
      ],
    };
    const plan = hydratePlan(raw);
    expect(plan?.incomes[0]?.segments).toHaveLength(2);
    expect(plan?.incomes[0]?.segments[0]?.raise).toEqual({ kind: "rate", value: 0.02, everyMonths: 12 });
    expect(plan?.incomes[0]?.segments[1]?.raise).toBeUndefined();
  });

  test("loan の rateSegments は部分的に不正でも残りを拾う", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      expenses: [
        {
          id: "e1",
          label: "home",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", amount: 100 }],
          loan: {
            principal: 10000,
            rateSegments: [
              { startMonth: "2026-01", annualRate: 0.02, endMonth: "2030-12" },
              { startMonth: "bad", annualRate: 0.015 },
              { startMonth: "2031-01", annualRate: "nope" },
            ],
          },
        },
      ],
    };
    const plan = hydratePlan(raw);
    expect(plan?.expenses[0]?.loan?.rateSegments).toHaveLength(1);
  });

  test("grossSalary は必須フィールド欠損で除外", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      grossSalaries: [
        { id: "g1", label: "ok", accountId: "a1", personId: "p1", annualAmount: 5_000_000, startMonth: "2026-04" },
        { id: "g2", label: "no-person", accountId: "a1", annualAmount: 100, startMonth: "2026-04" },
        { id: "g3", label: "bad-amount", accountId: "a1", personId: "p1", annualAmount: "oops", startMonth: "2026-04" },
      ],
    };
    const plan = hydratePlan(raw);
    expect(plan?.grossSalaries.map((g) => g.id)).toEqual(["g1"]);
  });

  test("transfer は from/to 文字列必須、minFromBalance は数値のみ採用", () => {
    const raw = {
      schemaVersion: 1,
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-12" },
      transfers: [
        {
          id: "t1",
          label: "ok",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-01", amount: 100 }],
          minFromBalance: 1000,
        },
        {
          id: "t2",
          label: "bad-min",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [],
          minFromBalance: "large",
        },
        {
          id: "t3",
          label: "no-to",
          fromAccountId: "a1",
          segments: [],
        },
      ],
    };
    const plan = hydratePlan(raw);
    expect(plan?.transfers).toHaveLength(2);
    expect(plan?.transfers[0]?.minFromBalance).toBe(1000);
    expect(plan?.transfers[1]?.minFromBalance).toBeUndefined();
  });
});

describe("hydrateRegistry", () => {
  test("plans が空配列なら null", () => {
    expect(hydrateRegistry({ plans: [], currentPlanId: "x" })).toBeNull();
  });

  test("非オブジェクトや欠損は null", () => {
    expect(hydrateRegistry(null)).toBeNull();
    expect(hydrateRegistry({ plans: "no" })).toBeNull();
  });

  test("currentPlanId が plans に無ければ最初の id にフォールバック", () => {
    const reg = hydrateRegistry({
      plans: [
        { id: "p1", name: "A", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
        { id: "p2", name: "B", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" },
      ],
      currentPlanId: "missing",
    });
    expect(reg?.currentPlanId).toBe("p1");
  });

  test("正規な registry はそのまま返る", () => {
    const input = {
      plans: [{ id: "p1", name: "A", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }],
      currentPlanId: "p1",
    };
    expect(hydrateRegistry(input)).toEqual(input);
  });
});

describe("export/import round-trip", () => {
  test("exportPlanJson → parsePlanJson で同じ内容に戻る", () => {
    const plan = {
      schemaVersion: 1 as const,
      settings: { yearStartMonth: 1 as const, planStartMonth: "2026-01" as const, planEndMonth: "2026-12" as const },
      persons: [],
      accounts: [{ id: "a1", label: "現金", kind: "cash" as const }],
      snapshots: [],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
      grossSalaries: [],
    };
    const json = exportPlanJson(plan);
    const parsed = parsePlanJson(json);
    expect(parsed).toEqual(plan);
  });

  test("parsePlanJson は不正な JSON で null", () => {
    expect(parsePlanJson("not a json")).toBeNull();
    expect(parsePlanJson("{}")).toBeNull();
  });
});

describe("bootstrap", () => {
  test("初回起動時は空プラン一つで registry を初期化する", () => {
    const { registry, plans } = bootstrap(new Date("2026-04-22T00:00:00.000Z"));
    expect(registry.plans).toHaveLength(1);
    expect(registry.currentPlanId).toBe(registry.plans[0]?.id ?? "");
    expect(plans[registry.currentPlanId]).toBeDefined();
    // 保存されていること
    expect(loadRegistry()).toEqual(registry);
  });

  test("レガシー fp.plan.v1 キーがあれば移行されて legacy キーは消える", () => {
    const legacyPlan: Plan = {
      ...emptyPlan(new Date("2026-04-22T00:00:00.000Z")),
      accounts: [{ id: "a-legacy", label: "旧現金", kind: "cash" }],
    };
    memory.setItem("fp.plan.v1", JSON.stringify(legacyPlan));
    const { registry, plans } = bootstrap(new Date("2026-04-22T00:00:00.000Z"));
    expect(registry.plans).toHaveLength(1);
    const loaded = plans[registry.currentPlanId];
    expect(loaded?.accounts[0]?.id).toBe("a-legacy");
    expect(memory.getItem("fp.plan.v1")).toBeNull();
    // 新キーで保存
    expect(loadPlanById(registry.currentPlanId)?.accounts[0]?.id).toBe("a-legacy");
  });

  test("既存 registry と plans があればそれを読み込む", () => {
    const plan: Plan = emptyPlan(new Date("2026-04-22T00:00:00.000Z"));
    savePlanById("p1", plan);
    saveRegistry({
      plans: [{ id: "p1", name: "A", createdAt: "x", updatedAt: "x" }],
      currentPlanId: "p1",
    });
    const { registry, plans } = bootstrap();
    expect(registry.plans).toHaveLength(1);
    expect(plans.p1?.schemaVersion).toBe(1);
  });

  test("registry に載っていても plan 本体が無いメタは取り除かれる", () => {
    saveRegistry({
      plans: [
        { id: "p1", name: "A", createdAt: "x", updatedAt: "x" },
        { id: "p-missing", name: "B", createdAt: "x", updatedAt: "x" },
      ],
      currentPlanId: "p-missing",
    });
    savePlanById("p1", emptyPlan(new Date("2026-04-22T00:00:00.000Z")));
    const { registry } = bootstrap();
    expect(registry.plans.map((p) => p.id)).toEqual(["p1"]);
    expect(registry.currentPlanId).toBe("p1");
  });
});
