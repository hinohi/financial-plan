import { describe, expect, test } from "bun:test";
import { resolvePlan } from "./resolve";
import type { Expense, GrossSalary, Income, LoanSpec, OneShotEvent, Person, Plan, Transfer, YearMonth } from "./types";

function basePlan(): Plan {
  return {
    schemaVersion: 3,
    settings: {
      yearStartMonth: 1,
      planStartMonth: "2026-01",
      planEndMonth: "2030-12",
    },
    persons: [],
    accounts: [],
    incomes: [],
    expenses: [],
    events: [],
    transfers: [],
    categories: [],
    grossSalaries: [],
  };
}

const person: Person = { id: "p1", label: "自分", birthMonth: "1990-04" };

describe("resolvePlan", () => {
  test("YearMonth の文字列 settings はそのまま通る", () => {
    const plan = { ...basePlan(), persons: [person] };
    const resolved = resolvePlan(plan);
    expect(resolved.settings.planStartMonth).toBe("2026-01");
    expect(resolved.settings.planEndMonth).toBe("2030-12");
  });

  test("PersonAgeRef の settings は resolve される", () => {
    const plan: Plan = {
      ...basePlan(),
      persons: [person],
      settings: {
        yearStartMonth: 1,
        planStartMonth: { kind: "person-age", personId: "p1", age: 36, month: 4 },
        planEndMonth: { kind: "person-age", personId: "p1", age: 40, month: 3 },
      },
    };
    const resolved = resolvePlan(plan);
    expect(resolved.settings.planStartMonth).toBe("2026-04");
    expect(resolved.settings.planEndMonth).toBe("2030-03");
  });

  test("解決できない PersonAgeRef の settings はフォールバック値に落ちる", () => {
    const plan: Plan = {
      ...basePlan(),
      settings: {
        yearStartMonth: 1,
        planStartMonth: { kind: "person-age", personId: "missing", age: 0, month: 4 },
        planEndMonth: { kind: "person-age", personId: "missing", age: 90, month: 3 },
      },
    };
    const resolved = resolvePlan(plan);
    expect(resolved.settings.planStartMonth).toBe("1970-01");
    expect(resolved.settings.planEndMonth).toBe("9999-12");
  });

  test("解決不能な event は silent に除外される", () => {
    const eventOk: OneShotEvent = { id: "ev1", label: "ok", accountId: "a1", month: "2026-05", amount: 10 };
    const eventBad: OneShotEvent = {
      id: "ev2",
      label: "bad",
      accountId: "a1",
      month: { kind: "person-age", personId: "missing", age: 30, month: 1 },
      amount: 20,
    };
    const plan: Plan = {
      ...basePlan(),
      events: [eventOk, eventBad],
    };
    const resolved = resolvePlan(plan);
    expect(resolved.events.map((e) => e.id)).toEqual(["ev1"]);
  });

  test("income.segments のうち解決不能なものだけ除外され、income 自体は残る", () => {
    const income: Income = {
      id: "i1",
      label: "給料",
      accountId: "a1",
      segments: [
        { startMonth: "2026-01", amount: 1 },
        { startMonth: { kind: "person-age", personId: "missing", age: 30, month: 1 }, amount: 2 },
        {
          startMonth: "2027-01",
          endMonth: { kind: "person-age", personId: "missing", age: 30, month: 1 },
          amount: 3,
        },
      ],
    };
    const resolved = resolvePlan({ ...basePlan(), incomes: [income] });
    expect(resolved.incomes).toHaveLength(1);
    expect(resolved.incomes[0]?.segments.map((s) => s.amount)).toEqual([1]);
  });

  test("expense.loan.rateSegments のうち解決不能なものだけ除外される", () => {
    const loan: LoanSpec = {
      principal: 10_000,
      rateSegments: [
        { startMonth: "2026-01", annualRate: 0.02, endMonth: "2030-12" },
        { startMonth: { kind: "person-age", personId: "missing", age: 30, month: 1 }, annualRate: 0.03 },
      ],
    };
    const expense: Expense = {
      id: "e1",
      label: "home",
      accountId: "a1",
      segments: [{ startMonth: "2026-01", amount: 100 }],
      loan,
    };
    const resolved = resolvePlan({ ...basePlan(), expenses: [expense] });
    expect(resolved.expenses[0]?.loan?.rateSegments).toHaveLength(1);
    expect(resolved.expenses[0]?.loan?.rateSegments[0]?.startMonth).toBe("2026-01" as YearMonth);
  });

  test("transfer.segments も segment 単位で除外される", () => {
    const transfer: Transfer = {
      id: "t1",
      label: "t",
      fromAccountId: "a1",
      toAccountId: "a2",
      segments: [
        { startMonth: "2026-01", amount: 10 },
        { startMonth: { kind: "person-age", personId: "missing", age: 1, month: 1 }, amount: 20 },
      ],
    };
    const resolved = resolvePlan({ ...basePlan(), transfers: [transfer] });
    expect(resolved.transfers[0]?.segments).toHaveLength(1);
  });

  test("grossSalary は startMonth が解決できなければ除外", () => {
    const ok: GrossSalary = {
      id: "g1",
      label: "本業",
      accountId: "a1",
      personId: "p1",
      annualAmount: 5_000_000,
      startMonth: "2026-04",
    };
    const bad: GrossSalary = {
      id: "g2",
      label: "未解決",
      accountId: "a1",
      personId: "p1",
      annualAmount: 5_000_000,
      startMonth: { kind: "person-age", personId: "missing", age: 30, month: 4 },
    };
    const resolved = resolvePlan({ ...basePlan(), persons: [person], grossSalaries: [ok, bad] });
    expect(resolved.grossSalaries.map((g) => g.id)).toEqual(["g1"]);
  });

  test("grossSalary は endMonth が解決できなければ除外", () => {
    const bad: GrossSalary = {
      id: "g1",
      label: "bad-end",
      accountId: "a1",
      personId: "p1",
      annualAmount: 5_000_000,
      startMonth: "2026-04",
      endMonth: { kind: "person-age", personId: "missing", age: 60, month: 3 },
    };
    const resolved = resolvePlan({ ...basePlan(), persons: [person], grossSalaries: [bad] });
    expect(resolved.grossSalaries).toHaveLength(0);
  });

  test("accounts / categories / persons の配列は内容を変えずに伝播する", () => {
    const plan: Plan = {
      ...basePlan(),
      persons: [person],
      accounts: [{ id: "a1", label: "現金", kind: "cash" }],
      categories: [{ id: "c1", label: "食費", kind: "expense" }],
    };
    const resolved = resolvePlan(plan);
    expect(resolved.accounts).toEqual(plan.accounts);
    expect(resolved.categories).toEqual(plan.categories);
    expect(resolved.persons).toEqual(plan.persons);
  });
});
