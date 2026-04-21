import { describe, expect, test } from "bun:test";
import { addMonths } from "./month";
import { emptyPlan } from "./plan";

describe("emptyPlan", () => {
  test("schemaVersion と空配列を持つ", () => {
    const plan = emptyPlan(new Date(2026, 3, 22));
    expect(plan.schemaVersion).toBe(1);
    expect(plan.accounts).toEqual([]);
    expect(plan.snapshots).toEqual([]);
    expect(plan.incomes).toEqual([]);
    expect(plan.expenses).toEqual([]);
  });

  test("計画開始月は与えた日の月", () => {
    const plan = emptyPlan(new Date(2026, 3, 22));
    expect(plan.settings.planStartMonth).toBe("2026-04");
  });

  test("計画終了月は開始月の 50 年後", () => {
    const now = new Date(2026, 3, 22);
    const plan = emptyPlan(now);
    expect(plan.settings.planEndMonth).toBe(addMonths(plan.settings.planStartMonth, 12 * 50));
  });

  test("yearStartMonth の既定は 1", () => {
    const plan = emptyPlan(new Date(2026, 3, 22));
    expect(plan.settings.yearStartMonth).toBe(1);
  });
});
