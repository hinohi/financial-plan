import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
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
import {
  type AggregatePeriod,
  aggregateFlow,
  type CategoryGroup,
  SYSTEM_CATEGORY_LABEL,
  UNCATEGORIZED_KEY,
} from "@/lib/aggregate";
import { categoryPath } from "@/lib/categories";
import type { Category, CategoryKind, Ulid } from "@/lib/dsl/types";
import { formatYenCompact } from "@/lib/format";
import { interpret } from "@/lib/interpret";
import { usePlan } from "@/state/plan-store";

type FlowChartProps = {
  kind: CategoryKind;
};

const AGE_OVERLAY_NONE = "__none__";

const CATEGORY_PALETTE = [
  "oklch(0.72 0.14 30)",
  "oklch(0.72 0.14 140)",
  "oklch(0.70 0.14 70)",
  "oklch(0.68 0.16 300)",
  "oklch(0.72 0.12 200)",
  "oklch(0.60 0.16 10)",
  "oklch(0.74 0.12 110)",
  "oklch(0.62 0.18 260)",
  "oklch(0.70 0.14 350)",
  "oklch(0.66 0.14 170)",
];
const UNCATEGORIZED_COLOR = "oklch(0.70 0.02 260)";

const TITLES: Record<CategoryKind, { title: string; description: string }> = {
  income: { title: "収入の内訳", description: "カテゴリ別の積み上げ" },
  expense: { title: "支出の内訳", description: "カテゴリ別の積み上げ" },
};

export function FlowChart({ kind }: FlowChartProps) {
  const { plan } = usePlan();
  const [period, setPeriod] = useState<AggregatePeriod>("yearly");
  const [group, setGroup] = useState<CategoryGroup>("leaf");
  const [agePersonId, setAgePersonId] = useState<Ulid | typeof AGE_OVERLAY_NONE>(AGE_OVERLAY_NONE);

  const viewData = useMemo(() => {
    const entries = interpret(plan);
    return aggregateFlow(plan, entries, { kind, period, group });
  }, [plan, kind, period, group]);

  const byId = useMemo(() => {
    const map = new Map<Ulid, Category>();
    for (const c of plan.categories) map.set(c.id, c);
    return map;
  }, [plan.categories]);

  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {};
    viewData.categoryOrder.forEach((key, idx) => {
      if (key === UNCATEGORIZED_KEY) {
        config[key] = { label: "未分類", color: UNCATEGORIZED_COLOR };
      } else if (SYSTEM_CATEGORY_LABEL[key]) {
        config[key] = {
          label: SYSTEM_CATEGORY_LABEL[key],
          color: CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] ?? UNCATEGORIZED_COLOR,
        };
      } else {
        const category = byId.get(key);
        const label = category ? categoryPath(category, byId) : key;
        const color = CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] ?? UNCATEGORIZED_COLOR;
        config[key] = { label, color };
      }
    });
    return config;
  }, [viewData.categoryOrder, byId]);

  const chartData = useMemo(() => {
    return viewData.points.map((p) => {
      const row: Record<string, number | string> = { period: p.period };
      for (const key of viewData.categoryOrder) {
        row[key] = p.byCategory[key] ?? 0;
      }
      return row;
    });
  }, [viewData]);

  const agePerson = useMemo(
    () => (agePersonId === AGE_OVERLAY_NONE ? null : (plan.persons.find((p) => p.id === agePersonId) ?? null)),
    [plan.persons, agePersonId],
  );
  const ageMap = useMemo(
    () => (agePerson ? buildAgeMap(agePerson.birthMonth, viewData.points) : null),
    [agePerson, viewData.points],
  );
  const xAxisTick = useMemo(() => (ageMap ? createAgeTick(ageMap) : undefined), [ageMap]);

  const title = TITLES[kind];
  const hasData = viewData.categoryOrder.length > 0 && viewData.points.some((p) => p.total !== 0);
  const [collapsed, toggleCollapsed] = useCollapse(`flow-chart-${kind}`);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{title.title}</CardTitle>
            <CardDescription>{title.description}</CardDescription>
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
            <Select value={group} onValueChange={(v) => setGroup(v as CategoryGroup)}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="leaf">詳細カテゴリ</SelectItem>
                <SelectItem value="top">大項目に集約</SelectItem>
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as AggregatePeriod)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">月次</SelectItem>
                <SelectItem value="yearly">年次</SelectItem>
              </SelectContent>
            </Select>
            <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label={title.title} />
          </div>
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent>
          {hasData ? (
            <ChartContainer config={chartConfig} className="h-[320px] w-full">
              <BarChart data={chartData} margin={{ left: 12, right: 12, top: 12, bottom: 12 }}>
                <CartesianGrid vertical={false} />
                <XAxis
                  dataKey="period"
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                  height={xAxisTick ? 48 : 30}
                  tick={xAxisTick}
                />
                <YAxis
                  tickFormatter={(v: number) => formatYenCompact(v)}
                  tickLine={false}
                  axisLine={false}
                  width={72}
                />
                <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
                <ChartLegend content={<ChartLegendContent />} />
                {viewData.categoryOrder.map((key) => (
                  <Bar key={key} dataKey={key} stackId="flow" fill={`var(--color-${key})`} isAnimationActive={false} />
                ))}
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-sm text-muted-foreground">データを追加するとグラフが表示されます。</p>
          )}
        </CardContent>
      )}
    </Card>
  );
}
