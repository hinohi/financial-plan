import { memo, useCallback, useMemo, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { MonthExprInput } from "@/components/month-expr-input";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumericCommittedInput } from "@/components/ui/numeric-committed-input";
import { NumericInput } from "@/components/ui/numeric-input";
import { PercentCommittedInput } from "@/components/ui/percent-committed-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { newId } from "@/lib/dsl/id";
import type { FlowRaise, FlowRaiseKind, GrossSalary, MonthExpr, Ulid } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { type PlanAction, usePlan } from "@/state/plan-store";

export function SalariesCard() {
  const { plan, dispatch } = usePlan();
  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [personId, setPersonId] = useState<string>("");
  const [annualAmount, setAnnualAmount] = useState<string>("");
  const [startMonth, setStartMonth] = useState<MonthExpr | undefined>(plan.settings.planStartMonth);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, toggleCollapsed] = useCollapse("gross-salaries");

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

  const canAdd =
    label.trim() !== "" &&
    accountId !== "" &&
    personId !== "" &&
    annualAmount !== "" &&
    !Number.isNaN(Number(annualAmount)) &&
    startMonth !== undefined;

  const handleAdd = () => {
    if (!canAdd || !startMonth) return;
    const salary: GrossSalary = {
      id: newId(),
      label: label.trim(),
      accountId,
      personId,
      annualAmount: Number(annualAmount),
      startMonth,
    };
    dispatch({ type: "gross-salary/add", salary });
    setLabel("");
    setAnnualAmount("");
  };

  const disabledReason =
    plan.accounts.length === 0
      ? "先に口座を追加してください。"
      : plan.persons.length === 0
        ? "先に人物を追加してください。"
        : null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>給与 (額面)</CardTitle>
            <CardDescription>
              年額の額面 (源泉徴収票の「支払金額」)
              を入力すると社会保険料・所得税・住民税を概算で自動控除する。月次は年額を 12
              等分した均等額で扱うので、賞与月の山は再現されない。複数登録した場合は各件独立で計算されるため、同一人物の副業は税率が低めに出る点に注意。
            </CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="給与" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          {disabledReason ? (
            <p className="text-sm text-muted-foreground">{disabledReason}</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_160px_200px_auto] lg:items-end">
              <div className="grid gap-2">
                <Label htmlFor="salary-label">ラベル</Label>
                <Input id="salary-label" placeholder="本業" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salary-account">振込口座</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="salary-account" className="w-full">
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
                <Label htmlFor="salary-person">人物</Label>
                <Select value={personId} onValueChange={setPersonId}>
                  <SelectTrigger id="salary-person" className="w-full">
                    <SelectValue placeholder="選択" />
                  </SelectTrigger>
                  <SelectContent>
                    {plan.persons.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salary-annual">年額 (円)</Label>
                <NumericInput id="salary-annual" value={annualAmount} onChange={setAnnualAmount} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="salary-start">開始月</Label>
                <MonthExprInput id="salary-start" value={startMonth} onChange={setStartMonth} />
              </div>
              <Button onClick={handleAdd} disabled={!canAdd}>
                追加
              </Button>
            </div>
          )}
          {plan.grossSalaries.length === 0 ? (
            <p className="text-sm text-muted-foreground">項目がありません。</p>
          ) : (
            <SortableList
              items={plan.grossSalaries}
              onReorder={(order) => dispatch({ type: "gross-salaries/reorder", order })}
              renderItem={(salary, handle) => {
                const isExpanded = expandedId === salary.id;
                return (
                  <div className="grid gap-3 px-2 py-3">
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex items-start gap-2">
                        {handle}
                        <div className="grid text-sm">
                          <span className="font-medium">
                            {salary.label}
                            <span className="ml-2 text-xs text-muted-foreground">
                              → {accountLabel.get(salary.accountId) ?? "不明"}
                            </span>
                            <span className="ml-2 text-xs text-muted-foreground">
                              / {personLabel.get(salary.personId) ?? "不明"}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            年額 <span className="font-mono tabular-nums">{formatYen(salary.annualAmount)}</span>
                            {salary.raise ? <span className="ml-1">(昇給あり)</span> : null}
                            {(salary.dependents ?? 0) > 0 ? (
                              <span className="ml-1">/ 扶養 {salary.dependents}人</span>
                            ) : null}
                            {salary.hasSpouseDeduction ? <span className="ml-1">/ 配偶者控除</span> : null}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setExpandedId(isExpanded ? null : salary.id)}
                        >
                          {isExpanded ? "閉じる" : "編集"}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => dispatch({ type: "gross-salary/remove", id: salary.id })}
                        >
                          削除
                        </Button>
                      </div>
                    </div>
                    {isExpanded ? (
                      <SalaryEditor
                        salary={salary}
                        accounts={plan.accounts}
                        persons={plan.persons}
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

type SalaryEditorProps = {
  salary: GrossSalary;
  accounts: { id: Ulid; label: string }[];
  persons: { id: Ulid; label: string }[];
  dispatch: (action: PlanAction) => void;
};

const SalaryEditor = memo(function SalaryEditor({ salary, accounts, persons, dispatch }: SalaryEditorProps) {
  const update = useCallback(
    (patch: Partial<Omit<GrossSalary, "id">>) => {
      dispatch({ type: "gross-salary/update", id: salary.id, patch });
    },
    [dispatch, salary.id],
  );

  const raise = salary.raise;

  const toggleRaise = (enabled: boolean) => {
    if (enabled) {
      update({ raise: { kind: "rate", value: 0.03, everyMonths: 12 } });
    } else {
      update({ raise: undefined });
    }
  };

  const updateRaise = (patch: Partial<FlowRaise>) => {
    if (!raise) return;
    update({ raise: { ...raise, ...patch } });
  };

  return (
    <div className="grid gap-4 rounded-md border border-dashed bg-muted/10 p-4">
      <div className="grid gap-3 md:grid-cols-3 md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${salary.id}-label`}>ラベル</Label>
          <CommittedInput id={`${salary.id}-label`} value={salary.label} onCommit={(v) => update({ label: v })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${salary.id}-account`}>振込口座</Label>
          <Select value={salary.accountId} onValueChange={(v) => update({ accountId: v })}>
            <SelectTrigger id={`${salary.id}-account`} className="w-full">
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
          <Label htmlFor={`${salary.id}-person`}>人物</Label>
          <Select value={salary.personId} onValueChange={(v) => update({ personId: v })}>
            <SelectTrigger id={`${salary.id}-person`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {persons.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[minmax(200px,1fr)_minmax(200px,1fr)_minmax(200px,1fr)] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${salary.id}-annual`}>年額 (円)</Label>
          <NumericCommittedInput
            id={`${salary.id}-annual`}
            value={salary.annualAmount}
            onCommit={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n)) return;
              update({ annualAmount: n });
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${salary.id}-start`}>開始月</Label>
          <MonthExprInput
            id={`${salary.id}-start`}
            value={salary.startMonth}
            onChange={(v) => v && update({ startMonth: v })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${salary.id}-end`}>終了月 (任意)</Label>
          <MonthExprInput
            id={`${salary.id}-end`}
            value={salary.endMonth}
            onChange={(v) => update({ endMonth: v })}
            allowEmpty
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={raise !== undefined}
          onChange={(e) => toggleRaise(e.target.checked)}
        />
        昇給を設定する (年額に対して適用)
      </label>
      {raise ? (
        <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr] md:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={`${salary.id}-raise-kind`}>種別</Label>
            <Select value={raise.kind} onValueChange={(v) => updateRaise({ kind: v as FlowRaiseKind })}>
              <SelectTrigger id={`${salary.id}-raise-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">固定額</SelectItem>
                <SelectItem value="rate">固定率</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${salary.id}-raise-value`}>値 {raise.kind === "rate" ? "(%)" : "(円)"}</Label>
            {raise.kind === "rate" ? (
              <PercentCommittedInput
                id={`${salary.id}-raise-value`}
                step={0.1}
                value={raise.value}
                onCommit={(ratio) => updateRaise({ value: ratio })}
              />
            ) : (
              <NumericCommittedInput
                id={`${salary.id}-raise-value`}
                value={raise.value}
                onCommit={(v) => {
                  const n = Number(v);
                  if (!Number.isNaN(n)) updateRaise({ value: n });
                }}
              />
            )}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${salary.id}-raise-every`}>間隔 (月)</Label>
            <CommittedInput
              id={`${salary.id}-raise-every`}
              type="number"
              inputMode="numeric"
              min={1}
              value={raise.everyMonths}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isInteger(n) && n >= 1) updateRaise({ everyMonths: n });
              }}
            />
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-[160px_auto] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${salary.id}-dependents`}>扶養親族数 (配偶者を除く)</Label>
          <CommittedInput
            id={`${salary.id}-dependents`}
            type="number"
            inputMode="numeric"
            min={0}
            value={salary.dependents ?? 0}
            onCommit={(v) => {
              const n = Number(v);
              if (!Number.isInteger(n) || n < 0) return;
              update({ dependents: n === 0 ? undefined : n });
            }}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={!!salary.hasSpouseDeduction}
            onChange={(e) => update({ hasSpouseDeduction: e.target.checked ? true : undefined })}
          />
          配偶者控除を適用する
        </label>
      </div>
    </div>
  );
});
