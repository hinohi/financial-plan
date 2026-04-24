import { MonthExprInput } from "@/components/month-expr-input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NumericCommittedInput } from "@/components/ui/numeric-committed-input";
import { PercentCommittedInput } from "@/components/ui/percent-committed-input";
import { addMonths } from "@/lib/dsl/month";
import type { LoanRateSegment, LoanSpec, MonthExpr } from "@/lib/dsl/types";

type LoanEditorProps = {
  idPrefix: string;
  loan: LoanSpec;
  planStart: MonthExpr;
  onChange: (next: LoanSpec) => void;
};

function defaultNextStart(prev: LoanRateSegment | undefined, planStart: MonthExpr): MonthExpr {
  if (prev?.endMonth !== undefined && typeof prev.endMonth === "string") {
    return addMonths(prev.endMonth, 1);
  }
  return planStart;
}

export function LoanEditor({ idPrefix, loan, planStart, onChange }: LoanEditorProps) {
  const update = (patch: Partial<LoanSpec>) => onChange({ ...loan, ...patch });

  const updateRateSegment = (index: number, patch: Partial<LoanRateSegment>) => {
    update({
      rateSegments: loan.rateSegments.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  };

  const addRateSegment = () => {
    const last = loan.rateSegments.at(-1);
    const startMonth = defaultNextStart(last, planStart);
    update({ rateSegments: [...loan.rateSegments, { startMonth, annualRate: 0 }] });
  };

  const removeRateSegment = (index: number) => {
    update({ rateSegments: loan.rateSegments.filter((_, i) => i !== index) });
  };

  return (
    <div className="grid gap-3 rounded-md border border-dashed bg-muted/5 p-4">
      <div className="grid gap-3 md:grid-cols-[260px_1fr] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-principal`}>借入元本 (円)</Label>
          <NumericCommittedInput
            id={`${idPrefix}-principal`}
            value={loan.principal}
            onCommit={(v) => {
              const n = Number(v);
              if (!Number.isFinite(n) || n < 0) return;
              update({ principal: n });
            }}
          />
        </div>
        <p className="self-center text-xs text-muted-foreground">
          毎月の返済額は元利均等で自動計算される。金利セグメントの最後の終了月がローン全体の終了月になる。
        </p>
      </div>
      <div className="grid gap-2">
        <Label className="text-sm">金利セグメント</Label>
        <ul className="grid gap-2">
          {loan.rateSegments.map((seg, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: segments are identified positionally
              key={index}
              className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 md:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_140px_auto] md:items-end"
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`${idPrefix}-rate-${index}-start`}>開始月</Label>
                <MonthExprInput
                  id={`${idPrefix}-rate-${index}-start`}
                  value={seg.startMonth}
                  onChange={(v) => {
                    if (!v) return;
                    updateRateSegment(index, { startMonth: v });
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${idPrefix}-rate-${index}-end`}>
                  終了月 {index === loan.rateSegments.length - 1 ? "(ローン終了)" : "(任意)"}
                </Label>
                <MonthExprInput
                  id={`${idPrefix}-rate-${index}-end`}
                  value={seg.endMonth}
                  onChange={(v) => updateRateSegment(index, { endMonth: v })}
                  allowEmpty
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${idPrefix}-rate-${index}-rate`}>年利 (%)</Label>
                <PercentCommittedInput
                  id={`${idPrefix}-rate-${index}-rate`}
                  step={0.1}
                  value={seg.annualRate}
                  onCommit={(ratio) => updateRateSegment(index, { annualRate: ratio })}
                />
              </div>
              {loan.rateSegments.length > 1 ? (
                <Button variant="ghost" size="sm" onClick={() => removeRateSegment(index)}>
                  削除
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">必須</span>
              )}
            </li>
          ))}
        </ul>
        <div>
          <Button variant="outline" size="sm" onClick={addRateSegment}>
            + 金利セグメントを追加
          </Button>
        </div>
      </div>
    </div>
  );
}
