import { memo, useCallback, useMemo, useState } from "react";
import { CategorySelect } from "@/components/category-select";
import { CollapseToggle } from "@/components/collapse-toggle";
import { LoanEditor } from "@/components/loan-editor";
import { MonthExprInput } from "@/components/month-expr-input";
import { SegmentList } from "@/components/segment-list";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { categoryPath } from "@/lib/categories";
import { newId } from "@/lib/dsl/id";
import type { Account, Category, Expense, FlowSegment, Income, LoanSpec, MonthExpr, Ulid } from "@/lib/dsl/types";
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
  reorderAction: (order: Ulid[]) => PlanAction;
};

const CONFIG: Record<FlowKind, FlowConfig> = {
  income: {
    title: "収入",
    description: "入金先の口座へ毎月加算される",
    placeholderLabel: "給与",
    addAction: (flow) => ({ type: "income/add", income: flow as Income }),
    updateAction: (id, patch) => ({ type: "income/update", id, patch: patch as Partial<Omit<Income, "id">> }),
    removeAction: (id) => ({ type: "income/remove", id }),
    reorderAction: (order) => ({ type: "incomes/reorder", order }),
  },
  expense: {
    title: "支出",
    description: "出金元の口座から毎月減算される",
    placeholderLabel: "家賃",
    addAction: (flow) => ({ type: "expense/add", expense: flow as Expense }),
    updateAction: (id, patch) => ({ type: "expense/update", id, patch: patch as Partial<Omit<Expense, "id">> }),
    removeAction: (id) => ({ type: "expense/remove", id }),
    reorderAction: (order) => ({ type: "expenses/reorder", order }),
  },
};

