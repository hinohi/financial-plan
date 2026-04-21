import { describe, expect, test } from "bun:test";
import type { Plan, YearStartMonth } from "@/lib/dsl/types";
import { interpret } from "@/lib/interpret";
import { aggregate } from "./index";

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 1,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2026-03",
    },
    accounts: [{ id: "a1", label: "cash", kind: "cash" }],
    snapshots: [],
    incomes: [],
    expenses: [],
    ...overrides,
  };
}

describe("aggregate monthly", () => {
  test("フローのみなら毎月累積される", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "x",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-03", amount: 100 }],
        },
      ],
    });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points.map((p) => [p.period, p.total])).toEqual([
      ["2026-01", 100],
      ["2026-02", 200],
      ["2026-03", 300],
    ]);
  });

  test("snapshot はその月の残高を上書きする", () => {
    const plan = basePlan({
      settings: {
        yearStartMonth: 1,
        planStartMonth: "2026-01",
        planEndMonth: "2026-04",
      },
      incomes: [
        {
          id: "i1",
          label: "x",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-04", amount: 100 }],
        },
      ],
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-02", balance: 500 }],
    });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points.map((p) => [p.period, p.total])).toEqual([
      ["2026-01", 100],
      ["2026-02", 500],
      ["2026-03", 600],
      ["2026-04", 700],
    ]);
  });

  test("支出は残高を減らす", () => {
    const plan = basePlan({
      expenses: [
        {
          id: "e1",
          label: "家賃",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-03", amount: 50 }],
        },
      ],
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 1000 }],
    });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points.map((p) => p.total)).toEqual([1000, 950, 900]);
  });

  test("口座が複数あれば total は合算される", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      snapshots: [
        { id: "s1", accountId: "a1", month: "2026-01", balance: 100 },
        { id: "s2", accountId: "a2", month: "2026-01", balance: 200 },
      ],
    });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points[0]?.total).toBe(300);
    expect(view.points[0]?.byAccount).toEqual({ a1: 100, a2: 200 });
    expect(view.points[2]?.total).toBe(300);
  });

  test("口座が無ければ total は 0", () => {
    const plan = basePlan({ accounts: [] });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points).toHaveLength(3);
    expect(view.points.every((p) => p.total === 0)).toBe(true);
    expect(view.points.every((p) => Object.keys(p.byAccount).length === 0)).toBe(true);
  });
});

describe("aggregate yearly", () => {
  test("yearStartMonth=1 なら暦年ラベル、年末の残高を代表値として採用", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2027-12" },
      incomes: [
        {
          id: "i1",
          label: "x",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2027-12", amount: 10 }],
        },
      ],
    });
    const view = aggregate(plan, interpret(plan), { period: "yearly" });
    expect(view.points.map((p) => [p.period, p.total])).toEqual([
      ["2026", 120],
      ["2027", 240],
    ]);
  });

  test("yearStartMonth=4 なら年度ラベルで、年度末 3 月時点の値", () => {
    const yearStartMonth: YearStartMonth = 4;
    const plan = basePlan({
      settings: { yearStartMonth, planStartMonth: "2026-04", planEndMonth: "2027-09" },
      snapshots: [
        { id: "s1", accountId: "a1", month: "2026-04", balance: 1000 },
        { id: "s2", accountId: "a1", month: "2027-03", balance: 2000 },
        { id: "s3", accountId: "a1", month: "2027-09", balance: 3000 },
      ],
    });
    const view = aggregate(plan, interpret(plan), { period: "yearly" });
    expect(view.points.map((p) => [p.period, p.total])).toEqual([
      ["2026年度", 2000],
      ["2027年度", 3000],
    ]);
  });
});
