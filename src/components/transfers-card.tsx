import { memo, useCallback, useMemo, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { MonthExprInput } from "@/components/month-expr-input";
import { SegmentList } from "@/components/segment-list";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCommittedInput } from "@/components/ui/numeric-committed-input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { newId } from "@/lib/dsl/id";
import type { Account, FlowSegment, MonthExpr, Transfer } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { type PlanAction, usePlan } from "@/state/plan-store";

export function TransfersCard() {
  const { plan, dispatch } = usePlan();

  const [label, setLabel] = useState("");
  const [fromAccountId, setFromAccountId] = useState<string>("");
  const [toAccountId, setToAccountId] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [startMonth, setStartMonth] = useState<MonthExpr | undefined>(plan.settings.planStartMonth);
  const [endMonth, setEndMonth] = useState<MonthExpr | undefined>(undefined);
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
    startMonth !== undefined;

  const handleAdd = () => {
    if (!canAdd || !startMonth) return;
    const segment: FlowSegment = {
      startMonth,
      endMonth,
      amount: Number(amount),
    };
    dispatch({
      type: "transfer/add",
      transfer: { id: newId(), label: label.trim(), fromAccountId, toAccountId, segments: [segment] },
    });
    setLabel("");
    setAmount("");
    setEndMonth(undefined);
  };

  const twoAccounts = plan.accounts.length >= 2;
  const [collapsed, toggleCollapsed] = useCollapse("transfers");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>口座間振替</CardTitle>
            <CardDescription>出金元から入金先へ資金を移す。合計残高は変わらない</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="口座間振替" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          {!twoAccounts ? (
            <p className="text-sm text-muted-foreground">振替には 2 つ以上の口座が必要です。</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1fr_140px_200px_200px_auto] lg:items-end">
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
                <NumericInput id="transfer-amount" value={amount} onChange={setAmount} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transfer-start">開始月</Label>
                <MonthExprInput id="transfer-start" value={startMonth} onChange={setStartMonth} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="transfer-end">終了月 (任意)</Label>
                <MonthExprInput id="transfer-end" value={endMonth} onChange={setEndMonth} allowEmpty />
              </div>
              <Button onClick={handleAdd} disabled={!canAdd}>
                追加
              </Button>
            </div>
          )}
          {plan.transfers.length === 0 ? (
            <p className="text-sm text-muted-foreground">振替がありません。</p>
          ) : (
            <SortableList
              items={plan.transfers}
              onReorder={(order) => dispatch({ type: "transfers/reorder", order })}
              renderItem={(transfer, handle) => {
                const head = transfer.segments[0];
                const extra = transfer.segments.length - 1;
                const isExpanded = expandedId === transfer.id;
                return (
                  <div className="grid gap-3 px-2 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2">
                        {handle}
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
                                {formatMonthExpr(head.startMonth)} 〜{" "}
                                {head.endMonth ? formatMonthExpr(head.endMonth) : "計画終了"} /{" "}
                                {(head.intervalMonths ?? 1) > 1 ? `${head.intervalMonths} ヶ月ごとに ` : "月額 "}
                                <span className="font-mono tabular-nums">{formatYen(head.amount)}</span>
                                {head.raise ? <span className="ml-1">(増減あり)</span> : null}
                                {extra > 0 ? <span className="ml-1">+{extra} セグメント</span> : null}
                                {transfer.minFromBalance !== undefined ? (
                                  <span className="ml-1">
                                    / 出金元下限{" "}
                                    <span className="font-mono tabular-nums">{formatYen(transfer.minFromBalance)}</span>
                                  </span>
                                ) : null}
                                {transfer.minToBalance !== undefined ? (
                                  <span className="ml-1">
                                    / 入金先下限{" "}
                                    <span className="font-mono tabular-nums">{formatYen(transfer.minToBalance)}</span>
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
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
                    {isExpanded ? (
                      <TransferEditor
                        transfer={transfer}
                        planStart={plan.settings.planStartMonth}
                        accounts={plan.accounts}
                        dispatch={dispatch}
                      />
                    ) : null}
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      )}
    </Card>
  );
}

function formatMonthExpr(expr: MonthExpr): string {
  if (typeof expr === "string") return expr;
  return `参照(${expr.age}歳${expr.month}月)`;
}

type TransferEditorProps = {
  transfer: Transfer;
  planStart: MonthExpr;
  accounts: Account[];
  dispatch: (action: PlanAction) => void;
};

const TransferEditor = memo(function TransferEditor({ transfer, planStart, accounts, dispatch }: TransferEditorProps) {
  const update = useCallback(
    (patch: Partial<Omit<Transfer, "id">>) => {
      dispatch({ type: "transfer/update", id: transfer.id, patch });
    },
    [dispatch, transfer.id],
  );

  const minFromEnabled = transfer.minFromBalance !== undefined;
  const minToEnabled = transfer.minToBalance !== undefined;

  return (
    <div className="grid gap-4 rounded-md border border-dashed bg-muted/10 p-4">
      <div className="grid gap-3 md:grid-cols-3 md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${transfer.id}-label`}>ラベル</Label>
          <CommittedInput id={`${transfer.id}-label`} value={transfer.label} onCommit={(v) => update({ label: v })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${transfer.id}-from`}>出金元</Label>
          <Select value={transfer.fromAccountId} onValueChange={(v) => update({ fromAccountId: v })}>
            <SelectTrigger id={`${transfer.id}-from`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
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
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-2 rounded-md border border-border/60 bg-muted/5 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={minFromEnabled}
            onChange={(e) => update({ minFromBalance: e.target.checked ? 0 : undefined })}
          />
          出金元の最低残高を下回らない範囲で移動する
        </label>
        {minFromEnabled ? (
          <div className="grid gap-3 md:grid-cols-[240px_1fr] md:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`${transfer.id}-min-from`}>出金元の最低残高 (円)</Label>
              <NumericCommittedInput
                id={`${transfer.id}-min-from`}
                value={transfer.minFromBalance ?? 0}
                onCommit={(v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return;
                  update({ minFromBalance: n });
                }}
              />
            </div>
            <p className="self-center text-xs text-muted-foreground">
              出金元の月初残高が最低残高を上回っている分だけ移動する。残高が足りなければ部分的に移動、下回っていれば 0。
            </p>
          </div>
        ) : null}
      </div>
      <div className="grid gap-2 rounded-md border border-border/60 bg-muted/5 p-3">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={minToEnabled}
            onChange={(e) => update({ minToBalance: e.target.checked ? 0 : undefined })}
          />
          入金先の残高が最低額を下回ったら補充する
        </label>
        {minToEnabled ? (
          <div className="grid gap-3 md:grid-cols-[240px_1fr] md:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`${transfer.id}-min-to`}>入金先の最低残高 (円)</Label>
              <NumericCommittedInput
                id={`${transfer.id}-min-to`}
                value={transfer.minToBalance ?? 0}
                onCommit={(v) => {
                  const n = Number(v);
                  if (!Number.isFinite(n)) return;
                  update({ minToBalance: n });
                }}
              />
            </div>
            <p className="self-center text-xs text-muted-foreground">
              入金先の月初残高が最低残高を下回っていれば、その差分だけ振替する。セグメントの月額は 1
              回あたりの補充上限として機能する。
            </p>
          </div>
        ) : null}
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
});
