import { useMemo, useState } from "react";
import { CategorySelect } from "@/components/category-select";
import { CollapseToggle } from "@/components/collapse-toggle";
import { MonthExprInput } from "@/components/month-expr-input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCollapse } from "@/hooks/use-collapse";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { categoryPath } from "@/lib/categories";
import { newId } from "@/lib/dsl/id";
import { compareYearMonth, isPersonAgeRef, resolveMonthExpr } from "@/lib/dsl/month";
import { resolvePlan } from "@/lib/dsl/resolve";
import type { Category, MonthExpr, OneShotEvent, Ulid, YearMonth } from "@/lib/dsl/types";
import { formatYen } from "@/lib/format";
import { usePlan } from "@/state/plan-store";

export function EventsCard() {
  const { plan, dispatch } = usePlan();
  const [label, setLabel] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<Ulid | undefined>(undefined);
  const [month, setMonth] = useState<MonthExpr | undefined>(undefined);
  const [amount, setAmount] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  const categoryById = useMemo(() => {
    const map = new Map<Ulid, Category>();
    for (const c of plan.categories) map.set(c.id, c);
    return map;
  }, [plan.categories]);

  const resolvedEventMonth = useMemo(() => {
    const resolved = resolvePlan(plan);
    const map = new Map<string, string>();
    for (const ev of resolved.events) map.set(ev.id, ev.month);
    return map;
  }, [plan]);

  const sortedEvents = useMemo(() => {
    return [...plan.events].sort((a, b) => {
      const am = (resolvedEventMonth.get(a.id) ?? "9999-12") as YearMonth;
      const bm = (resolvedEventMonth.get(b.id) ?? "9999-12") as YearMonth;
      return compareYearMonth(am, bm);
    });
  }, [plan.events, resolvedEventMonth]);

  const canAdd =
    label.trim() !== "" && accountId !== "" && month !== undefined && amount !== "" && !Number.isNaN(Number(amount));

  const handleAdd = () => {
    if (!canAdd || !month) return;
    dispatch({
      type: "event/add",
      event: {
        id: newId(),
        label: label.trim(),
        accountId,
        categoryId,
        month,
        amount: Number(amount),
      },
    });
    setLabel("");
    setAmount("");
    setMonth(undefined);
    setCategoryId(undefined);
  };

  const describeMonth = (m: MonthExpr): string => {
    if (typeof m === "string") return m;
    const pl = personLabel.get(m.personId) ?? "?";
    const resolved = resolveMonthExpr(m, plan.persons, plan.settings.yearStartMonth) ?? "解決不能";
    return `${pl} ${m.age}歳の ${m.month}月 (${resolved})`;
  };

  const [collapsed, toggleCollapsed] = useCollapse("events");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>単発イベント</CardTitle>
            <CardDescription>
              ボーナスや大型支出など、ある月に一度だけ発生する収支 (正で収入、負で支出)
            </CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="単発イベント" />
        </div>
      </CardHeader>
      {collapsed ? null : (
      <CardContent className="grid gap-4">
        {plan.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">先に口座を追加してください。</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_1fr_200px_1fr_auto] md:items-end">
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
              <Label htmlFor="event-category">カテゴリ</Label>
              <CategorySelect
                id="event-category"
                kinds={["income", "expense"]}
                value={categoryId}
                onChange={setCategoryId}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="event-month">年月</Label>
              <MonthExprInput id="event-month" value={month} onChange={setMonth} />
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
            {sortedEvents.map((event) => {
              const categoryLabel = event.categoryId
                ? (() => {
                    const c = categoryById.get(event.categoryId);
                    return c ? categoryPath(c, categoryById) : "未分類";
                  })()
                : "未分類";
              const isExpanded = expandedId === event.id;
              return (
                <li key={event.id} className="grid gap-3 px-4 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="grid text-sm">
                      <span className="font-medium">
                        {event.label}
                        <span className="ml-2 text-xs text-muted-foreground">
                          {describeMonth(event.month)} / {accountLabel.get(event.accountId) ?? "不明"} / {categoryLabel}
                        </span>
                        {isPersonAgeRef(event.month) ? (
                          <span className="ml-1 rounded-sm bg-muted px-1 text-[10px] text-muted-foreground">
                            人物参照
                          </span>
                        ) : null}
                      </span>
                      <span className="font-mono tabular-nums">{formatYen(event.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setExpandedId(isExpanded ? null : event.id)}>
                        {isExpanded ? "閉じる" : "編集"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dispatch({ type: "event/remove", id: event.id })}
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? <EventEditor event={event} /> : null}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      )}
    </Card>
  );
}

function EventEditor({ event }: { event: OneShotEvent }) {
  const { plan, dispatch } = usePlan();

  const update = (patch: Partial<Omit<OneShotEvent, "id">>) => {
    dispatch({ type: "event/update", id: event.id, patch });
  };

  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4 md:grid-cols-[1fr_1fr_1fr_200px_1fr] md:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor={`${event.id}-label`}>ラベル</Label>
        <CommittedInput id={`${event.id}-label`} value={event.label} onCommit={(v) => update({ label: v })} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${event.id}-account`}>口座</Label>
        <Select value={event.accountId} onValueChange={(v) => update({ accountId: v })}>
          <SelectTrigger id={`${event.id}-account`} className="w-full">
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
        <Label htmlFor={`${event.id}-category`}>カテゴリ</Label>
        <CategorySelect
          id={`${event.id}-category`}
          kinds={["income", "expense"]}
          value={event.categoryId}
          onChange={(v) => update({ categoryId: v })}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${event.id}-month`}>年月</Label>
        <MonthExprInput
          id={`${event.id}-month`}
          value={event.month}
          onChange={(v) => {
            if (!v) return;
            update({ month: v });
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`${event.id}-amount`}>金額 (円、負で支出)</Label>
        <CommittedInput
          id={`${event.id}-amount`}
          type="number"
          inputMode="numeric"
          value={event.amount}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            update({ amount: n });
          }}
        />
      </div>
    </div>
  );
}
