import { useMemo, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
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

  const [collapsed, toggleCollapsed] = useCollapse("categories");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>カテゴリ</CardTitle>
            <CardDescription>収入・支出・イベントを分類する。親カテゴリを指定すると階層になる</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="カテゴリ" />
        </div>
      </CardHeader>
      {collapsed ? null : (
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
      )}
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
        <div className="rounded-md border">
          <div className="grid grid-cols-[1fr_1fr_72px] gap-3 border-b bg-muted/30 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>ラベル</span>
            <span>親カテゴリ</span>
            <span />
          </div>
          <ul className="divide-y">
            {sorted.map((category) => {
              const validParents = plan.categories.filter(
                (c) => c.kind === kind && c.id !== category.id && !isDescendantOf(c.id, category.id, byId),
              );
              return (
                <li key={category.id} className="grid grid-cols-[1fr_1fr_72px] items-center gap-3 px-4 py-2">
                  <CommittedInput
                    aria-label="ラベル"
                    value={category.label}
                    onCommit={(v) => dispatch({ type: "category/update", id: category.id, patch: { label: v } })}
                  />
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
                    <SelectTrigger aria-label="親カテゴリ" className="w-full">
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
        </div>
      )}
    </div>
  );
}
