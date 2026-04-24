import { describe, expect, test } from "bun:test";
import { formatNumericDisplay, stripCommas } from "./numeric-format";

describe("formatNumericDisplay", () => {
  test("3 桁ごとにカンマを挿入する", () => {
    expect(formatNumericDisplay("1000")).toBe("1,000");
    expect(formatNumericDisplay("1234567")).toBe("1,234,567");
    expect(formatNumericDisplay("100")).toBe("100");
    expect(formatNumericDisplay("99")).toBe("99");
  });

  test("負の数もマイナス符号を保つ", () => {
    expect(formatNumericDisplay("-500")).toBe("-500");
    expect(formatNumericDisplay("-10000")).toBe("-10,000");
    expect(formatNumericDisplay("-1234567")).toBe("-1,234,567");
  });

  test("小数部はそのまま保持", () => {
    expect(formatNumericDisplay("1000.5")).toBe("1,000.5");
    expect(formatNumericDisplay("0.03")).toBe("0.03");
    expect(formatNumericDisplay("-1234.567")).toBe("-1,234.567");
  });

  test("打ち途中 / 空 / 非数値はそのまま返す", () => {
    expect(formatNumericDisplay("")).toBe("");
    expect(formatNumericDisplay("-")).toBe("-");
    expect(formatNumericDisplay(".")).toBe(".");
    expect(formatNumericDisplay("-.")).toBe("-.");
    expect(formatNumericDisplay("abc")).toBe("abc");
  });
});

describe("stripCommas", () => {
  test("カンマだけを除去する", () => {
    expect(stripCommas("1,000")).toBe("1000");
    expect(stripCommas("-1,234,567.89")).toBe("-1234567.89");
    expect(stripCommas("")).toBe("");
    expect(stripCommas("no-commas-here")).toBe("no-commas-here");
  });
});
