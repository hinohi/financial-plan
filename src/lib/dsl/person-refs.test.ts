import { describe, expect, test } from "bun:test";
import {
  exprRefsPerson,
  grossSalaryRefsPerson,
  loanRateSegmentRefsPerson,
  loanRefsPerson,
  segmentRefsPerson,
} from "./person-refs";
import type { GrossSalary, LoanRateSegment, LoanSpec } from "./types";

describe("exprRefsPerson", () => {
  test("undefined / YearMonth 文字列は false", () => {
    expect(exprRefsPerson(undefined, "p1")).toBe(false);
    expect(exprRefsPerson("2026-01", "p1")).toBe(false);
  });

  test("一致する PersonAgeRef は true", () => {
    expect(exprRefsPerson({ kind: "person-age", personId: "p1", age: 30, month: 1 }, "p1")).toBe(true);
  });

  test("別 person を指す PersonAgeRef は false", () => {
    expect(exprRefsPerson({ kind: "person-age", personId: "p2", age: 30, month: 1 }, "p1")).toBe(false);
  });
});

describe("segmentRefsPerson", () => {
  test("startMonth / endMonth のどちらかが参照していれば true", () => {
    expect(
      segmentRefsPerson(
        {
          startMonth: { kind: "person-age", personId: "p1", age: 0, month: 4 },
          amount: 10,
        },
        "p1",
      ),
    ).toBe(true);
    expect(
      segmentRefsPerson(
        {
          startMonth: "2026-01",
          endMonth: { kind: "person-age", personId: "p1", age: 30, month: 1 },
          amount: 10,
        },
        "p1",
      ),
    ).toBe(true);
    expect(segmentRefsPerson({ startMonth: "2026-01", amount: 10 }, "p1")).toBe(false);
  });
});

describe("grossSalaryRefsPerson", () => {
  const base: GrossSalary = {
    id: "g1",
    label: "x",
    accountId: "a1",
    personId: "p1",
    annualAmount: 1_000_000,
    startMonth: "2026-01",
  };

  test("personId 一致で true", () => {
    expect(grossSalaryRefsPerson(base, "p1")).toBe(true);
  });

  test("startMonth が別 person を参照でも true (対象と異なる場合のみ false)", () => {
    const s: GrossSalary = {
      ...base,
      personId: "p2",
      startMonth: { kind: "person-age", personId: "p1", age: 30, month: 4 },
    };
    expect(grossSalaryRefsPerson(s, "p1")).toBe(true);
    expect(grossSalaryRefsPerson(s, "p3")).toBe(false);
  });

  test("endMonth が person を参照", () => {
    const s: GrossSalary = {
      ...base,
      personId: "p2",
      endMonth: { kind: "person-age", personId: "p1", age: 60, month: 3 },
    };
    expect(grossSalaryRefsPerson(s, "p1")).toBe(true);
  });
});

describe("loanRateSegmentRefsPerson / loanRefsPerson", () => {
  test("loan が undefined なら false", () => {
    expect(loanRefsPerson(undefined, "p1")).toBe(false);
  });

  test("どれか一つの rateSegment が参照していれば true", () => {
    const seg: LoanRateSegment = {
      startMonth: { kind: "person-age", personId: "p1", age: 30, month: 4 },
      annualRate: 0.01,
    };
    expect(loanRateSegmentRefsPerson(seg, "p1")).toBe(true);
    const loan: LoanSpec = {
      principal: 100,
      rateSegments: [{ startMonth: "2026-01", annualRate: 0.01 }, seg],
    };
    expect(loanRefsPerson(loan, "p1")).toBe(true);
  });

  test("どの rateSegment も参照していなければ false", () => {
    const loan: LoanSpec = {
      principal: 100,
      rateSegments: [{ startMonth: "2026-01", annualRate: 0.01 }],
    };
    expect(loanRefsPerson(loan, "p1")).toBe(false);
  });
});
