import { Redo2, Undo2 } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { usePlan } from "@/state/plan-store";

function isTextEditingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "TEXTAREA") return true;
  if (tag === "INPUT") {
    // type=checkbox / radio / button 等は対象外。それ以外の text 系のみブラウザ標準 undo に譲る。
    const type = (target as HTMLInputElement).type;
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(type);
  }
  return false;
}

export function HistoryControls() {
  const { undo, redo, canUndo, canRedo } = usePlan();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (isTextEditingTarget(e.target)) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === "z" && e.shiftKey) || key === "y") {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!canUndo}
        onClick={undo}
        title="元に戻す (Ctrl+Z)"
        aria-label="元に戻す"
      >
        <Undo2 />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="icon"
        disabled={!canRedo}
        onClick={redo}
        title="やり直し (Ctrl+Shift+Z)"
        aria-label="やり直し"
      >
        <Redo2 />
      </Button>
    </div>
  );
}
