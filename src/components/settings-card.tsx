import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { isValidYearMonth } from "@/lib/dsl/month";
import type { YearStartMonth } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

const YEAR_START_MONTHS: YearStartMonth[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

export function SettingsCard() {
  const { plan, dispatch } = usePlan();
  const { settings } = plan;

  const handleStart = (value: string) => {
    if (!isValidYearMonth(value)) return;
    dispatch({ type: "settings/update", patch: { planStartMonth: value } });
  };

  const handleEnd = (value: string) => {
    if (!isValidYearMonth(value)) return;
    dispatch({ type: "settings/update", patch: { planEndMonth: value } });
  };

  const handleYearStart = (value: string) => {
    const num = Number(value) as YearStartMonth;
    dispatch({ type: "settings/update", patch: { yearStartMonth: num } });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>設定</CardTitle>
        <CardDescription>プランの期間と年度の区切り月</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="plan-start">開始月</Label>
            <Input
              id="plan-start"
              type="month"
              value={settings.planStartMonth}
              onChange={(e) => handleStart(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="plan-end">終了月</Label>
            <Input
              id="plan-end"
              type="month"
              value={settings.planEndMonth}
              onChange={(e) => handleEnd(e.target.value)}
            />
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
    </Card>
  );
}
