import { describe, expect, test } from "bun:test";
import type { Plan } from "@/lib/dsl/types";
import { planReducer } from "./plan-store";

function seed(): Plan {
  return {
    schemaVersion: 1,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2076-12",
    },
    accounts: [
      { id: "a1", label: "現金", kind: "cash" },
      { id: "a2", label: "投資", kind: "investment" },
    ],
    snapshots: [
      { id: "s1", accountId: "a1", month: "2026-01", balance: 1000 },
      { id: "s2", accountId: "a2", month: "2026-01", balance: 500 },
    ],
    incomes: [
      {
        id: "i1",
        label: "給与",
        accountId: "a1",
        segments: [{ startMonth: "2026-01", amount: 300 }],
      },
    ],
    expenses: [
      {
        id: "e1",
        label: "家賃",
        accountId: "a1",
        segments: [{ startMonth: "2026-01", amount: 100 }],
      },
      {
        id: "e2",
        label: "運用手数料",
        accountId: "a2",
        segments: [{ startMonth: "2026-01", amount: 10 }],
      },
    ],
  };
}

describe("planReducer", () => {
  test("plan/replace はプランを丸ごと差し替える", () => {
    const state = seed();
    const next: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 4, planStartMonth: "2027-04", planEndMonth: "2030-03" },
      accounts: [],
      snapshots: [],
      incomes: [],
      expenses: [],
    };
    expect(planReducer(state, { type: "plan/replace", plan: next })).toBe(next);
  });

  test("settings/update は部分パッチを適用する", () => {
    const state = seed();
    const next = planReducer(state, { type: "settings/update", patch: { yearStartMonth: 4 } });
    expect(next.settings).toEqual({ yearStartMonth: 4, planStartMonth: "2026-01", planEndMonth: "2076-12" });
    expect(state.settings.yearStartMonth).toBe(1);
  });

  test("account/add は末尾に追加する", () => {
    const state = seed();
    const next = planReducer(state, {
      type: "account/add",
      account: { id: "a3", label: "住宅", kind: "property" },
    });
    expect(next.accounts).toHaveLength(3);
    expect(next.accounts[2]).toEqual({ id: "a3", label: "住宅", kind: "property" });
  });

  test("account/update は該当 id のみ更新する", () => {
    const state = seed();
    const next = planReducer(state, { type: "account/update", id: "a2", patch: { label: "NISA" } });
    expect(next.accounts[0]?.label).toBe("現金");
    expect(next.accounts[1]?.label).toBe("NISA");
    expect(next.accounts[1]?.kind).toBe("investment");
  });

  test("account/remove は口座に紐づく snapshot・income・expense をまとめて削除する", () => {
    const state = seed();
    const next = planReducer(state, { type: "account/remove", id: "a1" });
    expect(next.accounts.map((a) => a.id)).toEqual(["a2"]);
    expect(next.snapshots.map((s) => s.id)).toEqual(["s2"]);
    expect(next.incomes).toEqual([]);
    expect(next.expenses.map((e) => e.id)).toEqual(["e2"]);
  });

  test("snapshot/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "snapshot/add",
      snapshot: { id: "s3", accountId: "a1", month: "2027-01", balance: 2000 },
    });
    expect(added.snapshots).toHaveLength(3);

    const updated = planReducer(added, { type: "snapshot/update", id: "s3", patch: { balance: 3000 } });
    expect(updated.snapshots.find((s) => s.id === "s3")?.balance).toBe(3000);

    const removed = planReducer(updated, { type: "snapshot/remove", id: "s3" });
    expect(removed.snapshots.find((s) => s.id === "s3")).toBeUndefined();
    expect(removed.snapshots).toHaveLength(2);
  });

  test("income/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "income/add",
      income: {
        id: "i2",
        label: "副業",
        accountId: "a1",
        segments: [{ startMonth: "2026-04", amount: 50 }],
      },
    });
    expect(added.incomes).toHaveLength(2);

    const updated = planReducer(added, { type: "income/update", id: "i2", patch: { label: "副業収入" } });
    expect(updated.incomes.find((i) => i.id === "i2")?.label).toBe("副業収入");

    const removed = planReducer(updated, { type: "income/remove", id: "i2" });
    expect(removed.incomes.map((i) => i.id)).toEqual(["i1"]);
  });

  test("expense/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "expense/add",
      expense: {
        id: "e3",
        label: "食費",
        accountId: "a1",
        segments: [{ startMonth: "2026-01", amount: 40 }],
      },
    });
    expect(added.expenses).toHaveLength(3);

    const updated = planReducer(added, { type: "expense/update", id: "e3", patch: { label: "食料品" } });
    expect(updated.expenses.find((e) => e.id === "e3")?.label).toBe("食料品");

    const removed = planReducer(updated, { type: "expense/remove", id: "e3" });
    expect(removed.expenses.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  test("元の state は変更されない（immutable）", () => {
    const state = seed();
    const snapshot = JSON.parse(JSON.stringify(state));
    planReducer(state, { type: "account/remove", id: "a1" });
    expect(state).toEqual(snapshot);
  });
});
