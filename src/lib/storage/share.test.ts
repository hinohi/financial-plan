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
      schemaVersion: 999 as unknown as 2,
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

  test("展開後サイズが上限を超えると decompression bomb として弾かれる", async () => {
    // MAX_DECODED_BYTES(2MB) を大きく超える 3MB のゼロ埋めを deflate-raw で圧縮する。
    // deflate の辞書圧縮で圧縮後は数KB になるため、上限の事前判定が無ければ 3MB 展開する入力。
    const bigInput = new Uint8Array(3_000_000);
    const body = new Response(bigInput).body;
    if (!body) throw new Error("Response.body が利用できません");
    const compressed = await new Response(body.pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer();
    const bytes = new Uint8Array(compressed);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    const b64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const code = `v1.${b64url}`;
    // プレフィックス込みで MAX_ENCODED_CHARS (500_000) 以内に収まっていることを確認。
    expect(code.length).toBeLessThan(500_000);
    const result = await decodeSharedPlan(code);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("大きすぎ");
  });
});
