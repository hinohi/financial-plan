/**
 * ビルド時に呼ばれる prerender エントリ。
 * App を空プランの状態でレンダリングし、index.html の root マーカーへ注入する。
 */

import { renderToStaticMarkup } from "react-dom/server";
import { emptyPlan } from "@/lib/dsl/plan";
import { PlanProvider } from "@/state/plan-store";
import { App } from "./App";

// ビルド出力を日付に依存させないための固定基準日
const PRERENDER_NOW = new Date("2026-01-01T00:00:00.000Z");

export function prerender(): string {
  const plan = emptyPlan(PRERENDER_NOW);
  return renderToStaticMarkup(
    <PlanProvider initialPlan={plan}>
      <App />
    </PlanProvider>,
  );
}
