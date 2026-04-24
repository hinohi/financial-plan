import { describe, expect, test } from "bun:test";
import { aggregate, aggregateFlow, isSystemCategoryKey, SYSTEM_CATEGORY_LABEL } from "@/lib/aggregate";
import { interpret } from "@/lib/interpret";
import samplePlanData from "@/lib/sample-plan.json";
import { hydratePlan } from "@/lib/storage";

const samplePlan = hydratePlan(samplePlanData);
if (!samplePlan) throw new Error("sample-plan.json failed to hydrate");

const accountLabelById: Record<string, string> = {};
for (const a of samplePlan.accounts) accountLabelById[a.id] = a.label;

const categoryLabelById: Record<string, string> = {};
for (const c of samplePlan.categories) categoryLabelById[c.id] = c.label;

function labelAccount(id: string): string {
  return accountLabelById[id] ?? id;
}

function labelCategory(key: string): string {
  if (isSystemCategoryKey(key)) return SYSTEM_CATEGORY_LABEL[key];
  return categoryLabelById[key] ?? key;
}

describe("サンプルプラン 年集約スナップショット", () => {
  const entries = interpret(samplePlan);

  test("残高 (yearly)", () => {
    const view = aggregate(samplePlan, entries, { period: "yearly" });
    const formatted = view.points.map((p) => ({
      period: p.period,
      total: p.total,
      byAccount: Object.fromEntries(Object.entries(p.byAccount).map(([id, v]) => [labelAccount(id), v])),
    }));
    expect(formatted).toMatchSnapshot();
  });

  test("収入フロー (yearly, leaf)", () => {
    const view = aggregateFlow(samplePlan, entries, { kind: "income", period: "yearly", group: "leaf" });
    const formatted = {
      categoryOrder: view.categoryOrder.map(labelCategory),
      points: view.points.map((p) => ({
        period: p.period,
        total: p.total,
        byCategory: Object.fromEntries(Object.entries(p.byCategory).map(([k, v]) => [labelCategory(k), v])),
      })),
    };
    expect(formatted).toMatchSnapshot();
  });

  test("支出フロー (yearly, leaf)", () => {
    const view = aggregateFlow(samplePlan, entries, { kind: "expense", period: "yearly", group: "leaf" });
    const formatted = {
      categoryOrder: view.categoryOrder.map(labelCategory),
      points: view.points.map((p) => ({
        period: p.period,
        total: p.total,
        byCategory: Object.fromEntries(Object.entries(p.byCategory).map(([k, v]) => [labelCategory(k), v])),
      })),
    };
    expect(formatted).toMatchSnapshot();
  });
});
