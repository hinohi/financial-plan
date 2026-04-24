import { describe, expect, test } from "bun:test";
import { categoryPath, isDescendantOf, sortedCategoriesByPath } from "./categories";
import type { Category, Ulid } from "./dsl/types";

function makeByIdMap(list: Category[]): Map<Ulid, Category> {
  const map = new Map<Ulid, Category>();
  for (const c of list) map.set(c.id, c);
  return map;
}

describe("categoryPath", () => {
  test("単独カテゴリは label をそのまま返す", () => {
    const c: Category = { id: "c1", label: "食費", kind: "expense" };
    expect(categoryPath(c, makeByIdMap([c]))).toBe("食費");
  });

  test("親を辿って ' / ' 区切りで組み立てる", () => {
    const root: Category = { id: "root", label: "生活", kind: "expense" };
    const mid: Category = { id: "mid", label: "食費", kind: "expense", parentId: "root" };
    const leaf: Category = { id: "leaf", label: "外食", kind: "expense", parentId: "mid" };
    expect(categoryPath(leaf, makeByIdMap([root, mid, leaf]))).toBe("生活 / 食費 / 外食");
  });

  test("親が存在しなくてもクラッシュせず今あるラベルだけ返す", () => {
    const orphan: Category = { id: "o1", label: "孤児", kind: "expense", parentId: "ghost" };
    expect(categoryPath(orphan, makeByIdMap([orphan]))).toBe("孤児");
  });

  test("循環参照があっても無限ループしない", () => {
    const a: Category = { id: "a", label: "A", kind: "expense", parentId: "b" };
    const b: Category = { id: "b", label: "B", kind: "expense", parentId: "a" };
    const path = categoryPath(a, makeByIdMap([a, b]));
    expect(path).toBe("B / A");
  });
});

describe("isDescendantOf", () => {
  const root: Category = { id: "root", label: "R", kind: "expense" };
  const mid: Category = { id: "mid", label: "M", kind: "expense", parentId: "root" };
  const leaf: Category = { id: "leaf", label: "L", kind: "expense", parentId: "mid" };
  const byId = makeByIdMap([root, mid, leaf]);

  test("自分自身は自分の子孫扱い", () => {
    expect(isDescendantOf("root", "root", byId)).toBe(true);
  });

  test("直接の親は true", () => {
    expect(isDescendantOf("mid", "root", byId)).toBe(true);
  });

  test("間接の祖先も true", () => {
    expect(isDescendantOf("leaf", "root", byId)).toBe(true);
  });

  test("無関係なら false", () => {
    expect(isDescendantOf("root", "leaf", byId)).toBe(false);
  });

  test("循環しても false を返して終了", () => {
    const a: Category = { id: "a", label: "A", kind: "expense", parentId: "b" };
    const b: Category = { id: "b", label: "B", kind: "expense", parentId: "a" };
    const cyclicMap = makeByIdMap([a, b]);
    expect(isDescendantOf("a", "ghost", cyclicMap)).toBe(false);
  });
});

describe("sortedCategoriesByPath", () => {
  const list: Category[] = [
    { id: "exp", label: "支出", kind: "expense" },
    { id: "inc", label: "収入", kind: "income" },
    { id: "food", label: "食費", kind: "expense", parentId: "exp" },
    { id: "rent", label: "家賃", kind: "expense", parentId: "exp" },
    { id: "salary", label: "給料", kind: "income", parentId: "inc" },
  ];

  test("指定 kind のみパス辞書順で並ぶ", () => {
    const result = sortedCategoriesByPath(list, "expense").map((c) => c.id);
    // "支出" → "支出 / 家賃" → "支出 / 食費" (ja ロケール)
    expect(result[0]).toBe("exp");
    expect(result).toEqual(["exp", "rent", "food"]);
  });

  test("配列で複数 kind を指定できる", () => {
    const result = sortedCategoriesByPath(list, ["income", "expense"]).map((c) => c.id);
    expect(result).toHaveLength(5);
    expect(new Set(result)).toEqual(new Set(["exp", "inc", "food", "rent", "salary"]));
  });

  test("該当 kind が無ければ空配列", () => {
    // すべて expense の入力で income を要求
    const onlyExpense: Category[] = [{ id: "e", label: "x", kind: "expense" }];
    expect(sortedCategoriesByPath(onlyExpense, "income")).toEqual([]);
  });
});
