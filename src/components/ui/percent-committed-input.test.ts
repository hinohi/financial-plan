import { describe, expect, test } from "bun:test";
import { percentStringToRatio, ratioToPercentString } from "./percent-committed-input";

describe("ratioToPercentString", () => {
  test("0.03 → \"3\"", () => {
    expect(ratioToPercentString(0.03)).toBe("3");
  });
  test("0.035 → \"3.5\"", () => {
    expect(ratioToPercentString(0.035)).toBe("3.5");
  });
  test("0 → \"0\"", () => {
    expect(ratioToPercentString(0)).toBe("0");
  });
  test("0.0001 → \"0.01\" (浮動小数誤差を吸収)", () => {
    // 0.0001 * 100 は 0.010000000000000002 となる
    expect(ratioToPercentString(0.0001)).toBe("0.01");
  });
  test("負の値も通る", () => {
    expect(ratioToPercentString(-0.05)).toBe("-5");
  });
  test("NaN は空文字", () => {
    expect(ratioToPercentString(Number.NaN)).toBe("");
  });
});

describe("percentStringToRatio", () => {
  test("\"3\" → 0.03", () => {
    expect(percentStringToRatio("3")).toBe(0.03);
  });
  test("\"3.5\" → 0.035", () => {
    expect(percentStringToRatio("3.5")).toBe(0.035);
  });
  test("\"0\" → 0", () => {
    expect(percentStringToRatio("0")).toBe(0);
  });
  test("\"0.1\" → 0.001", () => {
    expect(percentStringToRatio("0.1")).toBe(0.001);
  });
  test("前後の空白を許容", () => {
    expect(percentStringToRatio(" 3 ")).toBe(0.03);
  });
  test("空文字は null", () => {
    expect(percentStringToRatio("")).toBeNull();
    expect(percentStringToRatio("   ")).toBeNull();
  });
  test("非数値は null", () => {
    expect(percentStringToRatio("abc")).toBeNull();
  });
});

describe("往復変換", () => {
  test.each([0, 0.01, 0.03, 0.035, 0.1, 1, -0.05])("%s を往復しても元に戻る", (ratio) => {
    const str = ratioToPercentString(ratio);
    expect(percentStringToRatio(str)).toBe(ratio);
  });
});
