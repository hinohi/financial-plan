import { describe, expect, test } from "bun:test";
import type { Plan } from "@/lib/dsl/types";
import type { PlanMeta, Registry } from "@/lib/storage";
import { appReducer, HISTORY_LIMIT, planReducer } from "./plan-store";

function seed(): Plan {
  return {
    schemaVersion: 1,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2076-12",
    },
    persons: [],
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
    events: [
      { id: "ev1", label: "ボーナス", accountId: "a1", month: "2026-06", amount: 500 },
      { id: "ev2", label: "住宅購入", accountId: "a2", month: "2027-04", amount: -1000 },
    ],
    transfers: [
      {
        id: "t1",
        label: "積立",
        fromAccountId: "a1",
        toAccountId: "a2",
        segments: [{ startMonth: "2026-01", amount: 50 }],
      },
    ],
    categories: [],
    grossSalaries: [],
  };
}

describe("planReducer", () => {
  test("plan/replace はプランを丸ごと差し替える", () => {
    const state = seed();
    const next: Plan = {
      schemaVersion: 1,
      settings: { yearStartMonth: 4, planStartMonth: "2027-04", planEndMonth: "2030-03" },
      persons: [],
      accounts: [],
      snapshots: [],
      incomes: [],
      expenses: [],
      events: [],
      transfers: [],
      categories: [],
      grossSalaries: [],
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
      account: { id: "a3", label: "預金", kind: "cash" },
    });
    expect(next.accounts).toHaveLength(3);
    expect(next.accounts[2]).toEqual({ id: "a3", label: "預金", kind: "cash" });
  });

  test("account/update は該当 id のみ更新する", () => {
    const state = seed();
    const next = planReducer(state, { type: "account/update", id: "a2", patch: { label: "NISA" } });
    expect(next.accounts[0]?.label).toBe("現金");
    expect(next.accounts[1]?.label).toBe("NISA");
    expect(next.accounts[1]?.kind).toBe("investment");
  });

  test("account/remove は口座に紐づく snapshot・income・expense・event・transfer をまとめて削除する", () => {
    const state = seed();
    const next = planReducer(state, { type: "account/remove", id: "a1" });
    expect(next.accounts.map((a) => a.id)).toEqual(["a2"]);
    expect(next.snapshots.map((s) => s.id)).toEqual(["s2"]);
    expect(next.incomes).toEqual([]);
    expect(next.expenses.map((e) => e.id)).toEqual(["e2"]);
    expect(next.events.map((e) => e.id)).toEqual(["ev2"]);
    expect(next.transfers).toEqual([]);
  });

  test("account/remove は transfer の to 側に一致しても削除する", () => {
    const state = seed();
    const next = planReducer(state, { type: "account/remove", id: "a2" });
    expect(next.transfers).toEqual([]);
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

  test("event/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "event/add",
      event: { id: "ev3", label: "車検", accountId: "a1", month: "2027-07", amount: -150 },
    });
    expect(added.events).toHaveLength(3);

    const updated = planReducer(added, { type: "event/update", id: "ev3", patch: { amount: -200 } });
    expect(updated.events.find((e) => e.id === "ev3")?.amount).toBe(-200);

    const removed = planReducer(updated, { type: "event/remove", id: "ev3" });
    expect(removed.events.map((e) => e.id)).toEqual(["ev1", "ev2"]);
  });

  test("transfer/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "transfer/add",
      transfer: {
        id: "t2",
        label: "賞与積立",
        fromAccountId: "a1",
        toAccountId: "a2",
        segments: [{ startMonth: "2026-06", amount: 200 }],
      },
    });
    expect(added.transfers).toHaveLength(2);

    const updated = planReducer(added, { type: "transfer/update", id: "t2", patch: { label: "ボーナス積立" } });
    expect(updated.transfers.find((t) => t.id === "t2")?.label).toBe("ボーナス積立");

    const removed = planReducer(updated, { type: "transfer/remove", id: "t2" });
    expect(removed.transfers.map((t) => t.id)).toEqual(["t1"]);
  });

  test("category/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "category/add",
      category: { id: "c1", label: "生活費", kind: "expense" },
    });
    expect(added.categories).toHaveLength(1);

    const updated = planReducer(added, { type: "category/update", id: "c1", patch: { label: "暮らし" } });
    expect(updated.categories[0]?.label).toBe("暮らし");

    const removed = planReducer(updated, { type: "category/remove", id: "c1" });
    expect(removed.categories).toEqual([]);
  });

  test("category/remove は参照している income/expense/event の categoryId を外す", () => {
    const withCat = planReducer(seed(), {
      type: "category/add",
      category: { id: "c1", label: "給与", kind: "income" },
    });
    const wired: Plan = {
      ...withCat,
      incomes: withCat.incomes.map((i) => (i.id === "i1" ? { ...i, categoryId: "c1" } : i)),
      expenses: withCat.expenses.map((e) => (e.id === "e1" ? { ...e, categoryId: "c1" } : e)),
      events: withCat.events.map((ev) => (ev.id === "ev1" ? { ...ev, categoryId: "c1" } : ev)),
    };
    const next = planReducer(wired, { type: "category/remove", id: "c1" });
    expect(next.incomes.find((i) => i.id === "i1")?.categoryId).toBeUndefined();
    expect(next.expenses.find((e) => e.id === "e1")?.categoryId).toBeUndefined();
    expect(next.events.find((ev) => ev.id === "ev1")?.categoryId).toBeUndefined();
  });

  test("category/remove は親を失う子カテゴリの parentId を外す", () => {
    const base = planReducer(seed(), {
      type: "category/add",
      category: { id: "c-parent", label: "食費", kind: "expense" },
    });
    const withChild = planReducer(base, {
      type: "category/add",
      category: { id: "c-child", label: "外食", kind: "expense", parentId: "c-parent" },
    });
    const next = planReducer(withChild, { type: "category/remove", id: "c-parent" });
    expect(next.categories.find((c) => c.id === "c-child")?.parentId).toBeUndefined();
  });

  test("元の state は変更されない（immutable）", () => {
    const state = seed();
    const snapshot = JSON.parse(JSON.stringify(state));
    planReducer(state, { type: "account/remove", id: "a1" });
    expect(state).toEqual(snapshot);
  });

  test("person/add / update / remove", () => {
    const added = planReducer(seed(), {
      type: "person/add",
      person: { id: "p1", label: "自分", birthMonth: "1990-05" },
    });
    expect(added.persons).toHaveLength(1);

    const updated = planReducer(added, { type: "person/update", id: "p1", patch: { birthMonth: "1991-06" } });
    expect(updated.persons[0]?.birthMonth).toBe("1991-06");

    const removed = planReducer(updated, { type: "person/remove", id: "p1" });
    expect(removed.persons).toEqual([]);
  });

  test("person/remove は人物を参照する snapshot/event を削除する", () => {
    const withPerson = planReducer(seed(), {
      type: "person/add",
      person: { id: "p1", label: "自分", birthMonth: "2000-01" },
    });
    const wired: Plan = {
      ...withPerson,
      snapshots: [
        ...withPerson.snapshots,
        {
          id: "s-ref",
          accountId: "a1",
          month: { kind: "person-age", personId: "p1", age: 30, month: 1 },
          balance: 999,
        },
      ],
      events: [
        ...withPerson.events,
        {
          id: "ev-ref",
          label: "退職",
          accountId: "a1",
          month: { kind: "person-age", personId: "p1", age: 65, month: 4 },
          amount: 100,
        },
      ],
    };
    const next = planReducer(wired, { type: "person/remove", id: "p1" });
    expect(next.snapshots.find((s) => s.id === "s-ref")).toBeUndefined();
    expect(next.events.find((e) => e.id === "ev-ref")).toBeUndefined();
    // 人物を参照していない分は残る
    expect(next.snapshots.find((s) => s.id === "s1")).toBeDefined();
    expect(next.events.find((e) => e.id === "ev1")).toBeDefined();
  });

  test("person/remove は segment が人物を参照している income/expense/transfer を削除する", () => {
    const withPerson = planReducer(seed(), {
      type: "person/add",
      person: { id: "p1", label: "子", birthMonth: "2020-04" },
    });
    const wired: Plan = {
      ...withPerson,
      incomes: [
        ...withPerson.incomes,
        {
          id: "i-ref",
          label: "児童手当",
          accountId: "a1",
          segments: [{ startMonth: { kind: "person-age", personId: "p1", age: 0, month: 4 }, amount: 10 }],
        },
      ],
      expenses: [
        ...withPerson.expenses,
        {
          id: "e-ref",
          label: "学費",
          accountId: "a1",
          segments: [
            { startMonth: "2030-04", endMonth: { kind: "person-age", personId: "p1", age: 18, month: 3 }, amount: 30 },
          ],
        },
      ],
      transfers: [
        ...withPerson.transfers,
        {
          id: "t-ref",
          label: "学資",
          fromAccountId: "a1",
          toAccountId: "a2",
          segments: [{ startMonth: { kind: "person-age", personId: "p1", age: 0, month: 4 }, amount: 5 }],
        },
      ],
    };
    const next = planReducer(wired, { type: "person/remove", id: "p1" });
    expect(next.incomes.find((i) => i.id === "i-ref")).toBeUndefined();
    expect(next.expenses.find((e) => e.id === "e-ref")).toBeUndefined();
    expect(next.transfers.find((t) => t.id === "t-ref")).toBeUndefined();
    // 参照していないものは残る
    expect(next.incomes.find((i) => i.id === "i1")).toBeDefined();
    expect(next.expenses.find((e) => e.id === "e1")).toBeDefined();
    expect(next.transfers.find((t) => t.id === "t1")).toBeDefined();
  });

  test("person/remove は settings の planStartMonth/planEndMonth が参照していたら解決済み値にスナップショット", () => {
    const withPerson = planReducer(seed(), {
      type: "person/add",
      person: { id: "p1", label: "self", birthMonth: "2000-01" },
    });
    const wired: Plan = {
      ...withPerson,
      settings: {
        ...withPerson.settings,
        planStartMonth: { kind: "person-age", personId: "p1", age: 20, month: 1 },
      },
    };
    const next = planReducer(wired, { type: "person/remove", id: "p1" });
    expect(next.settings.planStartMonth).toBe("2020-01");
  });
});

