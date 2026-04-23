import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  collapsed: boolean;
  onToggle: () => void;
  label?: string;
};

export function CollapseToggle({ collapsed, onToggle, label }: Props) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onToggle}
      aria-label={collapsed ? `${label ?? ""}を開く` : `${label ?? ""}を閉じる`}
      className="size-8 px-0"
    >
      {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
    </Button>
  );
}
