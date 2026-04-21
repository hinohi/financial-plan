# FP

ファイナンシャルプランを作成し管理するツール。

過去の資産断面と、断面間のフロー（収入・支出）を登録することで、過去の実績から未来の予測までを **一貫したモデル** としてプランニングできる。計算はすべてブラウザ内で完結し、データはローカルに保持する。

## 設計原則

以下は「特徴」でもあり、実装上の制約でもある。

- **過去から未来への一貫性**: 過去の資産断面（事実）と、断面間のフロー（実績・予測）を同じデータモデルで扱う。過去と未来に別ロジックを持ち込まない。
- **月次を正、年次は集計ビュー**: 内部計算はすべて月単位。年単位の表示は集計の結果であり、別データ源を持たない。年の区切り月（1月/4月/9月 など）は設定で切り替える。
- **項目の階層的な見え方**: 収入・支出は細かく登録でき、カテゴリでロールアップして大項目で見ることもできる。細かい値と粗い値は別データではなく同じデータの集計粒度違い。
- **ローカル完結**: バックエンドを持たない。データは `localStorage` に保持し、完全な状態を JSON として export / import できる。
- **純関数パイプライン**: `DSL (事実) → インタプリタ (月次展開) → 集計 → ビュー` という一方向の純関数パイプライン。DSL が唯一の永続データ源であり、それ以外はすべて派生物として毎回再計算する。

## アーキテクチャ

```
 ┌──────────────┐
 │    Plan      │  DSL: 人間の意図を表現する唯一の永続データ
 │  (JSON DSL)  │
 └──────┬───────┘
        │ interpret(plan, currentMonth)
        ▼
 ┌──────────────┐
 │ MonthlyEntry │  月次展開: (month, accountId, categoryId, amount) の平坦な列
 │      [ ]     │
 └──────┬───────┘
        │ aggregate(rows, { period, group })
        ▼
 ┌──────────────┐
 │   ViewData   │  集計済み: グラフ・表が直接食える形
 └──────┬───────┘
        │
        ▼
     React UI
```

- **インタプリタは純関数**: `Date.now()` 等を内部で参照せず、「現在月」は引数で注入する。決定性とテスタビリティのため。
- **集計は独立したレイヤ**: 集計粒度（月/年）と集計キー（口座/カテゴリ/全体）の組み合わせで ViewData が決まる。UI は ViewData を表示するだけ。
- **再計算は毎回全量**: 50 年 × 12 = 600 行程度なので最適化は不要。差分更新は入れない。

## データモデル

### 中核エンティティ

| エンティティ | 役割 |
| --- | --- |
| `Plan` | ルート。すべての永続データを束ねる。`schemaVersion` を持ち、将来のマイグレーションに備える |
| `Account` | 資産口座。現金・投資・不動産・負債など。すべてのフローは口座を通る |
| `Snapshot` | ある月時点の口座残高の **事実**。過去実績の入力点であり、フロー積算の検算基準にもなる |
| `Income` | 収入フロー。`segments[]` で期間を区切り、昇給・転職・育休等を表現する |
| `Expense` | 支出フロー。構造は `Income` と対称 |
| `OneShotEvent` | 単発イベント（住宅購入・車買替・大学進学費など）。フローでもストックでもない「点」 |
| `Category` | カテゴリ階層。Income/Expense/Event は `categoryId` で参照する |

### id と label を分ける

すべてのエンティティは不変の `id`（ULID）と表示用の `label` を分離して持つ。DSL 内の参照は常に `id` 経由。ユーザがラベルを変更しても参照は壊れない。

### 型の骨格

```ts
type YearMonth = `${number}-${number}`; // "2026-04"
type Ulid = string;

type Plan = {
  schemaVersion: 1;
  settings: {
    yearStartMonth: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
    planStartMonth: YearMonth;
    planEndMonth: YearMonth;
  };
  accounts: Account[];
  snapshots: Snapshot[];
  incomes: Income[];
  expenses: Expense[];
  events: OneShotEvent[];
  categories: Category[];
};

type Account = {
  id: Ulid;
  label: string;
  kind: "cash" | "investment" | "property" | "liability";
  // kind 固有のパラメータ (運用利率・返済スケジュール等) は後続フェーズで拡張
};

type Snapshot = {
  id: Ulid;
  accountId: Ulid;
  month: YearMonth;
  balance: number;
};

type Income = {
  id: Ulid;
  label: string;
  categoryId: Ulid;
  accountId: Ulid;         // 入金先
  segments: FlowSegment[];
};

type Expense = {
  id: Ulid;
  label: string;
  categoryId: Ulid;
  accountId: Ulid;         // 出金元
  segments: FlowSegment[];
};

type FlowSegment = {
  startMonth: YearMonth;
  endMonth?: YearMonth;    // 省略時は plan 終端まで
  amount: number;
  amountKind: "net" | "gross"; // MVP は "net" のみ扱う
  raise?: {
    kind: "fixed" | "rate";
    value: number;
    everyMonths: number;
  };
};

type OneShotEvent = {
  id: Ulid;
  label: string;
  categoryId: Ulid;
  accountId: Ulid;
  month: YearMonth;
  amount: number;          // 正負で収入/支出を表す
};

type Category = {
  id: Ulid;
  label: string;
  parentId?: Ulid;         // 階層はツリーで表現
  kind: "income" | "expense" | "event";
};
```

