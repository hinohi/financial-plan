import { describe, expect, test } from "bun:test";
import type { Plan } from "@/lib/dsl/types";
import { computeSegmentAmount, interpret } from "./index";

function basePlan(overrides: Partial<Plan> = {}): Plan {
  return {
    schemaVersion: 1,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2026-12",
    },
    accounts: [{ id: "a1", label: "cash", kind: "cash" }],
    snapshots: [],
    incomes: [],
    expenses: [],
    events: [],
    transfers: [],
    ...overrides,
  };
}

describe("interpret", () => {
  test("空のプランは空のエントリを返す", () => {
    const plan = basePlan();
    expect(interpret(plan)).toEqual([]);
  });

  test("計画期間内の snapshot は sourceKind=snapshot として出力される", () => {
    const plan = basePlan({
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-03", balance: 1000 }],
    });
    expect(interpret(plan)).toEqual([
      { month: "2026-03", accountId: "a1", sourceId: "s1", sourceKind: "snapshot", amount: 1000 },
    ]);
  });

  test("計画期間外の snapshot は出力されない", () => {
    const plan = basePlan({
      snapshots: [
        { id: "s-before", accountId: "a1", month: "2025-12", balance: 500 },
        { id: "s-after", accountId: "a1", month: "2027-01", balance: 500 },
      ],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("income segment を月ごとに展開する", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-03", amount: 300 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(entries.every((e) => e.sourceKind === "income" && e.amount === 300)).toBe(true);
  });

  test("endMonth 省略時は計画終了月まで展開される", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-10", amount: 100 }],
        },
      ],
    });
    const months = interpret(plan).map((e) => e.month);
    expect(months).toEqual(["2026-10", "2026-11", "2026-12"]);
  });

  test("segment が計画期間前から開始していても計画開始月でクリップされる", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2025-06", endMonth: "2026-02", amount: 100 }],
        },
      ],
    });
    const months = interpret(plan).map((e) => e.month);
    expect(months).toEqual(["2026-01", "2026-02"]);
  });

  test("segment が計画期間外にまったく入らないなら展開されない", () => {
    const plan = basePlan({
      incomes: [
        {
          id: "i1",
          label: "x",
          accountId: "a1",
          segments: [{ startMonth: "2027-01", endMonth: "2027-12", amount: 100 }],
        },
      ],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("expense は負の amount として出力される", () => {
    const plan = basePlan({
      expenses: [
        {
          id: "e1",
          label: "家賃",
          accountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 200 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toHaveLength(2);
    expect(entries.every((e) => e.sourceKind === "expense" && e.amount === -200)).toBe(true);
  });

  test("複数 segment を結合して展開する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-06" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [
            { startMonth: "2026-01", endMonth: "2026-03", amount: 100 },
            { startMonth: "2026-04", endMonth: "2026-06", amount: 200 },
          ],
        },
      ],
    });
    const amounts = interpret(plan)
      .filter((e) => e.sourceKind === "income")
      .map((e) => [e.month, e.amount]);
    expect(amounts).toEqual([
      ["2026-01", 100],
      ["2026-02", 100],
      ["2026-03", 100],
      ["2026-04", 200],
      ["2026-05", 200],
      ["2026-06", 200],
    ]);
  });

  test("raise=fixed は everyMonths ごとに value を加算する", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2028-12" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [
            {
              startMonth: "2026-01",
              amount: 1000,
              raise: { kind: "fixed", value: 100, everyMonths: 12 },
            },
          ],
        },
      ],
    });
    const sample = (month: string) =>
      interpret(plan).find((e) => e.month === month && e.sourceKind === "income")?.amount;
    expect(sample("2026-01")).toBe(1000);
    expect(sample("2026-12")).toBe(1000);
    expect(sample("2027-01")).toBe(1100);
    expect(sample("2028-01")).toBe(1200);
    expect(sample("2028-12")).toBe(1200);
  });

  test("raise=rate は everyMonths ごとに (1+value) を掛ける", () => {
    const plan = basePlan({
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2028-12" },
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [
            {
              startMonth: "2026-01",
              amount: 1000,
              raise: { kind: "rate", value: 0.1, everyMonths: 12 },
            },
          ],
        },
      ],
    });
    const sample = (month: string) =>
      interpret(plan).find((e) => e.month === month && e.sourceKind === "income")?.amount;
    expect(sample("2026-01")).toBe(1000);
    expect(sample("2027-01")).toBeCloseTo(1100);
    expect(sample("2028-01")).toBeCloseTo(1210);
  });

  test("everyMonths が 0 以下なら raise は適用されない (防御)", () => {
    expect(
      computeSegmentAmount(
        { startMonth: "2026-01", amount: 1000, raise: { kind: "fixed", value: 100, everyMonths: 0 } },
        "2030-01",
      ),
    ).toBe(1000);
  });

  test("OneShotEvent は計画期間内なら event として出力される", () => {
    const plan = basePlan({
      events: [{ id: "ev1", label: "結婚式", accountId: "a1", month: "2026-06", amount: -3000 }],
    });
    const entries = interpret(plan);
    expect(entries).toEqual([
      { month: "2026-06", accountId: "a1", sourceId: "ev1", sourceKind: "event", amount: -3000 },
    ]);
  });

  test("OneShotEvent は計画期間外なら出力されない", () => {
    const plan = basePlan({
      events: [{ id: "ev1", label: "x", accountId: "a1", month: "2027-01", amount: 100 }],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("Transfer は from/to の両口座へ対称な entry を生む", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      settings: { yearStartMonth: 1, planStartMonth: "2026-01", planEndMonth: "2026-02" },
      transfers: [
        {
          id: "t1",
          label: "積立",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: "2026-01", endMonth: "2026-02", amount: 500 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toHaveLength(4);
    expect(entries).toContainEqual({
      month: "2026-01",
      accountId: "a1",
      sourceId: "t1",
      sourceKind: "transfer",
      amount: -500,
    });
    expect(entries).toContainEqual({
      month: "2026-01",
      accountId: "a2",
      sourceId: "t1",
      sourceKind: "transfer",
      amount: 500,
    });
    expect(entries).toContainEqual({
      month: "2026-02",
      accountId: "a1",
      sourceId: "t1",
      sourceKind: "transfer",
      amount: -500,
    });
  });

  test("Transfer の from===to は無視される", () => {
    const plan = basePlan({
      transfers: [
        {
          id: "t1",
          label: "自己",
          fromAccountId: "a1",
          toAccountId: "a1",
          segments: [{ startMonth: "2026-01", endMonth: "2026-12", amount: 500 }],
        },
      ],
    });
    expect(interpret(plan)).toEqual([]);
  });

  test("複数 segment・口座・snapshot の混在", () => {
    const plan = basePlan({
      accounts: [
        { id: "a1", label: "cash", kind: "cash" },
        { id: "a2", label: "invest", kind: "investment" },
      ],
      snapshots: [{ id: "s1", accountId: "a1", month: "2026-01", balance: 10000 }],
      incomes: [
        {
          id: "i1",
          label: "給与",
          accountId: "a1",
          segments: [{ startMonth: "2026-02", endMonth: "2026-02", amount: 500 }],
        },
      ],
      expenses: [
        {
          id: "e1",
          label: "家賃",
          accountId: "a2",
          segments: [{ startMonth: "2026-02", endMonth: "2026-02", amount: 200 }],
        },
      ],
    });
    const entries = interpret(plan);
    expect(entries).toContainEqual({
      month: "2026-01",
      accountId: "a1",
      sourceId: "s1",
      sourceKind: "snapshot",
      amount: 10000,
    });
    expect(entries).toContainEqual({
      month: "2026-02",
      accountId: "a1",
      sourceId: "i1",
      sourceKind: "income",
      amount: 500,
    });
    expect(entries).toContainEqual({
      month: "2026-02",
      accountId: "a2",
      sourceId: "e1",
      sourceKind: "expense",
      amount: -200,
    });
    expect(entries).toHaveLength(3);
  });
});
