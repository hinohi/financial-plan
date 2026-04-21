import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
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
import { type AggregatePeriod, aggregate } from "@/lib/aggregate";
import { formatYenCompact } from "@/lib/format";
import { interpret } from "@/lib/interpret";
import { usePlan } from "@/state/plan-store";

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

  const viewData = useMemo(() => {
    const entries = interpret(plan);
    return aggregate(plan, entries, { period });
  }, [plan, period]);

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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>総資産推移</CardTitle>
            <CardDescription>口座別および合計の残高</CardDescription>
          </div>
          <Select value={period} onValueChange={(v) => setPeriod(v as AggregatePeriod)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">月次</SelectItem>
              <SelectItem value="yearly">年次</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ChartContainer config={chartConfig} className="h-[360px] w-full">
            <LineChart data={chartData} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="period" tickLine={false} axisLine={false} minTickGap={24} />
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
    </Card>
  );
}