export function FlowsCard({ kind }: FlowsCardProps) {
  const { plan, dispatch } = usePlan();
  const config = CONFIG[kind];
  const flows: Flow[] = kind === "income" ? plan.incomes : plan.expenses;

  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<Ulid | undefined>(undefined);
  const [amount, setAmount] = useState<string>("");
  const [startMonth, setStartMonth] = useState<MonthExpr | undefined>(plan.settings.planStartMonth);
  const [endMonth, setEndMonth] = useState<MonthExpr | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const accountLabel = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of plan.accounts) map.set(a.id, a.label);
    return map;
  }, [plan.accounts]);

  const categoryById = useMemo(() => {
    const map = new Map<Ulid, Category>();
    for (const c of plan.categories) map.set(c.id, c);
    return map;
  }, [plan.categories]);

  const canAdd =
    label.trim() !== "" &&
    accountId !== "" &&
    amount !== "" &&
    !Number.isNaN(Number(amount)) &&
    startMonth !== undefined;

  const handleAdd = () => {
    if (!canAdd || !startMonth) return;
    const segment: FlowSegment = {
      startMonth,
      endMonth,
      amount: Number(amount),
    };
    dispatch(config.addAction({ id: newId(), label: label.trim(), accountId, categoryId, segments: [segment] }));
    setLabel("");
    setAmount("");
    setEndMonth(undefined);
    setCategoryId(undefined);
  };

  const [collapsed, toggleCollapsed] = useCollapse(`flows-${kind}`);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{config.title}</CardTitle>
            <CardDescription>{config.description}</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label={config.title} />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          {plan.accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">先に口座を追加してください。</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_140px_200px_200px_auto] lg:items-end">
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
                <Label htmlFor={`${kind}-category`}>カテゴリ</Label>
                <CategorySelect id={`${kind}-category`} kinds={kind} value={categoryId} onChange={setCategoryId} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${kind}-amount`}>月額 (円)</Label>
                <NumericInput id={`${kind}-amount`} value={amount} onChange={setAmount} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${kind}-start`}>開始月</Label>
                <MonthExprInput id={`${kind}-start`} value={startMonth} onChange={setStartMonth} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`${kind}-end`}>終了月 (任意)</Label>
                <MonthExprInput id={`${kind}-end`} value={endMonth} onChange={setEndMonth} allowEmpty />
              </div>
              <Button onClick={handleAdd} disabled={!canAdd}>
                追加
              </Button>
            </div>
          )}
          {flows.length === 0 ? (
            <p className="text-sm text-muted-foreground">項目がありません。</p>
          ) : (
            <SortableList
              items={flows}
              onReorder={(order) => dispatch(config.reorderAction(order))}
              renderItem={(flow, handle) => {
                const head = flow.segments[0];
                const extra = flow.segments.length - 1;
                const isExpanded = expandedId === flow.id;
                const loan = kind === "expense" ? (flow as Expense).loan : undefined;
                const loanHead = loan?.rateSegments[0];
                const loanLast = loan?.rateSegments[loan.rateSegments.length - 1];
                return (
                  <div className="grid gap-3 px-2 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2">
                        {handle}
                        <div className="grid text-sm">
                          <span className="font-medium">
                            {flow.label}
                            <span className="ml-2 text-xs text-muted-foreground">
                              → {accountLabel.get(flow.accountId) ?? "不明"}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              {flow.categoryId
                                ? (() => {
                                    const c = categoryById.get(flow.categoryId);
                                    return c ? `／ ${categoryPath(c, categoryById)}` : "／ 未分類";
                                  })()
                                : "／ 未分類"}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {loan ? (
                              <>
                                ローン / 元本{" "}
                                <span className="font-mono tabular-nums">{formatYen(loan.principal)}</span>
                                {loanHead
                                  ? ` / ${formatMonthExpr(loanHead.startMonth)} 〜 ${loanLast?.endMonth ? formatMonthExpr(loanLast.endMonth) : "計画終了"}`
                                  : null}
                                {loan.rateSegments.length > 1 ? (
                                  <span className="ml-1">金利 {loan.rateSegments.length} 区間</span>
                                ) : null}
                              </>
                            ) : head ? (
                              <>
                                {formatMonthExpr(head.startMonth)} 〜{" "}
                                {head.endMonth ? formatMonthExpr(head.endMonth) : "計画終了"} /{" "}
                                {(head.intervalMonths ?? 1) > 1 ? `${head.intervalMonths} ヶ月ごとに ` : "月額 "}
                                <span className="font-mono tabular-nums">{formatYen(head.amount)}</span>
                                {head.raise ? <span className="ml-1">(昇給あり)</span> : null}
                                {extra > 0 ? <span className="ml-1">+{extra} セグメント</span> : null}
                              </>
                            ) : (
                              "—"
                            )}
                          </span>
                        </div>
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
                        kind={kind}
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

type FlowEditorProps = {
  flow: Flow;
  kind: FlowKind;
  planStart: MonthExpr;
  accounts: Account[];
  dispatch: (action: PlanAction) => void;
};

const FlowEditor = memo(function FlowEditor({ flow, kind, planStart, accounts, dispatch }: FlowEditorProps) {
  const config = CONFIG[kind];
  const loan = kind === "expense" ? (flow as Expense).loan : undefined;
  const loanEnabled = !!loan;

  const update = useCallback(
    (patch: Partial<Omit<Flow, "id">>) => {
      dispatch(config.updateAction(flow.id, patch as Partial<Omit<Flow, "id">>));
    },
    [dispatch, config, flow.id],
  );

  const onLabelChange = useCallback((v: string) => update({ label: v } as Partial<Omit<Flow, "id">>), [update]);
  const onAccountChange = useCallback((v: string) => update({ accountId: v } as Partial<Omit<Flow, "id">>), [update]);
  const onCategoryChange = useCallback(
    (v: Ulid | undefined) => update({ categoryId: v } as Partial<Omit<Flow, "id">>),
    [update],
  );
  const onSegmentsChange = useCallback(
    (next: FlowSegment[]) => update({ segments: next } as Partial<Omit<Flow, "id">>),
    [update],
  );
  const onLoanChange = useCallback(
    (next: LoanSpec | undefined) => update({ loan: next } as Partial<Omit<Flow, "id">>),
    [update],
  );

  const toggleLoan = (enabled: boolean) => {
    if (enabled) {
      onLoanChange({
        principal: 0,
        rateSegments: [{ startMonth: planStart, annualRate: 0 }],
      });
    } else {
      onLoanChange(undefined);
    }
  };

  return (
    <div className="grid gap-4 rounded-md border border-dashed bg-muted/10 p-4">
      <div className="grid gap-3 md:grid-cols-3 md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${flow.id}-label`}>ラベル</Label>
          <CommittedInput id={`${flow.id}-label`} value={flow.label} onCommit={onLabelChange} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${flow.id}-account`}>口座</Label>
          <Select value={flow.accountId} onValueChange={onAccountChange}>
            <SelectTrigger id={`${flow.id}-account`} className="w-full">
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
          <Label htmlFor={`${flow.id}-category`}>カテゴリ</Label>
          <CategorySelect id={`${flow.id}-category`} kinds={kind} value={flow.categoryId} onChange={onCategoryChange} />
        </div>
      </div>
      {kind === "expense" ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={loanEnabled}
            onChange={(e) => toggleLoan(e.target.checked)}
          />
          ローン返済モード (元利均等で月次返済額を自動計算)
        </label>
      ) : null}
      {loanEnabled && loan ? (
        <LoanEditor idPrefix={`${flow.id}-loan`} loan={loan} planStart={planStart} onChange={onLoanChange} />
      ) : (
        <SegmentList
          idPrefix={`${flow.id}-seg`}
          segments={flow.segments}
          planStart={planStart}
          showInterval
          onChange={onSegmentsChange}
        />
      )}
    </div>
  );
});
