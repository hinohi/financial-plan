import { useEffect, useRef, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCollapse } from "@/hooks/use-collapse";
import { usePlanRegistry } from "@/state/plan-store";

type ImportMode = "new" | "overwrite";

type ShareStatus =
  | { kind: "idle" }
  | { kind: "copied"; url: string }
  | { kind: "ready"; url: string }
  | { kind: "error"; error: string };

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
    buildShareUrl,
    shareImportNotice,
    dismissShareImportNotice,
  } = usePlanRegistry();

  const [newName, setNewName] = useState("");
  const [renameValue, setRenameValue] = useState<string>("");
  const [renaming, setRenaming] = useState<boolean>(false);
  const [importMode, setImportMode] = useState<ImportMode>("new");
  const [importName, setImportName] = useState<string>("");
  const [importError, setImportError] = useState<string | null>(null);
  const [shareStatus, setShareStatus] = useState<ShareStatus>({ kind: "idle" });
  const [sharing, setSharing] = useState(false);
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

  const handleShare = async () => {
    setSharing(true);
    setShareStatus({ kind: "idle" });
    try {
      const result = await buildShareUrl();
      if (!result.ok) {
        setShareStatus({ kind: "error", error: result.error });
        return;
      }
      try {
        await navigator.clipboard.writeText(result.url);
        setShareStatus({ kind: "copied", url: result.url });
      } catch {
        // clipboard 権限が無い / iframe 等でコピーできない場合は URL を表示してユーザーに委ねる。
        setShareStatus({ kind: "ready", url: result.url });
      }
    } finally {
      setSharing(false);
    }
  };

  useEffect(() => {
    if (shareStatus.kind !== "copied") return;
    const timer = setTimeout(() => setShareStatus({ kind: "idle" }), 3000);
    return () => clearTimeout(timer);
  }, [shareStatus]);

  const canDelete = registry.plans.length > 1;
  const [collapsed, toggleCollapsed] = useCollapse("plans");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>プラン</CardTitle>
            <CardDescription>複数のプランを保持・切り替え・エクスポート / インポートできる</CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="プラン" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-4">
          {shareImportNotice ? (
            <div
              className={`flex items-start justify-between gap-3 rounded-md border p-3 text-sm ${
                shareImportNotice.kind === "success"
                  ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300"
                  : "border-destructive/40 bg-destructive/5 text-destructive"
              }`}
            >
              <span>
                {shareImportNotice.kind === "success"
                  ? `共有URLから「${shareImportNotice.planName}」を取り込みました`
                  : `共有URLの読み込みに失敗しました: ${shareImportNotice.error}`}
              </span>
              <Button variant="ghost" size="sm" onClick={dismissShareImportNotice}>
                閉じる
              </Button>
            </div>
          ) : null}
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
            <div className="text-sm font-semibold">共有URL</div>
            <p className="text-xs text-muted-foreground">
              現在のプランを符号化した URL を生成します。URL を知っている相手は全データを閲覧できます。共有先
              (メール、チャット、ブラウザ履歴など) にデータが残る点に注意してください。
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="outline" onClick={handleShare} disabled={sharing}>
                {sharing ? "生成中…" : "共有URLをコピー"}
              </Button>
              {shareStatus.kind === "copied" ? (
                <span className="text-xs text-emerald-600 dark:text-emerald-400">
                  コピーしました ({shareStatus.url.length.toLocaleString()} 文字)
                </span>
              ) : null}
              {shareStatus.kind === "error" ? (
                <span className="text-xs text-destructive">{shareStatus.error}</span>
              ) : null}
            </div>
            {shareStatus.kind === "ready" ? (
              <div className="grid gap-1">
                <Label htmlFor="share-url">共有URL ({shareStatus.url.length.toLocaleString()} 文字)</Label>
                <Input id="share-url" readOnly value={shareStatus.url} onFocus={(e) => e.currentTarget.select()} />
                <p className="text-xs text-muted-foreground">
                  クリップボード API が使えなかったため、手動でコピーしてください。
                </p>
              </div>
            ) : null}
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
      )}
    </Card>
  );
}
