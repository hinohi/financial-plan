import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { buildAgeMap, createAgeTick } from "@/components/age-tick";
import { CollapseToggle } from "@/components/collapse-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { type AggregatePeriod, aggregate } from "@/lib/aggregate";
import { formatYenCompact } from "@/lib/format";
import { interpret } from "@/lib/interpret";
import type { Ulid } from "@/lib/dsl/types";
import { usePlan } from "@/state/plan-store";

const AGE_OVERLAY_NONE = "__none__";

const TOTAL_COLOR = "oklch(0.55 0.18 240)";
const ACCOUNT_COLORS = [
  "oklch(0.68 0.14 30)",
  "oklch(0.72 0.14 140)",
  "oklch(0.70 0.14 70)",
  "oklch(0.68 0.16 300)",
  "oklch(0.72 0.12 200)",
  "oklch(0.60 0.16 10)",
];

export function BalanceChart() {
  const { plan } = usePlan();
  const [period, setPeriod] = useState<AggregatePeriod>("yearly");
  const [agePersonId, setAgePersonId] = useState<Ulid | typeof AGE_OVERLAY_NONE>(AGE_OVERLAY_NONE);

  const viewData = useMemo(() => {
    const entries = interpret(plan);
    return aggregate(plan, entries, { period });
  }, [plan, period]);

  const agePerson = useMemo(
    () => (agePersonId === AGE_OVERLAY_NONE ? null : (plan.persons.find((p) => p.id === agePersonId) ?? null)),
    [plan.persons, agePersonId],
  );
  const ageMap = useMemo(
    () => (agePerson ? buildAgeMap(agePerson.birthMonth, viewData.points) : null),
    [agePerson, viewData.points],
  );
  const xAxisTick = useMemo(() => (ageMap ? createAgeTick(ageMap) : undefined), [ageMap]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {
      total: { label: "総資産", color: TOTAL_COLOR },
    };
    plan.accounts.forEach((account, idx) => {
      const color = ACCOUNT_COLORS[idx % ACCOUNT_COLORS.length] ?? TOTAL_COLOR;
      config[account.id] = { label: account.label, color };
    });
    return config;
  }, [plan.accounts]);

  const chartData = useMemo(() => {
    return viewData.points.map((p) => {
      const row: Record<string, number | string> = { period: p.period, total: p.total };
      for (const account of plan.accounts) {
        row[account.id] = p.byAccount[account.id] ?? 0;
      }
      return row;
    });
  }, [viewData, plan.accounts]);

  const hasData = plan.accounts.length > 0 && chartData.length > 0;
  const [collapsed, toggleCollapsed] = useCollapse("balance-chart");

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>総資産推移</CardTitle>
            <CardDescription>口座別および合計の残高</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {plan.persons.length > 0 ? (
              <Select value={agePersonId} onValueChange={(v) => setAgePersonId(v as Ulid | typeof AGE_OVERLAY_NONE)}>
                <SelectTrigger className="w-40" aria-label="年齢重ね表示">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AGE_OVERLAY_NONE}>年齢表示なし</SelectItem>
                  {plan.persons.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}の年齢
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select value={period} onValueChange={(v) => setPeriod(v as AggregatePeriod)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">月次</SelectItem>
                <SelectItem value="yearly">年次</SelectItem>
              </SelectContent>
            </Select>
            <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="総資産推移" />
          </div>
        </div>
      </CardHeader>
      {collapsed ? null : (
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-[360px] w-full">
            <LineChart data={chartData} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="period"
                tickLine={false}
                axisLine={false}
                minTickGap={24}
                height={xAxisTick ? 48 : 30}
                tick={xAxisTick}
              />
              <YAxis tickFormatter={(v: number) => formatYenCompact(v)} tickLine={false} axisLine={false} width={72} />
              <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="total"
                stroke="var(--color-total)"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
              {plan.accounts.map((account) => (
                <Line
                  key={account.id}
                  type="monotone"
                  dataKey={account.id}
                  stroke={`var(--color-${account.id})`}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ChartContainer>
        ) : (
          <p className="text-sm text-muted-foreground">口座を追加するとグラフが表示されます。</p>
        )}
      </CardContent>
      )}
    </Card>
  );
}
