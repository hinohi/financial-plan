import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryPath, sortedCategoriesByPath } from "@/lib/categories";
import { CATEGORY_KIND_LABEL, type Category, type CategoryKind, type Ulid } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

export const CATEGORY_NONE_VALUE = "__none__";

type CategorySelectProps = {
  id?: string;
  kinds: CategoryKind | CategoryKind[];
  value: Ulid | undefined;
  onChange: (value: Ulid | undefined) => void;
  placeholder?: string;
};

export function CategorySelect({ id, kinds, value, onChange, placeholder }: CategorySelectProps) {
  const { plan } = usePlan();
  const kindList: CategoryKind[] = Array.isArray(kinds) ? kinds : [kinds];
  const showKindPrefix = kindList.length > 1;
  const sorted = useMemo(() => sortedCategoriesByPath(plan.categories, kindList), [plan.categories, kindList]);
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
            {showKindPrefix ? `[${CATEGORY_KIND_LABEL[c.kind]}] ` : ""}
            {categoryPath(c, byId)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
