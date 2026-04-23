import { describe, expect, test } from "bun:test";
import {
  addMonths,
  compareYearMonth,
  currentYearMonth,
  isMonthExpr,
  isPersonAgeRef,
  isValidYearMonth,
  iterateMonths,
  maxYearMonth,
  minYearMonth,
  monthDiff,
  parseYearMonth,
  resolveMonthExpr,
  resolvePersonAgeRef,
  toYearMonth,
} from "./month";
import type { Person, YearMonth } from "./types";

describe("parseYearMonth", () => {
  test("年月をオブジェクトに分解する", () => {
    expect(parseYearMonth("2026-04")).toEqual({ year: 2026, month: 4 });
    expect(parseYearMonth("2000-01")).toEqual({ year: 2000, month: 1 });
    expect(parseYearMonth("2026-12")).toEqual({ year: 2026, month: 12 });
  });
});

describe("toYearMonth", () => {
  test("通常の年月を 0 埋めで返す", () => {
    expect(toYearMonth(2026, 4)).toBe("2026-04");
    expect(toYearMonth(2026, 12)).toBe("2026-12");
    expect(toYearMonth(2026, 1)).toBe("2026-01");
  });

  test("月が 12 を超えた場合は年に繰り上げる", () => {
    expect(toYearMonth(2026, 13)).toBe("2027-01");
    expect(toYearMonth(2026, 25)).toBe("2028-01");
  });

  test("月が 1 未満の場合は年から繰り下げる", () => {
    expect(toYearMonth(2026, 0)).toBe("2025-12");
    expect(toYearMonth(2026, -1)).toBe("2025-11");
    expect(toYearMonth(2026, -11)).toBe("2025-01");
    expect(toYearMonth(2026, -12)).toBe("2024-12");
  });
});

describe("addMonths", () => {
  test("ゼロ加算は同じ月", () => {
    expect(addMonths("2026-04", 0)).toBe("2026-04");
  });

  test("前後に動かせる", () => {
    expect(addMonths("2026-04", 1)).toBe("2026-05");
    expect(addMonths("2026-04", -1)).toBe("2026-03");
  });

  test("年を跨げる", () => {
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(addMonths("2026-04", 12)).toBe("2027-04");
    expect(addMonths("2026-04", -12)).toBe("2025-04");
  });
});

describe("compareYearMonth", () => {
  test("順序を -1/0/+1 で返す", () => {
    expect(compareYearMonth("2026-04", "2026-04")).toBe(0);
    expect(compareYearMonth("2026-04", "2026-05")).toBeLessThan(0);
    expect(compareYearMonth("2026-05", "2026-04")).toBeGreaterThan(0);
    expect(compareYearMonth("2025-12", "2026-01")).toBeLessThan(0);
  });
});

describe("monthDiff", () => {
  test("同月は 0", () => {
    expect(monthDiff("2026-04", "2026-04")).toBe(0);
  });

  test("順方向は正、逆方向は負", () => {
    expect(monthDiff("2026-04", "2026-06")).toBe(2);
    expect(monthDiff("2026-06", "2026-04")).toBe(-2);
  });

  test("年を跨ぐ", () => {
    expect(monthDiff("2026-04", "2027-04")).toBe(12);
    expect(monthDiff("2026-11", "2027-02")).toBe(3);
  });
});

describe("maxYearMonth / minYearMonth", () => {
  test("最大・最小を返す", () => {
    expect(maxYearMonth("2026-04", "2026-05")).toBe("2026-05");
    expect(minYearMonth("2026-04", "2026-05")).toBe("2026-04");
    expect(maxYearMonth("2026-04", "2026-04")).toBe("2026-04");
    expect(minYearMonth("2026-04", "2026-04")).toBe("2026-04");
  });
});

describe("iterateMonths", () => {
  test("start === end で 1 要素", () => {
    expect([...iterateMonths("2026-04", "2026-04")]).toEqual(["2026-04"]);
  });

  test("start > end で空", () => {
    expect([...iterateMonths("2026-05", "2026-04")]).toEqual([]);
  });

  test("年を跨ぐ複数月", () => {
    expect([...iterateMonths("2026-11", "2027-02")]).toEqual(["2026-11", "2026-12", "2027-01", "2027-02"]);
  });

  test("12ヶ月分", () => {
    const months = [...iterateMonths("2026-04", "2027-03")];
    expect(months).toHaveLength(12);
    expect(months[0]).toBe("2026-04");
    expect(months[11]).toBe("2027-03");
  });
});

