import { MonthExprInput } from "@/components/month-expr-input";
import { Button } from "@/components/ui/button";
import { CommittedInput } from "@/components/ui/committed-input";
import { CommittedTextarea } from "@/components/ui/committed-textarea";
import { Label } from "@/components/ui/label";
import { NumericCommittedInput } from "@/components/ui/numeric-committed-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMonths } from "@/lib/dsl/month";
import type { FlowRaise, FlowRaiseKind, FlowSegment, MonthExpr } from "@/lib/dsl/types";

type SegmentListProps = {
  idPrefix: string;
  segments: FlowSegment[];
  planStart: MonthExpr;
  showInterval?: boolean;
  onChange: (next: FlowSegment[]) => void;
};

function defaultNextStart(prev: FlowSegment | undefined, planStart: MonthExpr): MonthExpr {
  if (prev?.endMonth !== undefined && typeof prev.endMonth === "string") {
    return addMonths(prev.endMonth, 1);
  }
  return planStart;
}

export function SegmentList({ idPrefix, segments, planStart, showInterval, onChange }: SegmentListProps) {
  const updateSegment = (index: number, patch: Partial<FlowSegment>) => {
    onChange(segments.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  };

  const removeSegment = (index: number) => {
    onChange(segments.filter((_, i) => i !== index));
  };

  const addSegment = () => {
    const last = segments.at(-1);
    const startMonth = defaultNextStart(last, planStart);
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
            showInterval={showInterval}
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
  showInterval?: boolean;
  onChange: (patch: Partial<FlowSegment>) => void;
  onRemove?: () => void;
};

function SegmentRow({ idPrefix, segment, showInterval, onChange, onRemove }: SegmentRowProps) {
  const raise = segment.raise;

  const commitAmount = (value: string) => {
    if (value === "" || Number.isNaN(Number(value))) return;
    onChange({ amount: Number(value) });
  };

  const setStart = (value: MonthExpr | undefined) => {
    if (!value) return;
    onChange({ startMonth: value });
  };

  const setEnd = (value: MonthExpr | undefined) => {
    onChange({ endMonth: value });
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
      <div className="grid gap-3 md:grid-cols-[minmax(260px,1fr)_minmax(260px,1fr)_140px_auto] md:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-start`}>開始月</Label>
          <MonthExprInput id={`${idPrefix}-start`} value={segment.startMonth} onChange={setStart} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-end`}>終了月 (任意)</Label>
          <MonthExprInput id={`${idPrefix}-end`} value={segment.endMonth} onChange={setEnd} allowEmpty />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}-amount`}>
            {(segment.intervalMonths ?? 1) > 1 ? "1 回あたりの額 (円)" : "月額 (円)"}
          </Label>
          <NumericCommittedInput id={`${idPrefix}-amount`} value={segment.amount} onCommit={commitAmount} />
        </div>
        {onRemove ? (
          <Button variant="ghost" size="sm" onClick={onRemove}>
            削除
          </Button>
        ) : (
          <span className="text-xs text-muted-foreground">必須</span>
        )}
      </div>
      {showInterval ? (
        <div className="grid gap-3 md:grid-cols-[160px_1fr] md:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-interval`}>N ヶ月ごと</Label>
            <CommittedInput
              id={`${idPrefix}-interval`}
              type="number"
              inputMode="numeric"
              min={1}
              value={segment.intervalMonths ?? 1}
              onCommit={(v) => {
                const n = Number(v);
                if (!Number.isInteger(n) || n < 1) return;
                onChange({ intervalMonths: n === 1 ? undefined : n });
              }}
            />
          </div>
          <p className="self-center text-xs text-muted-foreground">
            {(segment.intervalMonths ?? 1) === 1
              ? "毎月発生 (デフォルト)"
              : `${segment.intervalMonths} ヶ月ごとに発生 (開始月を基準に ${segment.intervalMonths} ヶ月間隔)`}
          </p>
        </div>
      ) : null}
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
            <NumericCommittedInput
              id={`${idPrefix}-raise-value`}
              value={raise.value}
              onCommit={(v) => {
                const n = Number(v);
                if (!Number.isNaN(n)) updateRaise({ value: n });
              }}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idPrefix}-raise-every`}>間隔 (月)</Label>
            <CommittedInput
              id={`${idPrefix}-raise-every`}
              type="number"
              inputMode="numeric"
              min={1}
              value={raise.everyMonths}
              onCommit={(v) => {
                const n = Number(v);
                if (Number.isInteger(n) && n >= 1) updateRaise({ everyMonths: n });
              }}
            />
          </div>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor={`${idPrefix}-note`} className="text-xs text-muted-foreground">
          メモ (任意)
        </Label>
        <CommittedTextarea
          id={`${idPrefix}-note`}
          placeholder="補足・根拠・出典など"
          className="min-h-14 text-sm"
          value={segment.note ?? ""}
          onCommit={(v) => onChange({ note: v.trim() === "" ? undefined : v })}
        />
      </div>
    </li>
  );
}
