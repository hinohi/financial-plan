import { useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollapse } from "@/hooks/use-collapse";
import { newId } from "@/lib/dsl/id";
import { isValidYearMonth } from "@/lib/dsl/month";
import type { YearMonth } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

export function PersonsCard() {
  const { plan, dispatch } = usePlan();
  const [label, setLabel] = useState("");
  const [birthMonth, setBirthMonth] = useState("");

  const canAdd = label.trim() !== "" && isValidYearMonth(birthMonth);

  const handleAdd = () => {
    if (!canAdd) return;
    dispatch({
      type: "person/add",
      person: { id: newId(), label: label.trim(), birthMonth: birthMonth as YearMonth },
    });
    setLabel("");
    setBirthMonth("");
  };

  const [collapsed, toggleCollapsed] = useCollapse("persons");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>人物</CardTitle>
            <CardDescription>家族などの年齢を基準に年月を指定できるようになる。生年月は未来でも可</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="人物" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_160px_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="person-label">ラベル</Label>
              <Input
                id="person-label"
                placeholder="自分 / 子 A"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="person-birth">生年月</Label>
              <Input
                id="person-birth"
                type="month"
                value={birthMonth}
                onChange={(e) => setBirthMonth(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd}>
              追加
            </Button>
          </div>
          {plan.persons.length === 0 ? (
            <p className="text-sm text-muted-foreground">まだ人物が登録されていません。</p>
          ) : (
            <SortableList
              items={plan.persons}
              onReorder={(order) => dispatch({ type: "persons/reorder", order })}
              renderItem={(person, handle) => (
                <div className="grid gap-3 px-2 py-3 md:grid-cols-[32px_1fr_160px_auto] md:items-center">
                  {handle}
                  <CommittedInput
                    aria-label="ラベル"
                    value={person.label}
                    onCommit={(v) => dispatch({ type: "person/update", id: person.id, patch: { label: v } })}
                  />
                  <Input
                    aria-label="生年月"
                    type="month"
                    value={person.birthMonth}
                    onChange={(e) => {
                      if (!isValidYearMonth(e.target.value)) return;
                      dispatch({
                        type: "person/update",
                        id: person.id,
                        patch: { birthMonth: e.target.value as YearMonth },
                      });
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (!window.confirm(`"${person.label}" を参照している年月指定は全て削除されます。続行しますか？`))
                        return;
                      dispatch({ type: "person/remove", id: person.id });
                    }}
                  >
                    削除
                  </Button>
                </div>
              )}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}
