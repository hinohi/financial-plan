import { useMemo, useState } from "react";
import { MonthExprInput } from "@/components/month-expr-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/dsl/id";
import { compareYearMonth, isPersonAgeRef, resolveMonthExpr } from "@/lib/dsl/month";
import { resolvePlan } from "@/lib/dsl/resolve";
import type { MonthExpr, YearMonth } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { usePlan } from "@/state/plan-store";

export function SnapshotsCard() {
  const { plan, dispatch } = usePlan();
  const [accountId, setAccountId] = useState<string>("");
  const [month, setMonth] = useState<MonthExpr | undefined>(undefined);
  const [balance, setBalance] = useState<string>("");

  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of plan.accounts) map.set(a.id, a.label);
    return map;
  }, [plan.accounts]);

  const personLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of plan.persons) map.set(p.id, p.label);
    return map;
  }, [plan.persons]);

  const resolvedSnapshotMonth = useMemo(() => {
    const resolved = resolvePlan(plan);
    const map = new Map<string, string>();
    for (const s of resolved.snapshots) map.set(s.id, s.month);
    return map;
  }, [plan]);

  const sortedSnapshots = useMemo(() => {
    return [...plan.snapshots].sort((a, b) => {
      const am = (resolvedSnapshotMonth.get(a.id) ?? "9999-12") as YearMonth;
      const bm = (resolvedSnapshotMonth.get(b.id) ?? "9999-12") as YearMonth;
      return compareYearMonth(am, bm);
    });
  }, [plan.snapshots, resolvedSnapshotMonth]);

  const canAdd = accountId !== "" && month !== undefined && balance !== "" && !Number.isNaN(Number(balance));

  const handleAdd = () => {
    if (!canAdd || !month) return;
    dispatch({
      type: "snapshot/add",
      snapshot: {
        id: newId(),
        accountId,
        month,
        balance: Number(balance),
      },
    });
    setBalance("");
    setMonth(undefined);
  };

  const describeMonth = (m: MonthExpr): string => {
    if (typeof m === "string") return m;
    const pl = personLabel.get(m.personId) ?? "?";
    const resolved = resolveMonthExpr(m, plan.persons, plan.settings.yearStartMonth) ?? "解決不能";
    return `${pl} ${m.age}歳の ${m.month}月 (${resolved})`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>資産断面</CardTitle>
        <CardDescription>ある月時点の口座残高（事実）</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {plan.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">先に口座を追加してください。</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_200px_1fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="snapshot-account">口座</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="snapshot-account" className="w-full">
                  <SelectValue placeholder="選択" />
                </SelectTrigger>
                <SelectContent>
                  {plan.accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="snapshot-month">年月</Label>
              <MonthExprInput id="snapshot-month" value={month} onChange={setMonth} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="snapshot-balance">残高 (円)</Label>
              <Input
                id="snapshot-balance"
                type="number"
                inputMode="numeric"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd}>
              追加
            </Button>
          </div>
        )}
        {sortedSnapshots.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだ断面が登録されていません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {sortedSnapshots.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-4 px-4 py-2">
                <div className="grid text-sm">
                  <span className="font-medium">
                    {describeMonth(s.month)} / {accountLabel.get(s.accountId) ?? "不明"}
                    {isPersonAgeRef(s.month) ? (
                      <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">人物参照</span>
                    ) : null}
                  </span>
                  <span className="font-mono tabular-nums">{formatYen(s.balance)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "snapshot/remove", id: s.id })}>
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
