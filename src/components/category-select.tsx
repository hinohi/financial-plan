import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryPath, sortedCategoriesByPath } from "@/lib/categories";
import type { Category, CategoryKind, Ulid } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

export const CATEGORY_NONE_VALUE = "__none__";

type CategorySelectProps = {
  id?: string;
  kind: CategoryKind;
  value: Ulid | undefined;
  onChange: (value: Ulid | undefined) => void;
  placeholder?: string;
};

export function CategorySelect({ id, kind, value, onChange, placeholder }: CategorySelectProps) {
  const { plan } = usePlan();
  const sorted = useMemo(() => sortedCategoriesByPath(plan.categories, kind), [plan.categories, kind]);
  const byId = useMemo(() => {
    const map = new Map<Ulid, Category>();
    for (const c of plan.categories) map.set(c.id, c);
    return map;
  }, [plan.categories]);
  return (
    <Select
      value={value ?? CATEGORY_NONE_VALUE}
      onValueChange={(v) => onChange(v === CATEGORY_NONE_VALUE ? undefined : v)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={placeholder ?? "カテゴリを選択"} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={CATEGORY_NONE_VALUE}>（未分類）</SelectItem>
        {sorted.map((c) => (
          <SelectItem key={c.id} value={c.id}>
            {categoryPath(c, byId)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
