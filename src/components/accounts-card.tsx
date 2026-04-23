import { useMemo, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { MonthExprInput } from "@/components/month-expr-input";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { newId } from "@/lib/dsl/id";
import {
  ACCOUNT_KIND_LABEL,
  ACCOUNT_KINDS,
  type Account,
  type AccountKind,
  LIABILITY_SCHEDULE_KIND_LABEL,
  type LiabilityParams,
  type LiabilityScheduleKind,
  type Ulid,
} from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

const NONE_VALUE = "__none__";

export function AccountsCard() {
  const { plan, dispatch } = usePlan();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AccountKind>("cash");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [collapsed, toggleCollapsed] = useCollapse("accounts");

  const handleAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    dispatch({ type: "account/add", account: { id: newId(), label: trimmed, kind } });
    setLabel("");
    setKind("cash");
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>口座</CardTitle>
            <CardDescription>
              すべてのフローはここを通る。投資・負債・不動産は固有パラメータで運用益/返済/減価が自動計算される
            </CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="口座" />
        </div>
      </CardHeader>
      {collapsed ? null : (
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="account-label">ラベル</Label>
            <Input id="account-label" placeholder="普通預金" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account-kind">種別</Label>
            <Select value={kind} onValueChange={(v) => setKind(v as AccountKind)}>
              <SelectTrigger id="account-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ACCOUNT_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {ACCOUNT_KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={handleAdd} disabled={!label.trim()}>
            追加
          </Button>
        </div>
        {plan.accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground">口座を追加してください。</p>
        ) : (
          <SortableList
            items={plan.accounts}
            onReorder={(order) => dispatch({ type: "accounts/reorder", order })}
            renderItem={(account, handle) => {
              const isExpanded = expandedId === account.id;
              return (
                <div className="grid gap-3 px-2 py-3">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                      {handle}
                      <div className="grid">
                        <span className="font-medium">{account.label}</span>
                        <span className="text-xs text-muted-foreground">
                          {ACCOUNT_KIND_LABEL[account.kind]}
                          {summaryForAccount(account)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setExpandedId(isExpanded ? null : account.id)}
                      >
                        {isExpanded ? "閉じる" : "編集"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => dispatch({ type: "account/remove", id: account.id })}
                      >
                        削除
                      </Button>
                    </div>
                  </div>
                  {isExpanded ? <AccountEditor account={account} /> : null}
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

function summaryForAccount(account: Account): string {
  if (account.kind === "investment" && account.investment) {
    return ` / 年利 ${(account.investment.annualRate * 100).toFixed(2)}%`;
  }
  if (account.kind === "property" && account.property) {
    return ` / 減価 年率 ${(account.property.annualDepreciationRate * 100).toFixed(2)}%`;
  }
  if (account.kind === "liability" && account.liability) {
    const l = account.liability;
    return ` / ${LIABILITY_SCHEDULE_KIND_LABEL[l.scheduleKind]} 年利 ${(l.annualRate * 100).toFixed(2)}% / ${l.termMonths} ヶ月`;
  }
  return "";
}

function AccountEditor({ account }: { account: Account }) {
  const { dispatch } = usePlan();
  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_200px] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`acc-${account.id}-label`}>ラベル</Label>
          <CommittedInput
            id={`acc-${account.id}-label`}
            value={account.label}
            onCommit={(v) => dispatch({ type: "account/update", id: account.id, patch: { label: v } })}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>種別</Label>
          <span className="text-sm text-muted-foreground">{ACCOUNT_KIND_LABEL[account.kind]}</span>
        </div>
      </div>
      <AccountParamsEditor account={account} />
    </div>
  );
}

function AccountParamsEditor({ account }: { account: Account }) {
  switch (account.kind) {
    case "investment":
      return <InvestmentEditor account={account} />;
    case "property":
      return <PropertyEditor account={account} />;
    case "liability":
      return <LiabilityEditor account={account} />;
    default:
      return null;
  }
}

function InvestmentEditor({ account }: { account: Account }) {
  const { dispatch } = usePlan();
  const value = account.investment?.annualRate ?? 0;
  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4 md:grid-cols-[260px_1fr]">
      <div className="grid gap-1.5">
        <Label htmlFor={`inv-${account.id}-rate`}>年利 (小数: 0.05 = 5%)</Label>
        <CommittedInput
          id={`inv-${account.id}-rate`}
          type="number"
          inputMode="decimal"
          step={0.001}
          value={value}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            dispatch({ type: "account/update", id: account.id, patch: { investment: { annualRate: n } } });
          }}
        />
      </div>
      <p className="self-center text-xs text-muted-foreground">月初残高に対して月複利で運用益が自動計算される</p>
    </div>
  );
}

function PropertyEditor({ account }: { account: Account }) {
  const { dispatch } = usePlan();
  const value = account.property?.annualDepreciationRate ?? 0;
  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4 md:grid-cols-[260px_1fr]">
      <div className="grid gap-1.5">
        <Label htmlFor={`prop-${account.id}-rate`}>減価率 年率 (小数)</Label>
        <CommittedInput
          id={`prop-${account.id}-rate`}
          type="number"
          inputMode="decimal"
          step={0.001}
          value={value}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            dispatch({
              type: "account/update",
              id: account.id,
              patch: { property: { annualDepreciationRate: n } },
            });
          }}
        />
      </div>
      <p className="self-center text-xs text-muted-foreground">
        定率法に相当。月初残高に対して月複利で減価が自動計算される
      </p>
    </div>
  );
}

