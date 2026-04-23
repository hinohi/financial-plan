import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>人物</CardTitle>
        <CardDescription>家族などの年齢を基準に年月を指定できるようになる。生年月は未来でも可</CardDescription>
      </CardHeader>
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
            <Input id="person-birth" type="month" value={birthMonth} onChange={(e) => setBirthMonth(e.target.value)} />
          </div>
          <Button onClick={handleAdd} disabled={!canAdd}>
            追加
          </Button>
        </div>
        {plan.persons.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ人物が登録されていません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {plan.persons.map((person) => (
              <li key={person.id} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_160px_auto] md:items-center">
                <Input
                  aria-label="ラベル"
                  value={person.label}
                  onChange={(e) => dispatch({ type: "person/update", id: person.id, patch: { label: e.target.value } })}
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
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
