import { memo, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { SortableList } from "@/components/sortable-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CommittedInput } from "@/components/ui/committed-input";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PercentCommittedInput } from "@/components/ui/percent-committed-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { newId } from "@/lib/dsl/id";
import { ACCOUNT_KIND_LABEL, ACCOUNT_KINDS, type Account, type AccountKind } from "@/lib/dsl/types";
import { type PlanAction, usePlan } from "@/state/plan-store";

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
            <CardDescription>すべてのフローはここを通る。投資口座は年利から運用益が自動計算される</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="口座" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          <div className="grid gap-3 md:grid-cols-[1fr_200px_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="account-label">ラベル</Label>
              <Input
                id="account-label"
                placeholder="普通預金"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
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
                    {isExpanded ? <AccountEditor account={account} dispatch={dispatch} /> : null}
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
  return "";
}

type AccountEditorProps = {
  account: Account;
  dispatch: (action: PlanAction) => void;
};

const AccountEditor = memo(function AccountEditor({ account, dispatch }: AccountEditorProps) {
  const handleKindChange = (next: AccountKind) => {
    if (next === account.kind) return;
    // investment → cash で残っていた investment パラメータは明示的にクリアする
    const patch: Partial<Omit<Account, "id">> =
      next === "investment" ? { kind: next } : { kind: next, investment: undefined };
    dispatch({ type: "account/update", id: account.id, patch });
  };
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
          <Label htmlFor={`acc-${account.id}-kind`}>種別</Label>
          <Select value={account.kind} onValueChange={(v) => handleKindChange(v as AccountKind)}>
            <SelectTrigger id={`acc-${account.id}-kind`} className="w-full">
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
      </div>
      <AccountParamsEditor account={account} />
    </div>
  );
});

function AccountParamsEditor({ account }: { account: Account }) {
  if (account.kind === "investment") return <InvestmentEditor account={account} />;
  return null;
}

function InvestmentEditor({ account }: { account: Account }) {
  const { dispatch } = usePlan();
  const value = account.investment?.annualRate ?? 0;
  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4 md:grid-cols-[260px_1fr]">
      <div className="grid gap-1.5">
        <Label htmlFor={`inv-${account.id}-rate`}>年利 (%)</Label>
        <PercentCommittedInput
          id={`inv-${account.id}-rate`}
          step={0.1}
          value={value}
          onCommit={(ratio) => {
            dispatch({ type: "account/update", id: account.id, patch: { investment: { annualRate: ratio } } });
          }}
        />
      </div>
      <p className="self-center text-xs text-muted-foreground">月初残高に対して月複利で運用益が自動計算される</p>
    </div>
  );
}
