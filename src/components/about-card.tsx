import { useCallback, useEffect, useState } from "react";
import { CollapseToggle } from "@/components/collapse-toggle";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STORAGE_KEY = "fp.collapse.about";

// 初回訪問は展開、二回目以降は折り畳みを既定にする。トグル状態は localStorage に永続化する。
function useAboutCollapsed(): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === null) return false;
      return v === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === null) {
        // 今回の表示には影響を与えず、次回訪問のデフォルトだけ折り畳みにする
        window.localStorage.setItem(STORAGE_KEY, "1");
      }
    } catch {
      // ignore
    }
  }, []);
  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        try {
          window.localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
        } catch {
          // ignore
        }
      }
      return next;
    });
  }, []);
  return [collapsed, toggle];
}

export function AboutCard() {
  const [collapsed, toggleCollapsed] = useAboutCollapsed();
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>このツールについて</CardTitle>
            <CardDescription>
              ライフプラン・家計・資産推移・キャッシュフローをブラウザ上で自由にシミュレーションできる無料ツール。教育費、住宅購入、老後資金などのライフイベントも含め、計画開始月時点の残高から未来の予測までを一貫したデータモデルで管理できます。
            </CardDescription>
          </div>
          <CollapseToggle collapsed={collapsed} onToggle={toggleCollapsed} label="このツールについて" />
        </div>
      </CardHeader>
      {collapsed ? null : (
        <CardContent className="grid gap-6 text-sm leading-relaxed">
          <section className="grid gap-2">
            <h2 className="text-base font-semibold">主な特徴</h2>
            <ul className="grid list-disc gap-1 pl-5">
              <li>収入・支出・一時イベント・口座間の振替をまとめて管理し、口座ごとの月次残高推移を自動で計算</li>
              <li>月次を基準に、年次は集計ビューとして表示。1 月始まり／4 月始まりなど年の区切り月は自由に設定可能</li>
              <li>カテゴリによる階層的な集計。細かい登録から大項目でのロールアップまで同じデータで切替可能</li>
              <li>計算・保存はすべてブラウザ内で完結。ユーザーデータは外部サーバーに送信されません</li>
              <li>プランは JSON でエクスポート／インポートでき、複数プランの同時管理・切替に対応</li>
              <li>プラン全体を符号化した共有URLをワンクリックで生成。端末間の引き渡しや他者への共有に利用可能</li>
              <li>編集操作は undo / redo に対応。キーボードショートカット (Ctrl+Z / Ctrl+Shift+Z) でも操作可能</li>
              <li>
                元金・金利・期間を指定したローン計算、昇給ルール、最低残高を割った時の自動振替など家計特有のルールを内包
              </li>
            </ul>
          </section>

          <section className="grid gap-2">
            <h2 className="text-base font-semibold">こんな方におすすめ</h2>
            <ul className="grid list-disc gap-1 pl-5">
              <li>住宅購入・教育費・老後資金を含めた長期のライフプランを自分で組み立てたい方</li>
              <li>家計簿のその先、将来の資産推移を具体的に見通したい方</li>
              <li>Excel や表計算で自作すると手間がかかるため、ブラウザで素早くシミュレーションを試したい方</li>
              <li>複数シナリオ（楽観／標準／悲観）を並行して比較検討したい方</li>
            </ul>
          </section>

          <section className="grid gap-3">
            <h2 className="text-base font-semibold">よくある質問</h2>
            <div className="grid gap-1">
              <h3 className="font-semibold">入力したデータはどこに保存されますか？</h3>
              <p className="text-muted-foreground">
                ブラウザの localStorage
                に保存されます。サーバーには一切アップロードされないため、機微な家計情報も安心して入力できます。
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="font-semibold">無料で使えますか？アカウント登録は必要ですか？</h3>
              <p className="text-muted-foreground">
                完全に無料で、アカウント登録も不要です。ページを開いた瞬間から利用を開始できます。
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="font-semibold">他の端末とデータを同期できますか？</h3>
              <p className="text-muted-foreground">
                自動同期はありませんが、プラン全体を符号化した共有URLをワンクリックで生成できるため、別の端末や他のユーザーに渡すだけで取り込めます。JSON
                ファイルとしてエクスポート／インポートする方法も利用可能です。
              </p>
            </div>
            <div className="grid gap-1">
              <h3 className="font-semibold">何年先までシミュレーションできますか？</h3>
              <p className="text-muted-foreground">
                開始年月と終了年月を自由に設定できるため、現在から老後（40〜50 年先）までを同じモデルで管理できます。
              </p>
            </div>
          </section>
        </CardContent>
      )}
    </Card>
  );
}
