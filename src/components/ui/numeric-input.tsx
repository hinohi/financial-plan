import * as React from "react";
import { Input } from "@/components/ui/input";
import { formatNumericDisplay, stripCommas } from "@/lib/numeric-format";

type Props = Omit<React.ComponentProps<"input">, "value" | "onChange" | "defaultValue" | "type"> & {
  value: string;
  onChange: (raw: string) => void;
};

/**
 * 数値入力欄。focus 中は raw、blur で桁区切りカンマ付き表示に切替。
 * onChange はカンマを除去した raw 値を毎回通知する。
 */
export function NumericInput({ value, onChange, onFocus, onBlur, ...rest }: Props) {
  const [focused, setFocused] = React.useState(false);
  const display = focused ? value : formatNumericDisplay(value);
  return (
    <Input
      type="text"
      inputMode="decimal"
      value={display}
      onChange={(e) => onChange(stripCommas(e.target.value))}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
      {...rest}
    />
  );
}