### インタプリタの出力

```ts
type MonthlyEntry = {
  month: YearMonth;
  accountId: Ulid;
  categoryId: Ulid;
  sourceId: Ulid;          // Income/Expense/Event/Snapshot の id
  sourceKind: "income" | "expense" | "event" | "snapshot";
  amount: number;          // 収入は +, 支出は -
};
```

`Snapshot` は「その月時点の残高」として特別扱い（フロー積算のベースライン）、他はフローとして加算される。

## ディレクトリ構成（想定）

```
src/
├── components/
│   ├── ui/          shadcn 生成物 (biome 対象外)
│   └── ...          アプリ固有のコンポーネント
├── lib/
│   ├── utils.ts     shadcn の cn ヘルパ
│   ├── dsl/         Plan 型・バリデーション・マイグレーション
│   ├── interpret/   DSL → MonthlyEntry[] の純関数
│   ├── aggregate/   MonthlyEntry[] → ViewData の純関数
│   └── storage/     localStorage / JSON import・export
├── state/           zustand などでの UI 状態
├── App.tsx
├── frontend.tsx
├── index.html
├── index.ts         bun serve エントリ
└── index.css
```

## MVP ロードマップ

段階を分けて実装する。各段階は動くものを優先し、後段の機能のために前段を抽象化しすぎない。

### Phase 1: 骨格 + 手取りベースの単純プラン
- `Plan`・`Account`・`Snapshot`・`Income`・`Expense` の最小構造
- フローは `amountKind: "net"` 固定・`raise` なし・単一 segment
- インタプリタ: `segments` を素直に月展開、`Snapshot` を残高基準とした残高推移計算
- UI: 設定・入力フォーム、月次/年次の総資産推移グラフ（Recharts）、項目一覧
- 永続化: `localStorage` のみ
- 目的: パイプラインが end-to-end で動くことを確認する

### Phase 2: 複数 segment と単発イベント
- `FlowSegment.raise`（固定額/固定率）対応
- 複数 segment（昇給・育休・転職の表現）
- `OneShotEvent` 追加
- アカウント間の振替

### Phase 3: カテゴリ階層と集計ビュー
- `Category` ツリー
- ロールアップ集計（詳細 ⇄ 大項目のトグル）
- 積み上げグラフ（収入/支出の内訳）

### Phase 4: 口座種別固有ロジック
- `investment`: 年利による運用益の自動計算
- `liability`: 返済スケジュール（元利均等・元金均等）
- `property`: 減価・評価額の取り扱い

### Phase 5: JSON export / import
- `schemaVersion` によるマイグレーション
- 完全なプランのダウンロード・アップロード

### Phase 6: 額面入力と税モデル
- `amountKind: "gross"` を受け入れ、税・社会保険料を概算
- 日本の所得税・住民税・社会保険料の簡易モデル

### Phase 7 以降（検討中）
- 複数シナリオ（楽観/標準/悲観）
- インフレ調整（名目値 ⇄ 実質値）
- 断面とフローの整合性検算（過去断面の齟齬警告）

## 技術スタック

- ランタイム/バンドラ: [Bun](https://bun.com)
- UI: React 19 + TypeScript
- スタイル: Tailwind CSS v4 + [shadcn/ui](https://ui.shadcn.com) (New York / neutral)
- グラフ: [Recharts](https://recharts.org/)（shadcn の `Chart` 経由）
- Lint/Format: [Biome](https://biomejs.dev)

## 開発

### セットアップ

```bash
bun install
```

### コマンド

```bash
bun dev         # 開発サーバ (hot reload)
bun start       # 本番モードで起動
bun run build   # 静的ビルド (dist/ に出力)
bun test        # 純関数パイプライン (dsl/interpret/aggregate/reducer) のユニットテスト
bun run lint    # biome check (読み取りのみ)
bun run lint:fix# biome check --write (自動修正)
bun run format  # biome format --write
```

### 新しい shadcn コンポーネントの追加

```bash
bunx --bun shadcn@latest add <component> --overwrite --yes
```

生成物 (`src/components/ui/`) は Biome の対象外になっている。手で編集するより再生成が原則。
