import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addMonths, isValidYearMonth } from "@/lib/dsl/month";
import type { LoanRateSegment, LoanSpec, YearMonth } from "@/lib/dsl/types";

type LoanEditorProps = {
  idPrefix: string;
  loan: LoanSpec;
  planStart: YearMonth;
  onChange: (next: LoanSpec) => void;
};

export function LoanEditor({ idPrefix, loan, planStart, onChange }: LoanEditorProps) {
  const update = (patch: Partial<LoanSpec>) => onChange({ ...loan, ...patch });

  const updateRateSegment = (index: number, patch: Partial<LoanRateSegment>) => {
    update({
      rateSegments: loan.rateSegments.map((s, i) => (i === index ? { ...s, ...patch } : s)),
    });
  };

  const addRateSegment = () => {
    const last = loan.rateSegments.at(-1);
    const startMonth: YearMonth = last?.endMonth ? addMonths(last.endMonth, 1) : planStart;
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
          <Input
            id={`${idPrefix}-principal`}
            type="number"
            inputMode="numeric"
            value={loan.principal}
            onChange={(e) => {
              const n = Number(e.target.value);
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
              className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3 md:grid-cols-[160px_160px_1fr_auto] md:items-end"
            >
              <div className="grid gap-1.5">
                <Label htmlFor={`${idPrefix}-rate-${index}-start`}>開始月</Label>
                <Input
                  id={`${idPrefix}-rate-${index}-start`}
                  type="month"
                  value={seg.startMonth}
                  onChange={(e) => {
                    if (isValidYearMonth(e.target.value)) updateRateSegment(index, { startMonth: e.target.value });
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${idPrefix}-rate-${index}-end`}>
                  終了月 {index === loan.rateSegments.length - 1 ? "(ローン終了)" : "(任意)"}
                </Label>
                <Input
                  id={`${idPrefix}-rate-${index}-end`}
                  type="month"
                  value={seg.endMonth ?? ""}
                  onChange={(e) => {
                    if (e.target.value === "") updateRateSegment(index, { endMonth: undefined });
                    else if (isValidYearMonth(e.target.value)) updateRateSegment(index, { endMonth: e.target.value });
                  }}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${idPrefix}-rate-${index}-rate`}>年利 (小数: 0.01 = 1%)</Label>
                <Input
                  id={`${idPrefix}-rate-${index}-rate`}
                  type="number"
                  inputMode="decimal"
                  step={0.001}
                  value={seg.annualRate}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isFinite(n)) return;
                    updateRateSegment(index, { annualRate: n });
                  }}
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
