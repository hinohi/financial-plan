import { describe, expect, test } from "bun:test";
import type { Plan, YearStartMonth } from "@/lib/dsl/types";
import { interpret } from "@/lib/interpret";
import {
  aggregate,
  aggregateFlow,
  SYSTEM_DEPRECIATION_KEY,
  SYSTEM_INTEREST_KEY,
  SYSTEM_LOAN_INTEREST_KEY,
  UNCATEGORIZED_KEY,
} from "./index";

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
    events: [],
    transfers: [],
    categories: [],
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

  test("Transfer は合計残高を変えず、口座別残高のみ動かす", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 1000 }],
      transfers: [
        {
          id: "t1",
          label: "積立",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-02", endMonth: "2026-03", amount: 100 }],
        },
      ],
    });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points.map((p) => [p.period, p.total, p.byAccount])).toEqual([
      ["2026-01", 1000, { a1: 1000, a2: 0 }],
      ["2026-02", 1000, { a1: 900, a2: 100 }],
      ["2026-03", 1000, { a1: 800, a2: 200 }],
    ]);
  });

  test("OneShotEvent は指定月の残高にだけ作用する", () => {
    const plan = basePlan({
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 1000 }],
      events: [{ id: "ev1", label: "ボーナス", accountId: "a1", month: "2026-02", amount: 500 }],
    });
    const view = aggregate(plan, interpret(plan), { period: "monthly" });
    expect(view.points.map((p) => p.total)).toEqual([1000, 1500, 1500]);
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

