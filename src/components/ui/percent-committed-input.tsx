import * as React from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue" | "type"> & {
  /** 内部表現の比率。0.03 は 3% を意味する */
  value: number;
  /** 新しい比率を通知する。値が不正なときは呼ばれない */
  onCommit: (ratio: number) => void;
};

/**
 * パーセント入力用の CommittedInput。
 * 内部表現は小数比率 (例: 0.03 = 3%) だが、ユーザーが入出力するのはパーセント値 (3)。
 * blur / Enter 時に比率へ戻して onCommit を呼ぶ。
 */
export function PercentCommittedInput({ value, onCommit, onBlur, onFocus, onKeyDown, ...rest }: Props) {
  const external = ratioToPercentString(value);
  const [draft, setDraft] = React.useState(external);
  const lastExternalRef = React.useRef(external);

  React.useEffect(() => {
    const incoming = ratioToPercentString(value);
    if (incoming !== lastExternalRef.current) {
      lastExternalRef.current = incoming;
      setDraft(incoming);
    }
  }, [value]);

  const commit = () => {
    if (draft === lastExternalRef.current) return;
    const ratio = percentStringToRatio(draft);
    if (ratio === null) {
      // 不正入力は元の値に戻す
      setDraft(lastExternalRef.current);
      return;
    }
    lastExternalRef.current = ratioToPercentString(ratio);
    setDraft(lastExternalRef.current);
    onCommit(ratio);
  };

  return (
    <div className="relative">
      <Input
        {...rest}
        type="number"
        inputMode="decimal"
        value={draft}
        className={`pr-7 ${rest.className ?? ""}`}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => {
          e.currentTarget.select();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          commit();
          onBlur?.(e);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit();
            (e.currentTarget as HTMLInputElement).blur();
          }
          onKeyDown?.(e);
        }}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground">
        %
      </span>
    </div>
  );
}

/** 0.03 → "3"、0.035 → "3.5"。浮動小数の誤差は 10 桁で丸める */
export function ratioToPercentString(ratio: number): string {
  if (!Number.isFinite(ratio)) return "";
  const percent = Number((ratio * 100).toFixed(10));
  return percent.toString();
}

/** "3" → 0.03、"3.5" → 0.035。空文字や非数値は null */
export function percentStringToRatio(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Number((n / 100).toFixed(12));
}
