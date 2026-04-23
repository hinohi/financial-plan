import type { Category, CategoryKind, Ulid } from "@/lib/dsl/types";

export function categoryPath(category: Category, byId: Map<Ulid, Category>): string {
  const labels: string[] = [];
  const seen = new Set<Ulid>();
  let cur: Category | undefined = category;
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    labels.unshift(cur.label);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return labels.join(" / ");
}

export function isDescendantOf(candidate: Ulid, ancestor: Ulid, byId: Map<Ulid, Category>): boolean {
  const seen = new Set<Ulid>();
  let cur: Category | undefined = byId.get(candidate);
  while (cur && !seen.has(cur.id)) {
    if (cur.id === ancestor) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return false;
}

export function sortedCategoriesByPath(categories: Category[], kinds: CategoryKind | CategoryKind[]): Category[] {
  const allowed = new Set<CategoryKind>(Array.isArray(kinds) ? kinds : [kinds]);
  const byId = new Map<Ulid, Category>();
  for (const c of categories) byId.set(c.id, c);
  return categories
    .filter((c) => allowed.has(c.kind))
    .map((c) => ({ c, path: categoryPath(c, byId) }))
    .sort((a, b) => a.path.localeCompare(b.path, "ja"))
    .map((x) => x.c);
}