describe("aggregateFlow", () => {
  test("カテゴリ未設定の income は未分類として集計される", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 100 }],
        },
      ],
    });
    const view = aggregateFlow(plan, interpret(plan), { kind: "income", period: "monthly", group: "leaf" });
    expect(view.categoryOrder).toEqual([UNCATEGORIZED_KEY]);
    expect(view.points.map((p) => [p.period, p.byCategory[UNCATEGORIZED_KEY], p.total])).toEqual([
      ["2026-01", 100, 100],
      ["2026-02", 100, 100],
    ]);
  });

  test("expense はカテゴリ別に正の値として積み上げられる", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      expenses: [
        {
          id: "e1",
          label: "家賃",
          accountId: "a1",
          categoryId: "c-fixed",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 80 }],
        },
        {
          id: "e2",
          label: "食費",
          accountId: "a1",
          categoryId: "c-food",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 30 }],
        },
      ],
      categories: [
        { id: "c-fixed", label: "固定費", kind: "expense" },
        { id: "c-food", label: "食費", kind: "expense" },
      ],
    });
    const view = aggregateFlow(plan, interpret(plan), { kind: "expense", period: "monthly", group: "leaf" });
    expect(view.categoryOrder).toEqual(["c-fixed", "c-food"]);
    expect(view.points[0]?.byCategory).toEqual({ "c-fixed": 80, "c-food": 30 });
    expect(view.points[0]?.total).toBe(110);
  });

  test("group=top は子カテゴリを親にロールアップする", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-01" },
      expenses: [
        {
          id: "e1",
          label: "外食",
          accountId: "a1",
          categoryId: "c-eat-out",
          segments: [{ startMonth: "2026-01", endMonth: "2026-01", amount: 40 }],
        },
        {
          id: "e2",
          label: "自炊",
          accountId: "a1",
          categoryId: "c-groceries",
          segments: [{ startMonth: "2026-01", endMonth: "2026-01", amount: 30 }],
        },
      ],
      categories: [
        { id: "c-food", label: "食費", kind: "expense" },
        { id: "c-eat-out", label: "外食", kind: "expense", parentId: "c-food" },
        { id: "c-groceries", label: "食料品", kind: "expense", parentId: "c-food" },
      ],
    });
    const leaf = aggregateFlow(plan, interpret(plan), { kind: "expense", period: "monthly", group: "leaf" });
    expect(leaf.categoryOrder).toEqual(["c-eat-out", "c-groceries"]);
    expect(leaf.points[0]?.byCategory).toEqual({ "c-eat-out": 40, "c-groceries": 30 });

    const top = aggregateFlow(plan, interpret(plan), { kind: "expense", period: "monthly", group: "top" });
    expect(top.categoryOrder).toEqual(["c-food"]);
    expect(top.points[0]?.byCategory).toEqual({ "c-food": 70 });
    expect(top.points[0]?.total).toBe(70);
  });

  test("events は kind=income/expense 集計に符号に応じて参加する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      events: [
        { id: "ev1", label: "ボーナス", accountId: "a1", month: "2026-06", amount: 500 },
        { id: "ev2", label: "住宅", accountId: "a1", month: "2026-02", amount: -300 },
        { id: "ev3", label: "結婚祝", accountId: "a1", month: "2026-03", amount: 200 },
      ],
    });
    const income = aggregateFlow(plan, interpret(plan), { kind: "income", period: "monthly", group: "leaf" });
    expect(income.points.map((p) => [p.period, p.total])).toEqual([
      ["2026-01", 0],
      ["2026-02", 0],
      ["2026-03", 200],
    ]);
    const expense = aggregateFlow(plan, interpret(plan), { kind: "expense", period: "monthly", group: "leaf" });
    expect(expense.points.map((p) => [p.period, p.total])).toEqual([
      ["2026-01", 0],
      ["2026-02", 300],
      ["2026-03", 0],
    ]);
  });

  test("年次集計は期間ラベルでまとめる", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 4, planStartMonth: "2026-04", planEndMonth: "2028-03" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          categoryId: "c-salary",
          segments: [{ startMonth: "2026-04", endMonth: "2028-03", amount: 10 }],
        },
      ],
      categories: [{ id: "c-salary", label: "給与", kind: "income" }],
    });
    const view = aggregateFlow(plan, interpret(plan), { kind: "income", period: "yearly", group: "leaf" });
    expect(view.points.map((p) => [p.period, p.total])).toEqual([
      ["2026年度", 120],
      ["2027年度", 120],
    ]);
  });

  test("投資利息は income の運用益カテゴリに計上される", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-03" },
      accounts: [{ id: "inv", label: "投資", kind: "investment", investment: { annualRate: 0.12 } }],
      snapshots: [{ id: "s1", accountId: "inv", month: "2026-01", balance: 10000 }],
    });
    const view = aggregateFlow(plan, interpret(plan), { kind: "income", period: "monthly", group: "leaf" });
    expect(view.categoryOrder).toContain(SYSTEM_INTEREST_KEY);
    expect(view.points.some((p) => (p.byCategory[SYSTEM_INTEREST_KEY] ?? 0) > 0)).toBe(true);
  });

  test("不動産の減価と借入利息は expense に計上される", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      accounts: [
        { id: "cash", label: "現金", kind: "cash" },
        {
          id: "prop",
          label: "家",
          kind: "property",
          property: { annualDepreciationRate: 0.05 },
        },
        {
          id: "loan",
          label: "ローン",
          kind: "liability",
          liability: {
            annualRate: 0.024,
            scheduleKind: "equal-principal",
            principal: 1_200_000,
            termMonths: 12,
            startMonth: "2026-01",
            paymentAccountId: "cash",
          },
        },
      ],
      snapshots: [{ id: "s1", accountId: "prop", month: "2026-01", balance: 10_000_000 }],
    });
    const view = aggregateFlow(plan, interpret(plan), { kind: "expense", period: "monthly", group: "leaf" });
    expect(view.categoryOrder).toContain(SYSTEM_DEPRECIATION_KEY);
    expect(view.categoryOrder).toContain(SYSTEM_LOAN_INTEREST_KEY);
    expect(view.points[0]?.byCategory[SYSTEM_LOAN_INTEREST_KEY]).toBeGreaterThan(0);
  });

  test("kind 不一致の categoryId は未分類扱い", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-01" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          categoryId: "c-expense",
          segments: [{ startMonth: "2026-01", endMonth: "2026-01", amount: 100 }],
        },
      ],
      categories: [{ id: "c-expense", label: "生活費", kind: "expense" }],
    });
    const view = aggregateFlow(plan, interpret(plan), { kind: "income", period: "monthly", group: "leaf" });
    expect(view.categoryOrder).toEqual([UNCATEGORIZED_KEY]);
    expect(view.points[0]?.byCategory[UNCATEGORIZED_KEY]).toBe(100);
  });
});
