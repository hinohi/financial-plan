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

export function EventsCard() {
  const { plan, dispatch } = usePlan();
  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [month, setMonth] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of plan.accounts) map.set(a.id, a.label);
    return map;
  }, [plan.accounts]);

  const sortedEvents = useMemo(() => {
    return [...plan.events].sort((a, b) => compareYearMonth(a.month, b.month));
  }, [plan.events]);

  const canAdd =
    label.trim() !== "" &&
    accountId !== "" &&
    isValidYearMonth(month) &&
    amount !== "" &&
    !Number.isNaN(Number(amount));

  const handleAdd = () => {
    if (!canAdd) return;
    dispatch({
      type: "event/add",
      event: {
        id: newId(),
        label: label.trim(),
        accountId,
        month: month as YearMonth,
        amount: Number(amount),
      },
    });
    setLabel("");
    setAmount("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>単発イベント</CardTitle>
        <CardDescription>ボーナスや大型支出など、ある月に一度だけ発生する収支 (正で収入、負で支出)</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {plan.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">先に口座を追加してください。</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_160px_1fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="event-label">ラベル</Label>
              <Input
                id="event-label"
                placeholder="ボーナス / 住宅購入"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-account">口座</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id="event-account" className="w-full">
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
              <Label htmlFor="event-month">年月</Label>
              <Input id="event-month" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-amount">金額 (円、負で支出)</Label>
              <Input
                id="event-amount"
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd}>
              追加
            </Button>
          </div>
        )}
        {sortedEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground">まだイベントがありません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {sortedEvents.map((event) => (
              <li key={event.id} className="flex items-center justify-between gap-4 px-4 py-2">
                <div className="grid text-sm">
                  <span className="font-medium">
                    {event.label}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {event.month} / {accountLabel.get(event.accountId) ?? "不明"}
                    </span>
                  </span>
                  <span className="font-mono tabular-nums">{formatYen(event.amount)}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "event/remove", id: event.id })}>
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
