import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePlanRegistry } from "@/state/plan-store";

type ImportMode = "new" | "overwrite";

export function PlansCard() {
  const {
    registry,
    createPlan,
    selectPlan,
    renamePlan,
    deletePlan,
    exportCurrentPlan,
    importPlanAsNew,
    replaceCurrentPlan,
  } = usePlanRegistry();

  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState<string>("");
  const [renaming, setRenaming] = useState<boolean>(false);
  const [importMode, setImportMode] = useState<ImportMode>("new");
  const [importName, setImportName] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentMeta = registry.plans.find((p) => p.id === registry.currentPlanId);

  const handleExport = () => {
    const json = exportCurrentPlan();
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const fname = `${currentMeta?.name ?? "plan"}-${new Date().toISOString().slice(0, 10)}.json`;
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    setImportError(null);
    const text = await file.text();
    const result =
      importMode === "new"
        ? importPlanAsNew(text, importName || file.name.replace(/\.json$/i, ""))
        : replaceCurrentPlan(text);
    if (!result.ok) setImportError(result.error);
    else setImportName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const startRename = () => {
    setRenameValue(currentMeta?.name ?? "");
    setRenaming(true);
  };

  const confirmRename = () => {
    if (currentMeta) renamePlan(currentMeta.id, renameValue);
    setRenaming(false);
  };

  const handleDelete = () => {
    if (!currentMeta) return;
    if (registry.plans.length <= 1) return;
    if (!confirm(`プラン「${currentMeta.name}」を削除しますか？この操作は取り消せません。`)) return;
    deletePlan(currentMeta.id);
  };

  const canDelete = registry.plans.length > 1;

  return (
    <Card>
      <CardHeader>
        <CardTitle>プラン</CardTitle>
        <CardDescription>複数のプランを保持・切り替え・エクスポート / インポートできる</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto_auto] md:items-end">
          <div className="grid gap-2">
            <Label htmlFor="plan-select">現在のプラン</Label>
            <Select value={registry.currentPlanId} onValueChange={selectPlan}>
              <SelectTrigger id="plan-select" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {registry.plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={startRename}>
            名称変更
          </Button>
          <Button variant="outline" onClick={handleExport}>
            JSON エクスポート
          </Button>
          <Button variant="ghost" onClick={handleDelete} disabled={!canDelete}>
            削除
          </Button>
        </div>
        {renaming ? (
          <div className="grid gap-3 rounded-md border border-dashed bg-muted/10 p-4 md:grid-cols-[1fr_auto_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="plan-rename">新しい名称</Label>
              <Input id="plan-rename" value={renameValue} onChange={(e) => setRenameValue(e.target.value)} />
            </div>
            <Button onClick={confirmRename} disabled={renameValue.trim() === ""}>
              保存
            </Button>
            <Button variant="ghost" onClick={() => setRenaming(false)}>
              キャンセル
            </Button>
          </div>
        ) : null}

        <div className="grid gap-3 rounded-md border bg-muted/10 p-4">
          <div className="text-sm font-semibold">新規プラン</div>
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="plan-new-name">名称</Label>
              <Input
                id="plan-new-name"
                placeholder="マイプラン"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <Button
              onClick={() => {
                createPlan(newName);
                setNewName("");
              }}
              disabled={newName.trim() === ""}
            >
              作成
            </Button>
          </div>
        </div>

        <div className="grid gap-3 rounded-md border bg-muted/10 p-4">
          <div className="text-sm font-semibold">JSON インポート</div>
          <div className="grid gap-3 md:grid-cols-[200px_1fr_auto] md:items-end">
            <div className="grid gap-2">
              <Label htmlFor="import-mode">モード</Label>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as ImportMode)}>
                <SelectTrigger id="import-mode" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">新しいプランとして追加</SelectItem>
                  <SelectItem value="overwrite">現在のプランを上書き</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {importMode === "new" ? (
              <div className="grid gap-2">
                <Label htmlFor="import-name">名称 (任意)</Label>
                <Input
                  id="import-name"
                  placeholder="インポートしたプラン"
                  value={importName}
                  onChange={(e) => setImportName(e.target.value)}
                />
              </div>
            ) : (
              <p className="self-end text-xs text-muted-foreground">
                現在のプラン「{currentMeta?.name}」を読み込んだ JSON の内容で上書きする
              </p>
            )}
            <Button onClick={() => fileInputRef.current?.click()}>ファイル選択</Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleImportFile(f);
            }}
          />
          {importError ? <p className="text-sm text-destructive">{importError}</p> : null}
        </div>

        <p className="text-xs text-muted-foreground">
          最終更新: {currentMeta ? new Date(currentMeta.updatedAt).toLocaleString() : "—"}
        </p>
      </CardContent>
    </Card>
  );
}
