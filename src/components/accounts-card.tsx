import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { newId } from "@/lib/dsl/id";
import { ACCOUNT_KIND_LABEL, ACCOUNT_KINDS, type AccountKind } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

export function AccountsCard() {
  const { plan, dispatch } = usePlan();
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<AccountKind>("cash");

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
        <CardTitle>口座</CardTitle>
        <CardDescription>すべてのフローはここを通る</CardDescription>
      </CardHeader>
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
          <ul className="divide-y rounded-md border">
            {plan.accounts.map((account) => (
              <li key={account.id} className="flex items-center justify-between gap-4 px-4 py-2">
                <div className="grid">
                  <span className="font-medium">{account.label}</span>
                  <span className="text-xs text-muted-foreground">{ACCOUNT_KIND_LABEL[account.kind]}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => dispatch({ type: "account/remove", id: account.id })}>
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
