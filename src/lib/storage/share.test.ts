import { describe, expect, test } from "bun:test";
import { emptyPlan } from "@/lib/dsl/plan";
import type { Plan } from "@/lib/dsl/types";
import { decodeSharedPlan, encodePlanForShare, isShareCode } from "./share";

function samplePlan(): Plan {
  return {
    ...emptyPlan(new Date("2026-04-22T00:00:00.000Z")),
    persons: [{ id: "p1", label: "自分", birthMonth: "1990-05" }],
    accounts: [{ id: "a1", label: "現金", kind: "cash" }],
    snapshots: [{ id: "s1", accountId: "a1", month: "2026-04", balance: 1_000_000 }],
  };
}

describe("isShareCode", () => {
  test("v1. プレフィックスを持つ文字列のみ true", () => {
    expect(isShareCode("v1.abcd")).toBe(true);
    expect(isShareCode("v2.abcd")).toBe(false);
    expect(isShareCode("")).toBe(false);
  });
});

describe("encode / decode round-trip", () => {
  test("最小プランでもラウンドトリップする", async () => {
    const plan = samplePlan();
    const code = await encodePlanForShare(plan);
    expect(code.startsWith("v1.")).toBe(true);
    const decoded = await decodeSharedPlan(code);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.plan).toEqual(plan);
  });

  test("base64url には URL で特殊扱いされる文字が含まれない", async () => {
    const plan = samplePlan();
    const code = await encodePlanForShare(plan);
    const body = code.slice(3);
    expect(/^[A-Za-z0-9_-]+$/.test(body)).toBe(true);
  });

  test("大きめのプランでも通る (数百エントリ)", async () => {
    const plan: Plan = {
      ...emptyPlan(new Date("2026-04-22T00:00:00.000Z")),
      accounts: Array.from({ length: 10 }, (_, i) => ({
        id: `acc-${i}`,
        label: `口座${i}`,
        kind: "cash" as const,
      })),
      snapshots: Array.from({ length: 500 }, (_, i) => ({
        id: `snap-${i}`,
        accountId: `acc-${i % 10}`,
        month: "2026-04" as const,
        balance: i,
      })),
    };
    const code = await encodePlanForShare(plan);
    const decoded = await decodeSharedPlan(code);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.plan.snapshots).toHaveLength(500);
  });
});

describe("decode error cases", () => {
  test("プレフィックスが無ければエラー", async () => {
    const result = await decodeSharedPlan("foobar");
    expect(result.ok).toBe(false);
  });

  test("空ボディはエラー", async () => {
    const result = await decodeSharedPlan("v1.");
    expect(result.ok).toBe(false);
  });

  test("不正な base64url 文字はエラー", async () => {
    const result = await decodeSharedPlan("v1.***");
    expect(result.ok).toBe(false);
  });

  test("base64url として valid だが展開不可はエラー", async () => {
    // 正しい長さだがランダムな内容 → deflate として不正
    const result = await decodeSharedPlan("v1.aGVsbG8td29ybGQ");
    expect(result.ok).toBe(false);
  });

  test("未対応の schemaVersion ならエラー", async () => {
    const code = await encodePlanForShare({
      ...emptyPlan(new Date("2026-04-22T00:00:00.000Z")),
      schemaVersion: 999 as unknown as 1,
    });
    const result = await decodeSharedPlan(code);
    expect(result.ok).toBe(false);
  });

  test("長大な入力はサイズ上限で弾かれる", async () => {
    const longBody = `v1.${"a".repeat(500_001)}`;
    const result = await decodeSharedPlan(longBody);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("大きすぎ");
  });
});