describe("isValidYearMonth", () => {
  test("正しい形式を受け入れる", () => {
    expect(isValidYearMonth("2026-04")).toBe(true);
    expect(isValidYearMonth("2000-01")).toBe(true);
    expect(isValidYearMonth("2026-12")).toBe(true);
  });

  test("不正な形式を拒否する", () => {
    expect(isValidYearMonth("2026-4")).toBe(false);
    expect(isValidYearMonth("2026-00")).toBe(false);
    expect(isValidYearMonth("2026-13")).toBe(false);
    expect(isValidYearMonth("26-04")).toBe(false);
    expect(isValidYearMonth("abc")).toBe(false);
    expect(isValidYearMonth("")).toBe(false);
    expect(isValidYearMonth("2026/04")).toBe(false);
  });
});

describe("currentYearMonth", () => {
  test("与えられた Date から YearMonth を返す", () => {
    const ym: YearMonth = currentYearMonth(new Date(2026, 3, 22));
    expect(ym).toBe("2026-04");
  });

  test("1 月も 0 埋めされる", () => {
    expect(currentYearMonth(new Date(2027, 0, 1))).toBe("2027-01");
  });
});

describe("isPersonAgeRef", () => {
  test("正しい PersonAgeRef を受け入れる", () => {
    expect(isPersonAgeRef({ kind: "person-age", personId: "p1", age: 50, month: 3 })).toBe(true);
    expect(isPersonAgeRef({ kind: "person-age", personId: "p1", age: 0, month: 12 })).toBe(true);
  });

  test("不正な形式を拒否する", () => {
    expect(isPersonAgeRef(null)).toBe(false);
    expect(isPersonAgeRef("2026-04")).toBe(false);
    expect(isPersonAgeRef({ kind: "other", personId: "p1", age: 1, month: 1 })).toBe(false);
    expect(isPersonAgeRef({ kind: "person-age", personId: "p1", age: -1, month: 1 })).toBe(false);
    expect(isPersonAgeRef({ kind: "person-age", personId: "p1", age: 1.5, month: 1 })).toBe(false);
    expect(isPersonAgeRef({ kind: "person-age", personId: "p1", age: 1, month: 0 })).toBe(false);
    expect(isPersonAgeRef({ kind: "person-age", personId: "p1", age: 1, month: 13 })).toBe(false);
  });
});

describe("isMonthExpr", () => {
  test("YearMonth 文字列と PersonAgeRef を受け入れる", () => {
    expect(isMonthExpr("2026-04")).toBe(true);
    expect(isMonthExpr({ kind: "person-age", personId: "p1", age: 0, month: 1 })).toBe(true);
  });

  test("不正な年月は拒否", () => {
    expect(isMonthExpr("2026-13")).toBe(false);
    expect(isMonthExpr({})).toBe(false);
  });
});

describe("resolvePersonAgeRef", () => {
  const person: Person = { id: "p1", label: "自分", birthMonth: "2000-08" };
  const persons = [person];

  test("2000-08 生まれ / yearStart=4 / 50歳の3月 → 2051-03", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 50, month: 3 }, persons, 4)).toBe("2051-03");
  });

  test("2000-08 生まれ / yearStart=1 / 50歳の3月 → 2050-03", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 50, month: 3 }, persons, 1)).toBe("2050-03");
  });

  test("2000-08 生まれ / yearStart=1 / 50歳の8月 → 2050-08 (誕生月ちょうど)", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 50, month: 8 }, persons, 1)).toBe("2050-08");
  });

  test("2000-08 生まれ / yearStart=8 (誕生月と同じ) / 50歳の8月 → 2050-08", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 50, month: 8 }, persons, 8)).toBe("2050-08");
  });

  test("2000-08 生まれ / yearStart=10 (誕生月より後) / 50歳の12月 → 2049-12", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 50, month: 12 }, persons, 10)).toBe(
      "2049-12",
    );
  });

  test("age=0 は誕生年度になる", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 0, month: 8 }, persons, 1)).toBe("2000-08");
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p1", age: 0, month: 3 }, persons, 4)).toBe("2001-03");
  });

  test("存在しない personId は null", () => {
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "missing", age: 10, month: 1 }, persons, 1)).toBeNull();
  });

  test("未来の生年月でも計算できる", () => {
    const future: Person = { id: "p2", label: "子", birthMonth: "2030-06" };
    // 18歳の誕生月は 2048-06、yearStart=4 の年度は 2048-04〜2049-03
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p2", age: 18, month: 4 }, [future], 4)).toBe("2048-04");
    expect(resolvePersonAgeRef({ kind: "person-age", personId: "p2", age: 18, month: 3 }, [future], 4)).toBe("2049-03");
  });
});

describe("resolveMonthExpr", () => {
  test("YearMonth 文字列はそのまま返す", () => {
    expect(resolveMonthExpr("2026-04", [], 1)).toBe("2026-04");
  });

  test("PersonAgeRef は resolvePersonAgeRef に委譲", () => {
    const persons: Person[] = [{ id: "p1", label: "self", birthMonth: "2000-01" }];
    expect(resolveMonthExpr({ kind: "person-age", personId: "p1", age: 25, month: 1 }, persons, 1)).toBe("2025-01");
  });
});
