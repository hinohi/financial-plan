import { describe, expect, test } from "bun:test";
import { formatYen, formatYenCompact } from "./format";

describe("formatYen", () => {
  test("整数は ¥ 記号 + 3桁区切り", () => {
    expect(formatYen(1000)).toBe("￥1,000");
    expect(formatYen(1_234_567)).toBe("￥1,234,567");
  });

  test("ゼロ・負数も対応", () => {
    expect(formatYen(0)).toBe("￥0");
    expect(formatYen(-500)).toBe("-￥500");
  });

  test("小数は四捨五入される (maximumFractionDigits: 0)", () => {
    expect(formatYen(1234.49)).toBe("￥1,234");
    expect(formatYen(1234.5)).toBe("￥1,235");
  });
});

describe("formatYenCompact", () => {
  test("ja ロケールの短縮表記", () => {
    // 日本語ロケールでは 万 / 億 単位で表示される
    expect(formatYenCompact(10_000)).toBe("1万");
    expect(formatYenCompact(1_234_000)).toBe("123.4万");
    expect(formatYenCompact(100_000_000)).toBe("1億");
  });

  test("ゼロと負値", () => {
    expect(formatYenCompact(0)).toBe("0");
    expect(formatYenCompact(-50_000)).toBe("-5万");
  });
});
