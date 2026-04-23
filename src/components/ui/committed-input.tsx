import * as React from "react";
import { Input } from "@/components/ui/input";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue"> & {
  value: string | number;
  onCommit: (value: string) => void;
};

/**
 * 入力中は内部 state、blur / Enter 時にのみ onCommit を呼ぶ Input。
 * 外から value が変わったら内部 state を同期する。
 * 重い再計算をトリガーするフィールド（Plan の label / 数値）に使うと、タイピング中のカクつきを抑えられる。
 */
export function CommittedInput({ value, onCommit, onBlur, onKeyDown, ...rest }: Props) {
  const [draft, setDraft] = React.useState(String(value));
  const lastExternalRef = React.useRef(String(value));

  React.useEffect(() => {
    const incoming = String(value);
    if (incoming !== lastExternalRef.current) {
      lastExternalRef.current = incoming;
      setDraft(incoming);
    }
  }, [value]);

  const commit = () => {
    if (draft === lastExternalRef.current) return;
    lastExternalRef.current = draft;
    onCommit(draft);
  };

  return (
    <Input
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
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
  );
}
