import type { SVGProps } from "react";
import { parseYearMonth } from "@/lib/dsl/month";
import type { YearMonth } from "@/lib/dsl/types";

export function computeAge(birthMonth: YearMonth, atMonth: YearMonth): number {
  const { year: by, month: bm } = parseYearMonth(birthMonth);
  const { year: ay, month: am } = parseYearMonth(atMonth);
  let age = ay - by;
  if (am < bm) age -= 1;
  return age;
}

export function buildAgeMap(
  birthMonth: YearMonth,
  points: { period: string; month: YearMonth }[],
): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of points) map.set(p.period, computeAge(birthMonth, p.month));
  return map;
}

type TickProps = {
  x?: string | number;
  y?: string | number;
  payload?: { value?: string | number };
  textAnchor?: SVGProps<SVGTextElement>["textAnchor"];
};

export function createAgeTick(ageMap: Map<string, number>) {
  return function AgeTick({ x = 0, y = 0, payload, textAnchor = "middle" }: TickProps) {
    const period = String(payload?.value ?? "");
    const age = ageMap.get(period);
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor={textAnchor} fill="currentColor" fontSize={12}>
          <tspan x={0} dy="0.71em">
            {period}
          </tspan>
          {age !== undefined ? (
            <tspan x={0} dy="1.2em" fontSize={10} fillOpacity={0.7}>
              {age}歳
            </tspan>
          ) : null}
        </text>
      </g>
    );
  };
}