function LiabilityEditor({ account }: { account: Account }) {
  const { plan, dispatch } = usePlan();
  const params: LiabilityParams = account.liability ?? {
    annualRate: 0,
    scheduleKind: "equal-payment",
    principal: 0,
    termMonths: 0,
    startMonth: plan.settings.planStartMonth,
  };
  const cashAccounts = useMemo(() => plan.accounts.filter((a) => a.kind === "cash"), [plan.accounts]);

  const update = (patch: Partial<LiabilityParams>) => {
    dispatch({
      type: "account/update",
      id: account.id,
      patch: { liability: { ...params, ...patch } },
    });
  };

  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4 md:grid-cols-3">
      <div className="grid gap-1.5">
        <Label htmlFor={`li-${account.id}-kind`}>返済方式</Label>
        <Select value={params.scheduleKind} onValueChange={(v) => update({ scheduleKind: v as LiabilityScheduleKind })}>
          <SelectTrigger id={`li-${account.id}-kind`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="equal-payment">元利均等</SelectItem>
            <SelectItem value="equal-principal">元金均等</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`li-${account.id}-rate`}>年利 (小数)</Label>
        <CommittedInput
          id={`li-${account.id}-rate`}
          type="number"
          inputMode="decimal"
          step={0.001}
          value={params.annualRate}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            update({ annualRate: n });
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`li-${account.id}-principal`}>借入元本 (円)</Label>
        <CommittedInput
          id={`li-${account.id}-principal`}
          type="number"
          inputMode="numeric"
          value={params.principal}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isFinite(n)) return;
            update({ principal: n });
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`li-${account.id}-term`}>返済期間 (月)</Label>
        <CommittedInput
          id={`li-${account.id}-term`}
          type="number"
          inputMode="numeric"
          min={1}
          value={params.termMonths}
          onCommit={(v) => {
            const n = Number(v);
            if (!Number.isInteger(n) || n < 0) return;
            update({ termMonths: n });
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`li-${account.id}-start`}>返済開始月</Label>
        <MonthExprInput
          id={`li-${account.id}-start`}
          value={params.startMonth}
          onChange={(v) => {
            if (!v) return;
            update({ startMonth: v });
          }}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={`li-${account.id}-pay`}>支払い口座</Label>
        <Select
          value={params.paymentAccountId ?? NONE_VALUE}
          onValueChange={(v) => update({ paymentAccountId: v === NONE_VALUE ? undefined : (v as Ulid) })}
        >
          <SelectTrigger id={`li-${account.id}-pay`} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE_VALUE}>（未設定）</SelectItem>
            {cashAccounts.map((a) => (
              <SelectItem key={a.id} value={a.id}>
                {a.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
