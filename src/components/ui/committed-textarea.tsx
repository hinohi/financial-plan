import * as React from "react";
import { Textarea } from "@/components/ui/textarea";

type Props = Omit<React.ComponentProps<"textarea">, "value" | "onChange" | "defaultValue"> & {
  value: string;
  onCommit: (value: string) => void;
};

/**
 * CommittedInput の textarea 版。入力中はローカル state、blur 時に onCommit を呼ぶ。
 * Enter はそのまま改行として動くので、コミットは blur のみ。
 */
export function CommittedTextarea({ value, onCommit, onBlur, ...rest }: Props) {
  const [draft, setDraft] = React.useState(value);
  const lastExternalRef = React.useRef(value);

  React.useEffect(() => {
    if (value !== lastExternalRef.current) {
      lastExternalRef.current = value;
      setDraft(value);
    }
  }, [value]);

  const commit = () => {
    if (draft === lastExternalRef.current) return;
    lastExternalRef.current = draft;
    onCommit(draft);
  };

  return (
    <Textarea
      {...rest}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        commit();
        onBlur?.(e);
      }}
    />
  );
}
