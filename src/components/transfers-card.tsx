import { useMemo, useState } from "react";
import { SegmentList } from "@/components/segment-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/dsl/id";
import { isValidYearMonth } from "@/lib/dsl/month";
import type { FlowSegment, Transfer, YearMonth } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { usePlan } from "@/state/plan-store";

export function TransfersCard() {
  const { plan, dispatch } = usePlan();

  const [label, setLabel] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [startMonth, setStartMonth] = useState<string>(plan.settings.planStartMonth);
  const [endMonth, setEndMonth] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of plan.accounts) map.set(a.id, a.label);
    return map;
  }, [plan.accounts]);

  const canAdd =
    label.trim() !== "" &&
    fromAccountId !== "" &&
    toAccountId !== "" &&
    fromAccountId !== toAccountId &&
    amount !== "" &&
    !Number.isNaN(Number(amount)) &&
    Number(amount) >= 0 &&
    isValidYearMonth(startMonth) &&
    (endMonth === "" || isValidYearMonth(endMonth));

  const handleAdd = () => {
    if (!canAdd) return;
    const segment: FlowSegment = {
      startMonth: startMonth as YearMonth,
      endMonth: endMonth === "" ? undefined : (endMonth as YearMonth),
      amount: Number(amount),
    };
    dispatch({
      type: "transfer/add",
      transfer: { id: newId(), label: label.trim(), fromAccountId, toAccountId, segments: [segment] },
    });
    setLabel("");
    setAmount("");
    setEndMonth("");
  };

  const twoAccounts = plan.accounts.length >= 2;

  return (
    <Card>
      <CardHeader>
        <CardTitle>口座間振替</CardTitle>
        <CardDescription>出金元から入金先へ資金を移す。合計残高は変わらない</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!twoAccounts ? (
          <p className="text-sm text-muted-foreground">振替には 2 つ以上の口座が必要です。</p>
        ) : (
          <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_140px_140px_140px_auto] lg:items-end">
            <div className="grid gap-2">
              <Label htmlFor="transfer-label">ラベル</Label>
              <Input
                id="transfer-label"
                placeholder="NISA 積立"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="transfer-from">出金元</Label>
              <Select value={fromAccountId} onValueChange={setFromAccountId}>
                <SelectTrigger id="transfer-from" className="w-full">
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
              <Label htmlFor="transfer-to">入金先</Label>
              <Select value={toAccountId} onValueChange={setToAccountId}>
                <SelectTrigger id="transfer-to" className="w-full">
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
              <Label htmlFor="transfer-amount">月額 (円)</Label>
              <Input
                id="transfer-amount"
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="transfer-start">開始月</Label>
              <Input
                id="transfer-start"
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="transfer-end">終了月 (任意)</Label>
              <Input id="transfer-end" type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd}>
              追加
            </Button>
          </div>
        )}
        {plan.transfers.length === 0 ? (
          <p className="text-sm text-muted-foreground">振替がありません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {plan.transfers.map((transfer) => {
              const head = transfer.segments[0];
              const extra = transfer.segments.length - 1;
              const isExpanded = expandedId === transfer.id;
              return (
                <li key={transfer.id} className="grid gap-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="grid text-sm">
                      <span className="font-medium">
                        {transfer.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {accountLabel.get(transfer.fromAccountId) ?? "不明"} →{" "}
                          {accountLabel.get(transfer.toAccountId) ?? "不明"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {head ? (
                          <>
                            {head.startMonth} 〜 {head.endMonth ?? "計画終了"} /{" "}
                            {(head.intervalMonths ?? 1) > 1 ? `${head.intervalMonths} ヶ月ごとに ` : "月額 "}
                            <span className="font-mono tabular-nums">{formatYen(head.amount)}</span>
                            {head.raise ? <span className="ml-1">(増減あり)</span> : null}
                            {extra > 0 ? <span className="ml-1">+{extra} セグメント</span> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : transfer.id)}
                      >
                        {isExpanded ? "閉じる" : "編集"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dispatch({ type: "transfer/remove", id: transfer.id })}
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? <TransferEditor transfer={transfer} planStart={plan.settings.planStartMonth} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type TransferEditorProps = {
  transfer: Transfer;
  planStart: YearMonth;
};

function TransferEditor({ transfer, planStart }: TransferEditorProps) {
  const { plan, dispatch } = usePlan();

  const update = (patch: Partial<Omit<Transfer, "id">>) => {
    dispatch({ type: "transfer/update", id: transfer.id, patch });
  };

  return (
    <div className="grid gap-4 rounded-md border border-dashed bg-muted/10 p-4">
      <div className="grid gap-3 md:grid-cols-3 md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${transfer.id}-label`}>ラベル</Label>
          <Input
            id={`${transfer.id}-label`}
            value={transfer.label}
            onChange={(e) => update({ label: e.target.value })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${transfer.id}-from`}>出金元</Label>
          <Select value={transfer.fromAccountId} onValueChange={(v) => update({ fromAccountId: v })}>
            <SelectTrigger id={`${transfer.id}-from`} className="w-full">
              <SelectValue />
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
        <div className="grid gap-1.5">
          <Label htmlFor={`${transfer.id}-to`}>入金先</Label>
          <Select value={transfer.toAccountId} onValueChange={(v) => update({ toAccountId: v })}>
            <SelectTrigger id={`${transfer.id}-to`} className="w-full">
              <SelectValue />
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
      </div>
      <SegmentList
        idPrefix={`${transfer.id}-seg`}
        segments={transfer.segments}
        planStart={planStart}
        showInterval
        onChange={(segments) => update({ segments })}
      />
    </div>
  );
}