function meta(id: string, name = id): PlanMeta {
  return { id, name, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

function registry(current: string, ids: string[]): Registry {
  return { plans: ids.map((id) => meta(id)), currentPlanId: current };
}

type TestAppState = {
  registry: Registry;
  plan: Plan;
  history: { past: Plan[]; future: Plan[] };
};

function initial(): TestAppState {
  return {
    registry: registry("plan1", ["plan1"]),
    plan: seed(),
    history: { past: [], future: [] },
  };
}

const NOW = "2026-02-01T00:00:00.000Z";

describe("appReducer: undo/redo", () => {
  test("plan action で past に旧 plan が push され future はクリアされる", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "財布" } },
      now: NOW,
    });
    expect(s1.plan.accounts[0]?.label).toBe("財布");
    expect(s1.history.past).toHaveLength(1);
    expect(s1.history.past[0]).toBe(s0.plan);
    expect(s1.history.future).toEqual([]);
  });

  test("undo で past の最後の plan が current に戻り、現在 plan が future に積まれる", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "財布" } },
      now: NOW,
    });
    const s2 = appReducer(s1, { type: "history/undo", now: NOW });
    expect(s2.plan).toBe(s0.plan);
    expect(s2.history.past).toEqual([]);
    expect(s2.history.future).toHaveLength(1);
    expect(s2.history.future[0]).toBe(s1.plan);
  });

  test("redo で future から plan が取り出される", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "財布" } },
      now: NOW,
    });
    const s2 = appReducer(s1, { type: "history/undo", now: NOW });
    const s3 = appReducer(s2, { type: "history/redo", now: NOW });
    expect(s3.plan).toBe(s1.plan);
    expect(s3.history.future).toEqual([]);
    expect(s3.history.past).toHaveLength(1);
    expect(s3.history.past[0]).toBe(s0.plan);
  });

  test("undo 後に新しい plan action を打つと future はクリアされる", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "A" } },
      now: NOW,
    });
    const s2 = appReducer(s1, { type: "history/undo", now: NOW });
    expect(s2.history.future).toHaveLength(1);
    const s3 = appReducer(s2, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "B" } },
      now: NOW,
    });
    expect(s3.history.future).toEqual([]);
    expect(s3.plan.accounts[0]?.label).toBe("B");
  });

  test("past が空の時の undo は no-op", () => {
    const s0 = initial();
    const s1 = appReducer(s0, { type: "history/undo", now: NOW });
    expect(s1).toBe(s0);
  });

  test("future が空の時の redo は no-op", () => {
    const s0 = initial();
    const s1 = appReducer(s0, { type: "history/redo", now: NOW });
    expect(s1).toBe(s0);
  });

  test(`HISTORY_LIMIT (${HISTORY_LIMIT}) を超えたら古い past から捨てる`, () => {
    let s: TestAppState = initial();
    const firstPlan = s.plan;
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) {
      s = appReducer(s, {
        type: "plan",
        action: { type: "account/update", id: "a1", patch: { label: `L${i}` } },
        now: NOW,
      });
    }
    expect(s.history.past).toHaveLength(HISTORY_LIMIT);
    // 先頭は捨てられているので最初の plan はもう past にない
    expect(s.history.past[0]).not.toBe(firstPlan);
  });

  test("registry/select は history をリセットする", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "A" } },
      now: NOW,
    });
    const otherPlan = seed();
    const s2 = appReducer(
      { ...s1, registry: registry("plan1", ["plan1", "plan2"]) },
      { type: "registry/select", id: "plan2", plan: otherPlan },
    );
    expect(s2.history).toEqual({ past: [], future: [] });
    expect(s2.plan).toBe(otherPlan);
  });

  test("registry/create は history をリセットする", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "A" } },
      now: NOW,
    });
    const newPlan = seed();
    const s2 = appReducer(s1, { type: "registry/create", meta: meta("plan2"), plan: newPlan });
    expect(s2.history).toEqual({ past: [], future: [] });
  });

  test("registry/delete: 現在プランが差し替わる場合は history をリセット", () => {
    const s0: TestAppState = {
      registry: registry("plan1", ["plan1", "plan2"]),
      plan: seed(),
      history: { past: [], future: [] },
    };
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "A" } },
      now: NOW,
    });
    expect(s1.history.past).toHaveLength(1);
    const nextPlan = seed();
    const s2 = appReducer(s1, { type: "registry/delete", id: "plan1", nextCurrentId: "plan2", nextPlan });
    expect(s2.history).toEqual({ past: [], future: [] });
  });

  test("registry/delete: 別プランの削除では現在プランの history を保つ", () => {
    const s0: TestAppState = {
      registry: registry("plan1", ["plan1", "plan2"]),
      plan: seed(),
      history: { past: [], future: [] },
    };
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "A" } },
      now: NOW,
    });
    const s2 = appReducer(s1, {
      type: "registry/delete",
      id: "plan2",
      nextCurrentId: "plan1",
      nextPlan: s1.plan,
    });
    expect(s2.history.past).toHaveLength(1);
  });

  test("registry/rename は history に影響しない", () => {
    const s0 = initial();
    const s1 = appReducer(s0, {
      type: "plan",
      action: { type: "account/update", id: "a1", patch: { label: "A" } },
      now: NOW,
    });
    const s2 = appReducer(s1, { type: "registry/rename", id: "plan1", name: "改名", now: NOW });
    expect(s2.history).toBe(s1.history);
  });

  test("registry/replace-current は past に積まれる (undo で戻せる)", () => {
    const s0 = initial();
    const replacement: Plan = {
      ...seed(),
      accounts: [{ id: "zz", label: "新", kind: "cash" }],
    };
    const s1 = appReducer(s0, { type: "registry/replace-current", plan: replacement, now: NOW });
    expect(s1.history.past).toHaveLength(1);
    expect(s1.history.past[0]).toBe(s0.plan);
    const s2 = appReducer(s1, { type: "history/undo", now: NOW });
    expect(s2.plan).toBe(s0.plan);
  });
});
