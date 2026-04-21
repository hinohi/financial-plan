import { useMemo, useState } from "react";
import { SegmentList } from "@/components/segment-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/dsl/id";
import { isValidYearMonth } from "@/lib/dsl/month";
import type { Expense, FlowSegment, Income, Ulid, YearMonth } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { type PlanAction, usePlan } from "@/state/plan-store";

type FlowKind = "income" | "expense";

type FlowsCardProps = {
  kind: FlowKind;
};

type Flow = Income | Expense;

type FlowConfig = {
  title: string;
  description: string;
  placeholderLabel: string;
  addAction: (flow: Flow) => PlanAction;
  updateAction: (id: Ulid, patch: Partial<Omit<Flow, "id">>) => PlanAction;
  removeAction: (id: Ulid) => PlanAction;
};

const CONFIG: Record<FlowKind, FlowConfig> = {
  income: {
    title: "収入",
    description: "入金先の口座へ毎月加算される",
    placeholderLabel: "給与",
    addAction: (flow) => ({ type: "income/add", income: flow as Income }),
    updateAction: (id, patch) => ({ type: "income/update", id, patch: patch as Partial<Omit<Income, "id">> }),
    removeAction: (id) => ({ type: "income/remove", id }),
  },
  expense: {
    title: "支出",
    description: "出金元の口座から毎月減算される",
    placeholderLabel: "家賃",
    addAction: (flow) => ({ type: "expense/add", expense: flow as Expense }),
    updateAction: (id, patch) => ({ type: "expense/update", id, patch: patch as Partial<Omit<Expense, "id">> }),
    removeAction: (id) => ({ type: "expense/remove", id }),
  },
};

export function FlowsCard({ kind }: FlowsCardProps) {
  const { plan, dispatch } = usePlan();
  const config = CONFIG[kind];
  const flows: Flow[] = kind === "income" ? plan.incomes : plan.expenses;

  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState<string>("");
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
    accountId !== "" &&
    amount !== "" &&
    !Number.isNaN(Number(amount)) &&
    isValidYearMonth(startMonth) &&
    (endMonth === "" || isValidYearMonth(endMonth));

  const handleAdd = () => {
    if (!canAdd) return;
    const segment: FlowSegment = {
      startMonth: startMonth as YearMonth,
      endMonth: endMonth === "" ? undefined : (endMonth as YearMonth),
      amount: Number(amount),
    };
    dispatch(config.addAction({ id: newId(), label: label.trim(), accountId, segments: [segment] }));
    setLabel("");
    setAmount("");
    setEndMonth("");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{config.title}</CardTitle>
        <CardDescription>{config.description}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {plan.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">先に口座を追加してください。</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_160px_160px_160px_auto] lg:items-end">
            <div className="grid gap-2">
              <Label htmlFor={`${kind}-label`}>ラベル</Label>
              <Input
                id={`${kind}-label`}
                placeholder={config.placeholderLabel}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${kind}-account`}>口座</Label>
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger id={`${kind}-account`} className="w-full">
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
              <Label htmlFor={`${kind}-amount`}>月額 (円)</Label>
              <Input
                id={`${kind}-amount`}
                type="number"
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${kind}-start`}>開始月</Label>
              <Input
                id={`${kind}-start`}
                type="month"
                value={startMonth}
                onChange={(e) => setStartMonth(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`${kind}-end`}>終了月 (任意)</Label>
              <Input id={`${kind}-end`} type="month" value={endMonth} onChange={(e) => setEndMonth(e.target.value)} />
            </div>
            <Button onClick={handleAdd} disabled={!canAdd}>
              追加
            </Button>
          </div>
        )}
        {flows.length === 0 ? (
          <p className="text-sm text-muted-foreground">項目がありません。</p>
        ) : (
          <ul className="divide-y rounded-md border">
            {flows.map((flow) => {
              const head = flow.segments[0];
              const extra = flow.segments.length - 1;
              const isExpanded = expandedId === flow.id;
              return (
                <li key={flow.id} className="grid gap-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="grid text-sm">
                      <span className="font-medium">
                        {flow.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          → {accountLabel.get(flow.accountId) ?? "不明"}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {head ? (
                          <>
                            {head.startMonth} 〜 {head.endMonth ?? "計画終了"} / 月額{" "}
                            <span className="font-mono tabular-nums">{formatYen(head.amount)}</span>
                            {head.raise ? <span className="ml-1">(昇給あり)</span> : null}
                            {extra > 0 ? <span className="ml-1">+{extra} セグメント</span> : null}
                          </>
                        ) : (
                          "—"
                        )}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setExpandedId(isExpanded ? null : flow.id)}>
                        {isExpanded ? "閉じる" : "編集"}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => dispatch(config.removeAction(flow.id))}>
                        削除
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? (
                    <FlowEditor
                      flow={flow}
                      planStart={plan.settings.planStartMonth}
                      onLabelChange={(value) =>
                        dispatch(config.updateAction(flow.id, { label: value } as Partial<Omit<Flow, "id">>))
                      }
                      onAccountChange={(value) =>
                        dispatch(config.updateAction(flow.id, { accountId: value } as Partial<Omit<Flow, "id">>))
                      }
                      onSegmentsChange={(next) =>
                        dispatch(config.updateAction(flow.id, { segments: next } as Partial<Omit<Flow, "id">>))
                      }
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

type FlowEditorProps = {
  flow: Flow;
  planStart: YearMonth;
  onLabelChange: (value: string) => void;
  onAccountChange: (value: string) => void;
  onSegmentsChange: (next: FlowSegment[]) => void;
};

function FlowEditor({ flow, planStart, onLabelChange, onAccountChange, onSegmentsChange }: FlowEditorProps) {
  const { plan } = usePlan();
  return (
    <div className="grid gap-4 rounded-md border border-dashed bg-muted/10 p-4">
      <div className="grid gap-3 md:grid-cols-2 md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${flow.id}-label`}>ラベル</Label>
          <Input id={`${flow.id}-label`} value={flow.label} onChange={(e) => onLabelChange(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${flow.id}-account`}>口座</Label>
          <Select value={flow.accountId} onValueChange={onAccountChange}>
            <SelectTrigger id={`${flow.id}-account`} className="w-full">
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
        idPrefix={`${flow.id}-seg`}
        segments={flow.segments}
        planStart={planStart}
        onChange={onSegmentsChange}
      />
    </div>
  );
}
