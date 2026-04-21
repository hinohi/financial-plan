import { describe, expect, test } from "bun:test";
import {
  addMonths,
  compareYearMonth,
  currentYearMonth,
  isValidYearMonth,
  iterateMonths,
  maxYearMonth,
  minYearMonth,
  monthDiff,
  parseYearMonth,
  toYearMonth,
} from "./month";
import type { YearMonth } from "./types";

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
