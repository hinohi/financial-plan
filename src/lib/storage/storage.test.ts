import { describe, expect, test } from "bun:test";
import { hydratePlan } from "./index";

describe("hydratePlan", () => {
  test("null / 非オブジェクトは null", () => {
    expect(hydratePlan(null)).toBeNull();
    expect(hydratePlan(undefined)).toBeNull();
    expect(hydratePlan("plan")).toBeNull();
  });

  test("settings が無ければ null", () => {
    expect(hydratePlan({ accounts: [] })).toBeNull();
  });

  test("Phase 1 時点の Plan は events/transfers を空補完して読める", () => {
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
});
