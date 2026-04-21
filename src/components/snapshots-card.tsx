import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/dsl/id";
import { compareYearMonth, isValidYearMonth } from "@/lib/dsl/month";
import type { YearMonth } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { usePlan } from "@/state/plan-store";

export function SnapshotsCard() {
  const { plan, dispatch } = usePlan();
  const [accountId, setAccountId] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [balance, setBalance] = useState<string>("");

  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of plan.accounts) map.set(a.id, a.label);
    return map;
  }, [plan.accounts]);

  const sortedSnapshots = useMemo(() => {
    return [...plan.snapshots].sort((a, b) => compareYearMonth(a.month, b.month));
  }, [plan.snapshots]);

  const canAdd = accountId !== "" && isValidYearMonth(month) && balance !== "" && !Number.isNaN(Number(balance));

  const handleAdd = () => {
    if (!canAdd) return;
    dispatch({
      type: "snapshot/add",
      snapshot: {
        id: newId(),
        accountId,
        month: month as YearMonth,
        balance: Number(balance),
      },
    });
    setBalance("");
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
          <div className="grid gap-3 md:grid-cols-[1fr_160px_1fr_auto] md:items-end">
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
              <Input id="snapshot-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
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
                    {s.month} / {accountLabel.get(s.accountId) ?? "不明"}
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
