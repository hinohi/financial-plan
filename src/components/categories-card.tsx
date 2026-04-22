import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryPath, isDescendantOf, sortedCategoriesByPath } from "@/lib/categories";
import { newId } from "@/lib/dsl/id";
import { CATEGORY_KIND_LABEL, CATEGORY_KINDS, type Category, type CategoryKind, type Ulid } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

const NONE_VALUE = "__none__";

export function CategoriesCard() {
  const { plan, dispatch } = usePlan();
  const [newKind, setNewKind] = useState<CategoryKind>("expense");
  const [newLabel, setNewLabel] = useState("");
  const [newParentId, setNewParentId] = useState<string>(NONE_VALUE);

  const byId = useMemo(() => {
    const map = new Map<Ulid, Category>();
    for (const c of plan.categories) map.set(c.id, c);
    return map;
  }, [plan.categories]);

  const parentCandidates = useMemo(() => plan.categories.filter((c) => c.kind === newKind), [plan.categories, newKind]);

  const canAdd = newLabel.trim() !== "";

  const handleAdd = () => {
    if (!canAdd) return;
    const category: Category = {
      id: newId(),
      label: newLabel.trim(),
      kind: newKind,
      parentId: newParentId === NONE_VALUE ? undefined : newParentId,
    };
    dispatch({ type: "category/add", category });
    setNewLabel("");
    setNewParentId(NONE_VALUE);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>カテゴリ</CardTitle>
        <CardDescription>収入・支出・イベントを分類する。親カテゴリを指定すると階層になる</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr_auto] md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="category-kind">種別</Label>
            <Select
              value={newKind}
              onValueChange={(v) => {
                setNewKind(v as CategoryKind);
                setNewParentId(NONE_VALUE);
              }}
            >
              <SelectTrigger id="category-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {CATEGORY_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category-label">ラベル</Label>
            <Input
              id="category-label"
              placeholder="食費 / 給与 / など"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category-parent">親カテゴリ</Label>
            <Select value={newParentId} onValueChange={setNewParentId}>
              <SelectTrigger id="category-parent" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE_VALUE}>（なし / トップレベル）</SelectItem>
                {parentCandidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {categoryPath(c, byId)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!canAdd}>
            追加
          </Button>
        </div>
        <div className="grid gap-4">
          {CATEGORY_KINDS.map((kind) => (
            <CategoryGroup key={kind} kind={kind} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryGroup({ kind }: { kind: CategoryKind }) {
  const { plan, dispatch } = usePlan();
  const sorted = useMemo(() => sortedCategoriesByPath(plan.categories, kind), [plan.categories, kind]);
  const byId = useMemo(() => {
    const map = new Map<Ulid, Category>();
    for (const c of plan.categories) map.set(c.id, c);
    return map;
  }, [plan.categories]);

  return (
    <div className="grid gap-2">
      <h3 className="text-sm font-semibold text-muted-foreground">{CATEGORY_KIND_LABEL[kind]}</h3>
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground">まだありません。</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {sorted.map((category) => {
            const validParents = plan.categories.filter(
              (c) => c.kind === kind && c.id !== category.id && !isDescendantOf(c.id, category.id, byId),
            );
            return (
              <li key={category.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="grid gap-1.5">
                  <Label htmlFor={`cat-${category.id}-label`}>ラベル</Label>
                  <Input
                    id={`cat-${category.id}-label`}
                    value={category.label}
                    onChange={(e) =>
                      dispatch({ type: "category/update", id: category.id, patch: { label: e.target.value } })
                    }
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`cat-${category.id}-parent`}>親カテゴリ</Label>
                  <Select
                    value={category.parentId ?? NONE_VALUE}
                    onValueChange={(v) =>
                      dispatch({
                        type: "category/update",
                        id: category.id,
                        patch: { parentId: v === NONE_VALUE ? undefined : v },
                      })
                    }
                  >
                    <SelectTrigger id={`cat-${category.id}-parent`} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE_VALUE}>（なし）</SelectItem>
                      {validParents.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {categoryPath(c, byId)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => dispatch({ type: "category/remove", id: category.id })}
                >
                  削除
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
