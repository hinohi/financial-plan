import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumericDisplay, stripCommas } from "@/lib/numeric-format";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue" | "type"> & {
  value: number | string;
  onCommit: (raw: string) => void;
};

/**
 * CommittedInput の数値版。focus 中は raw、blur 時に桁区切り表示。
 * 外部の value が変わったら draft を同期、blur / Enter で onCommit(raw string) を呼ぶ。
 */
export function NumericCommittedInput({ value, onCommit, onFocus, onBlur, onKeyDown, ...rest }: Props) {
  const initial = String(value ?? "");
  const [draft, setDraft] = React.useState(initial);
  const [focused, setFocused] = React.useState(false);
  const lastExternalRef = React.useRef(initial);

  React.useEffect(() => {
    const incoming = String(value ?? "");
    if (incoming !== lastExternalRef.current) {
      lastExternalRef.current = incoming;
      setDraft(incoming);
    }
  }, [value]);

  const commit = () => {
    const cleaned = stripCommas(draft);
    if (cleaned === lastExternalRef.current) return;
    lastExternalRef.current = cleaned;
    onCommit(cleaned);
  };

  const display = focused ? draft : formatNumericDisplay(draft);

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => setDraft(stripCommas(e.target.value))}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
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
      {...rest}
    />
  );
}
