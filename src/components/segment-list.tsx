import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMonths, isValidYearMonth } from "@/lib/dsl/month";
import type { FlowRaise, FlowRaiseKind, FlowSegment, YearMonth } from "@/lib/dsl/types";

type SegmentListProps = {
  idPrefix: string;
  segments: FlowSegment[];
  planStart: YearMonth;
  onChange: (next: FlowSegment[]) => void;
};

export function SegmentList({ idPrefix, segments, planStart, onChange }: SegmentListProps) {
  const updateSegment = (index: number, patch: Partial<FlowSegment>) => {
    onChange(segments.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeSegment = (index: number) => {
    onChange(segments.filter((_, i) => i !== index));
  };

  const addSegment = () => {
    const last = segments.at(-1);
    const startMonth: YearMonth = last?.endMonth ? addMonths(last.endMonth, 1) : planStart;
    onChange([...segments, { startMonth, amount: 0 }]);
  };

  return (
    <div className="grid gap-3">
      <ul className="grid gap-3">
        {segments.map((segment, index) => (
          <SegmentRow
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are identified positionally
            key={index}
            idPrefix={`${idPrefix}-${index}`}
            segment={segment}
            onChange={(patch) => updateSegment(index, patch)}
            onRemove={segments.length > 1 ? () => removeSegment(index) : undefined}
          />
        ))}
      </ul>
      <div>
        <Button variant="outline" size="sm" onClick={addSegment}>
          + セグメントを追加
        </Button>
      </div>
    </div>
  );
}

type SegmentRowProps = {
  idPrefix: string;
  segment: FlowSegment;
  onChange: (patch: Partial<FlowSegment>) => void;
  onRemove?: () => void;
};

function SegmentRow({ idPrefix, segment, onChange, onRemove }: SegmentRowProps) {
  const raise = segment.raise;

  const setAmount = (value: string) => {
    if (value === "" || Number.isNaN(Number(value))) return;
    onChange({ amount: Number(value) });
  };

  const setStart = (value: string) => {
    if (isValidYearMonth(value)) onChange({ startMonth: value });
  };

  const setEnd = (value: string) => {
    if (value === "") onChange({ endMonth: undefined });
    else if (isValidYearMonth(value)) onChange({ endMonth: value });
  };

  const toggleRaise = (enabled: boolean) => {
    if (enabled) {
      onChange({ raise: { kind: "rate", value: 0.03, everyMonths: 12 } });
    } else {
      onChange({ raise: undefined });
    }
  };

  const updateRaise = (patch: Partial<FlowRaise>) => {
    if (!raise) return;
    onChange({ raise: { ...raise, ...patch } });
  };

  return (
    <li className="grid gap-3 rounded-md border border-border/70 bg-muted/20 p-3">
      <div className="grid gap-3 md:grid-cols-[160px_160px_1fr_auto] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-start`}>開始月</Label>
          <Input
            id={`${idPrefix}-start`}
            type="month"
            value={segment.startMonth}
            onChange={(e) => setStart(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-end`}>終了月 (任意)</Label>
          <Input
            id={`${idPrefix}-end`}
            type="month"
            value={segment.endMonth ?? ""}
            onChange={(e) => setEnd(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-amount`}>月額 (円)</Label>
          <Input
            id={`${idPrefix}-amount`}
            type="number"
            inputMode="numeric"
            value={segment.amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        {onRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            削除
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">必須</span>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={raise !== undefined}
          onChange={(e) => toggleRaise(e.target.checked)}
        />
        昇給・率変動を設定する
      </label>
      {raise ? (
        <div className="grid gap-3 md:grid-cols-[160px_1fr_1fr] md:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-raise-kind`}>種別</Label>
            <Select value={raise.kind} onValueChange={(v) => updateRaise({ kind: v as FlowRaiseKind })}>
              <SelectTrigger id={`${idPrefix}-raise-kind`} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">固定額</SelectItem>
                <SelectItem value="rate">固定率</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-raise-value`}>値 {raise.kind === "rate" ? "(例: 0.03 → 3%)" : "(円)"}</Label>
            <Input
              id={`${idPrefix}-raise-value`}
              type="number"
              inputMode="decimal"
              step={raise.kind === "rate" ? 0.01 : 1}
              value={raise.value}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (!Number.isNaN(n)) updateRaise({ value: n });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-raise-every`}>間隔 (月)</Label>
            <Input
              id={`${idPrefix}-raise-every`}
              type="number"
              inputMode="numeric"
              min={1}
              value={raise.everyMonths}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1) updateRaise({ everyMonths: n });
              }}
            />
          </div>
        </div>
      ) : null}
    </li>
  );
}
