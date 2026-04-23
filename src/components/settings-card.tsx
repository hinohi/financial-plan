import { CollapseToggle } from "@/components/collapse-toggle";
import { MonthExprInput } from "@/components/month-expr-input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import type { MonthExpr, YearStartMonth } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

const YEAR_START_MONTHS: YearStartMonth[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function SettingsCard() {
  const { plan, dispatch } = usePlan();
  const { settings } = plan;

  const handleStart = (value: MonthExpr | undefined) => {
    if (!value) return;
    dispatch({ type: "settings/update", patch: { planStartMonth: value } });
  };

  const handleEnd = (value: MonthExpr | undefined) => {
    if (!value) return;
    dispatch({ type: "settings/update", patch: { planEndMonth: value } });
  };

  const handleYearStart = (value: string) => {
    const num = Number(value) as YearStartMonth;
    dispatch({ type: "settings/update", patch: { yearStartMonth: num } });
  };

  const [collapsed, toggleCollapsed] = useCollapse("settings");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>設定</CardTitle>
            <CardDescription>プランの期間と年度の区切り月</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="設定" />
        </div>
      </CardHeader>
      {collapsed ? null : (
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="plan-start">開始月</Label>
            <MonthExprInput id="plan-start" value={settings.planStartMonth} onChange={handleStart} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-end">終了月</Label>
            <MonthExprInput id="plan-end" value={settings.planEndMonth} onChange={handleEnd} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="year-start">年度開始月</Label>
            <Select value={String(settings.yearStartMonth)} onValueChange={handleYearStart}>
              <SelectTrigger id="year-start" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEAR_START_MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {m}月
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
      )}
    </Card>
  );
}
