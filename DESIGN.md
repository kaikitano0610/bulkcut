# BulkCut — 増量・減量支援アプリ 設計書

> **この文書を読む実装AIへ**: これは実装のための完全な設計書です。「§12 実装フェーズ計画」の順に作業してください。技術判断はこの設計書を正とし、逸脱する場合は理由をユーザーに説明して承認を得ること。ユーザー（kitano）は手を動かしません。人間の作業が必要な箇所は「§13 人間がやる一回きりの作業」に限定されています。

---

## 1. 概要

筋トレの増量期・減量期をサポートする自分専用アプリ。核となる体験は**自由文入力**:

- 「お昼に米を1合と、鶏胸肉を300gとブロッコリーを6切れ食べた」
  → LLMがカロリー・タンパク質・脂質・炭水化物を推定して記録し、その日の目標に対するフィードバックを返す
- 「明日の朝ごはん卵と納豆と豆腐があるんだけど、どれぐらい食べたらいいかな」
  → 直近の摂取実績と目標を踏まえて具体的な量をアドバイスする
- 「今日ベンチプレスとランニング30分やった」
  → 消費カロリーを推定して記録する
- 「今朝の体重65.2kg」
  → 体重を記録する

情報が足りないとき（例:「肉を食べた」→ 種類と量が不明）はLLMが聞き返す。

### ユーザーコンテキスト

- 利用者は本人のみ（kitano、1ユーザー固定）
- 2026年6月まで増量期、2026年7月から減量期に移行する
- スマホからの利用が主。PWAとしてホーム画面に追加して使う

## 2. 技術選定

| 項目 | 選定 | 理由 |
|---|---|---|
| フロント/バック | **Next.js (App Router) + TypeScript** | Vercel無料枠にそのままデプロイ可能。APIルートでサーバーサイドにClaude API呼び出しを閉じ込められる |
| DB | **Supabase (Postgres)** | 食事・運動・体重・日次集計はリレーショナルデータで、週次集計などSQLが必要。Firebase(Firestore)は集計クエリが弱くこの用途に不向き。無料枠: 500MB DB・50K MAU で個人利用には十分。CLI/Management APIが充実しておりClaude Codeによる全自動セットアップが可能 |
| ホスティング | **Vercel** (無料 Hobby プラン) | Next.jsとの相性が最良。代替のCloudflare Pages/Netlifyも可だが、Next.jsのAPIルート+ストリーミングはVercelが最も枯れている |
| LLM | **Claude API** (`@anthropic-ai/sdk`) | モデルは環境変数 `CLAUDE_MODEL` で切替可能にする。デフォルト `claude-opus-4-8`（コスト重視なら `claude-sonnet-4-6` / `claude-haiku-4-5` に変更可 — §14 コスト参照） |
| グラフ | **Recharts** | 体重推移・PFCの可視化。軽量で実績十分 |
| 認証 | 固定パスワード + httpOnly署名Cookie | 1ユーザーなのでアカウント機能は不要（§9） |

**注意（実装AI向け）**: Claude APIの呼び出しは必ずサーバーサイド（APIルート）のみ。`ANTHROPIC_API_KEY` をクライアントに露出させない。Supabaseへのアクセスも全てサーバーサイドから `SERVICE_ROLE_KEY` で行い、anon keyでのクライアント直アクセスは使わない（RLS設計を丸ごと省略できる）。

## 3. 機能仕様

### 3.1 初期設定（オンボーディング）

初回アクセス時、チャットで対話的にプロフィールを設定する（フォームではなくチャットで完結させる。`update_profile` ツール経由で保存）:

- 身長・体重・生年月日・性別
- 活動レベル（デスクワーク中心/立ち仕事/など → 活動係数にマップ）
- 現在のフェーズ（増量/減量/維持）と目標（目標体重、ペース kg/週）
- トレーニング頻度

### 3.2 目標値の自動計算（§8 の式でコード側で決定論的に計算）

- BMR（基礎代謝）→ TDEE（総消費カロリー）→ フェーズ補正後の目標摂取カロリー
- PFC目標: タンパク質 g、脂質 g、炭水化物 g
- 体重が更新されるたびに再計算。ダッシュボードとLLMコンテキストの両方で使う

### 3.3 食事記録（自由文 → 構造化）

- LLMが食品ごとに `{name, amount, kcal, protein_g, fat_g, carbs_g}` を推定し `log_meal` ツールで保存
- 推定に必要な情報が足りない場合はツールを呼ばずに聞き返す（例: 「鶏肉ってもも？胸？皮あり？」「何グラムぐらい？」）
- 記録後、その日の残り目標（残りkcal、残りタンパク質など）と一言フィードバックを返す
- 過去の食事の修正・削除も自由文で（「さっきの昼飯、米は0.5合だったわ」→ `update_meal`）

### 3.4 運動記録（自由文 → 消費カロリー推定）

- METs基準でLLMが消費カロリーを推定し `log_exercise` で保存。体重は最新の記録値を使う
- 筋トレは種目・時間から概算（厳密さより一貫性を優先。同じ入力には同じ推定を返すようシステムプロンプトで指示）

### 3.5 体重記録

- 「今朝65.2kg」のような自由文で `log_weight`。同日重複は上書き
- ダッシュボードに7日移動平均付きの推移グラフ。フェーズ目標ペース（例: -0.5kg/週）との乖離を表示

### 3.6 未来のアドバイス（プランニング）

- 「明日の朝何食べればいい？」系の質問には、`get_recent_days`（直近7日の摂取実績）+ 当日の残り目標をコンテキストに、手持ち食材の中から具体的な量を提案
- 週単位の帳尻合わせも考慮（例: 昨日オーバーした分を今日少し絞る提案）

### 3.7 フェーズ管理

- 「今日から減量期にする」→ `set_phase` で切替。目標カロリーが自動で再計算される
- フェーズ履歴は保持し、ダッシュボードのグラフに増量期/減量期の区間を色分け表示

## 4. 画面構成（モバイルファースト・PWA）

3タブ構成。下部タブバー。

1. **チャット**（メイン・初期表示）
   - LINE風のチャットUI。ストリーミング表示（SSE）
   - 記録が保存されたら吹き出し内に構造化カード（食品名・kcal・PFCの小さな表）を表示
   - 画面上部に当日のサマリーバー（摂取kcal / 目標kcal、P/F/C進捗バー）を常時表示
2. **ダッシュボード**
   - 体重推移グラフ（7日移動平均、フェーズ区間の色分け、目標ペース線）
   - 週間のカロリー収支（摂取 − TDEE − 運動）棒グラフ
   - PFC達成率の週間ヒートマップ
   - 当日の食事・運動一覧（タップで削除可）
3. **設定**
   - プロフィール編集、フェーズ・目標変更（チャットでも可能だがUIも用意）
   - 使用モデルの表示

PWA要件: `manifest.json`（name, icons 192/512, `display: "standalone"`, `theme_color`）、iOS用 `apple-touch-icon`。Service Workerは最小限（オフライン対応は不要、ホーム画面追加が目的）。

## 5. アーキテクチャ

```
[ブラウザ/PWA]
   │  fetch (SSE)
   ▼
[Next.js API Routes (Vercel)]
   ├─ POST /api/chat        … 認証チェック → エージェントループ（下記）→ SSEで応答
   ├─ GET  /api/dashboard   … 集計データ（グラフ用）
   ├─ POST /api/login       … パスワード検証 → 署名Cookie発行
   └─ (その他 CRUD は原則チャット経由。削除だけ REST を用意)
   │
   ├──▶ Claude API (@anthropic-ai/sdk, tool use ループ)
   └──▶ Supabase Postgres (service role key, サーバーのみ)
```

### /api/chat のエージェントループ

1. 直近の会話履歴（最大20メッセージ）+ 当日サマリー + プロフィール/目標をコンテキストに組み立て
2. `client.beta.messages.toolRunner()`（TypeScript SDKのツールランナー、betaZodTool でツール定義）でループ実行
3. ツール（§7）はサーバー内で直接Supabaseを叩く
4. テキスト応答はSSEでクライアントへストリーミング
5. 会話は `chat_messages` に保存（ツール呼び出し結果の要約含む）

**コンテキスト管理**: 履歴は直近20メッセージまで。それより古い文脈は不要（記録データはDBにあり、ツールで参照できるため）。システムプロンプトは固定文字列にして prompt caching を効かせる（動的情報 = 当日サマリー等は messages 側の先頭 user ターンに入れる。system に日時を埋め込まない）。

## 6. DBスキーマ

```sql
-- プロフィール（1行のみ）
create table profile (
  id int primary key default 1 check (id = 1),
  height_cm numeric not null,
  birth_date date not null,
  sex text not null check (sex in ('male', 'female')),
  activity_factor numeric not null default 1.5,  -- 1.2〜1.9
  protein_per_kg numeric not null default 2.0,   -- g/kg 体重
  fat_ratio numeric not null default 0.22,       -- 摂取kcalに占める脂質割合
  updated_at timestamptz not null default now()
);

-- フェーズ履歴
create table phases (
  id bigint generated always as identity primary key,
  kind text not null check (kind in ('bulk', 'cut', 'maintain')),
  started_on date not null,
  ended_on date,                      -- null = 現行フェーズ
  target_weight_kg numeric,
  pace_kg_per_week numeric,           -- 増量なら正、減量なら負
  created_at timestamptz not null default now()
);

-- 体重
create table weight_logs (
  logged_on date primary key,         -- 1日1件、上書き
  weight_kg numeric not null,
  created_at timestamptz not null default now()
);

-- 食事
create table meals (
  id bigint generated always as identity primary key,
  eaten_on date not null,
  meal_slot text not null check (meal_slot in ('breakfast','lunch','dinner','snack')),
  raw_input text not null,            -- ユーザーの元の自由文
  items jsonb not null,               -- [{name, amount, kcal, protein_g, fat_g, carbs_g}]
  total_kcal numeric not null,
  total_protein_g numeric not null,
  total_fat_g numeric not null,
  total_carbs_g numeric not null,
  created_at timestamptz not null default now()
);
create index on meals (eaten_on);

-- 運動
create table exercise_logs (
  id bigint generated always as identity primary key,
  done_on date not null,
  raw_input text not null,
  description text not null,          -- 正規化した内容 例: "ベンチプレス 60kg 5x5 + ランニング30分"
  kcal_burned numeric not null,
  created_at timestamptz not null default now()
);
create index on exercise_logs (done_on);

-- チャット履歴
create table chat_messages (
  id bigint generated always as identity primary key,
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz not null default now()
);
```

日付は全て **Asia/Tokyo** 基準で解釈する（サーバーでの `new Date()` → JST変換を徹底。「昨日」「今朝」の解釈もJST）。

## 7. LLM設計

### 7.1 モデルと呼び出し

```ts
// サーバー専用モジュール
const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";
// thinking: {type: "adaptive"}, max_tokens: 4096（ストリーミング）
// システムプロンプトに cache_control: {type: "ephemeral"} を付与
```

- SDK: `@anthropic-ai/sdk`（最新版）。ツールは `betaZodTool` + `client.beta.messages.toolRunner({..., stream: true})`
- `temperature` 等のサンプリングパラメータは**送らない**（Opus 4.8/Fable 5では400エラー）
- ツール入力は必ずパース済みオブジェクトとして扱う（生文字列マッチ禁止）

### 7.2 ツール定義（全てZodスキーマで定義、サーバー内でSupabaseを操作）

| ツール名 | 役割 | 主な入力 |
|---|---|---|
| `log_meal` | 食事を記録 | eaten_on, meal_slot, items[], raw_input |
| `update_meal` / `delete_meal` | 直近の食事の修正・削除 | meal_id, items[] |
| `log_exercise` | 運動を記録 | done_on, description, kcal_burned, raw_input |
| `log_weight` | 体重を記録 | logged_on, weight_kg |
| `get_day_summary` | 指定日の摂取/消費/残り目標 | date |
| `get_recent_days` | 直近N日のサマリー配列 | days (≤14) |
| `get_profile_and_targets` | プロフィール・現行フェーズ・目標PFC | — |
| `update_profile` | プロフィール更新（目標値は自動再計算） | height_cm, sex, ... |
| `set_phase` | フェーズ切替 | kind, target_weight_kg, pace_kg_per_week |

設計方針: **栄養素の推定はLLM、目標値の計算はコード**。`get_day_summary` 等が返す目標値は§8の式による決定論的計算値であり、LLMに計算させない。

### 7.3 システムプロンプト骨子（実装時に肉付けする）

- 役割: 日本語のパーソナル栄養・トレーニングコーチ。ユーザーは筋トレをしていて増量/減量サイクルを回している
- 食事推定: 日本の一般的な食品成分（文部科学省食品成分表ベースの知識）で推定。「1合=炊飯後約330g」等の日本の単位に対応。**同じ入力には同じ推定**を返す一貫性を重視。不確かな幅がある場合は中央値で記録し、幅を一言添える
- 聞き返し: 推定誤差が±30%を超えそうな不足情報（肉の部位、調理法、量）があるときだけ聞き返す。細かすぎる質問はしない（UX優先）
- 記録時は必ず対応するツールを呼ぶ。呼んだ後、当日の残り目標に対する簡潔なフィードバック（2〜3文）を返す
- 未来の相談には `get_recent_days` を参照してから答える
- 医療アドバイスはしない。極端な減量ペース（>1%体重/週）を求められたら健康リスクを説明する

### 7.4 コストガードレール

- 履歴は直近20メッセージに制限
- `max_tokens: 4096`
- システムプロンプト固定 + prompt caching
- ツール結果は必要最小限のJSON（日次サマリーは丸めた数値のみ）

## 8. 栄養計算ロジック（コード実装、`lib/nutrition.ts`）

```
BMR (Mifflin-St Jeor):
  男性: 10×体重kg + 6.25×身長cm − 5×年齢 + 5
  女性: 10×体重kg + 6.25×身長cm − 5×年齢 − 161

TDEE = BMR × activity_factor

目標摂取カロリー:
  増量: TDEE + min(500, pace_kg_per_week × 7700 / 7)   # デフォルト +300
  減量: TDEE − min(750, |pace_kg_per_week| × 7700 / 7) # デフォルト −500
  維持: TDEE

PFC:
  タンパク質 = protein_per_kg × 最新体重kg (g)
  脂質 = 目標kcal × fat_ratio / 9 (g)
  炭水化物 = (目標kcal − タンパク質×4 − 脂質×9) / 4 (g)
```

体重は直近7日の移動平均があればそれを、なければ最新値を使う。

## 9. 認証・セキュリティ

- `POST /api/login`: `APP_PASSWORD`（環境変数）と照合 → 一致したら `jose` で署名したJWTを httpOnly / Secure / SameSite=Lax Cookie に90日で発行
- Next.js middleware で `/api/*`（login除く）と全ページを保護。未認証はログイン画面へ
- ブルートフォース対策として login に簡易レートリミット（同一IPで5回失敗→10分ロック。Vercel KVは使わずメモリ+指数バックオフで簡易に）
- `ANTHROPIC_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` / `APP_PASSWORD` / `AUTH_SECRET` は全てVercelの環境変数（サーバーのみ）。`NEXT_PUBLIC_` プレフィックスは一切使わない

## 10. 環境変数

| 変数 | 用途 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `CLAUDE_MODEL` | 省略時 `claude-opus-4-8` |
| `SUPABASE_URL` | SupabaseプロジェクトURL |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバーサイドDBアクセス |
| `APP_PASSWORD` | ログインパスワード |
| `AUTH_SECRET` | Cookie署名用（32byte以上のランダム文字列を生成して設定） |

## 11. リポジトリ構成

```
bulkcut/
├─ DESIGN.md                    # 本書
├─ app/
│  ├─ (auth)/login/page.tsx
│  ├─ page.tsx                  # チャット
│  ├─ dashboard/page.tsx
│  ├─ settings/page.tsx
│  └─ api/
│     ├─ chat/route.ts          # エージェントループ + SSE
│     ├─ dashboard/route.ts
│     ├─ login/route.ts
│     └─ meals/[id]/route.ts    # DELETE のみ
├─ lib/
│  ├─ claude.ts                 # クライアント・システムプロンプト・ループ
│  ├─ tools.ts                  # betaZodTool 定義群
│  ├─ nutrition.ts              # §8 の計算（純関数・ユニットテスト対象）
│  ├─ db.ts                     # Supabaseクライアント（server-only）
│  └─ auth.ts                   # JWT発行/検証
├─ supabase/migrations/0001_init.sql
├─ middleware.ts
├─ public/manifest.json, icons/
└─ e2e/  (Playwright 最小スモーク)
```

## 12. 実装フェーズ計画（Claude Codeが実行）

各フェーズ末尾の**検証**を通過してから次へ進むこと。

**Phase 0 — セットアップ**
- `npx create-next-app@latest bulkcut --typescript --app --tailwind`
- Supabase: ユーザーから受け取った Access Token で `supabase` CLI（`npx supabase`）にログイン → `supabase projects create bulkcut --region ap-northeast-1` → DB URL / service role key を取得。Supabase公式MCPサーバーが接続済みならそちらでも可
- マイグレーション適用（§6のSQL）
- 検証: `supabase db ...` またはREST経由で全テーブルの存在確認

**Phase 1 — 栄養計算 + DB層**
- `lib/nutrition.ts`（純関数）+ Vitestでユニットテスト（境界値: 年齢計算、フェーズ補正の上限）
- `lib/db.ts` のCRUD関数
- 検証: `npm test` 全パス

**Phase 2 — エージェントループ**
- `lib/tools.ts` / `lib/claude.ts` / `POST /api/chat`（SSE）
- 検証: curlでのシナリオテスト（実APIキー使用）:
  1. 食事入力→ meals にレコードが入り、フィードバックが返る
  2. 曖昧入力（「肉食べた」）→ ツールを呼ばず聞き返す
  3. 「明日の朝〜」→ get_recent_days が呼ばれ具体量の提案が返る
  4. 体重・運動入力の記録

**Phase 3 — UI**
- ログイン、チャット（ストリーミング+記録カード+サマリーバー）、ダッシュボード、設定、PWA manifest
- 検証: `npm run build` 成功 + Playwrightスモーク（ログイン→メッセージ送信→応答表示）。可能ならブラウザプレビューでスクリーンショット確認

**Phase 4 — デプロイ**
- ユーザーから受け取った Vercel Token で `vercel` CLI → プロジェクト作成 → §10の環境変数を `vercel env add` で設定 → `vercel --prod`
- 検証: 本番URLでログイン→食事記録→ダッシュボード反映のE2E確認。スマホでのPWA追加手順をユーザーに案内

**Phase 5 — 初期データ投入**
- ユーザーに身長等をチャット（本番アプリ上）で登録してもらうよう案内。増量期(〜2026-06)の履歴は不要、2026-07からの減量フェーズを初期フェーズとして案内

## 13. 人間がやる一回きりの作業

実装開始前にユーザーが用意するもの（Claude Codeが冒頭で案内すること）:

1. **Anthropic APIキー** — console.anthropic.com で発行（済みとのこと）
2. **Supabaseアカウント + Access Token** — supabase.com にGitHub等でサインアップ → Account Settings > Access Tokens で発行
3. **Vercelアカウント + Token** — vercel.com にサインアップ → Settings > Tokens で発行
4. 好きなログインパスワードを決める

以上4点を渡せば、残りは全てClaude Codeが実行する。

## 14. コスト見積もり

| 項目 | 月額目安 |
|---|---|
| Vercel Hobby / Supabase Free | ¥0 |
| Claude API — `claude-opus-4-8` ($5/$25 per MTok) | 1日10往復想定で ¥1,500〜4,000 |
| Claude API — `claude-sonnet-4-6` ($3/$15) | ¥900〜2,500 |
| Claude API — `claude-haiku-4-5` ($1/$5) | ¥300〜800 |

食事推定の精度はモデル間で差が出うる。**まずopusで精度を確認し、十分ならenv変数でsonnet/haikuに下げる**運用を推奨（`CLAUDE_MODEL` の変更+再デプロイのみで切替可能）。prompt caching により実コストは上記より下がる見込み。

## 15. 将来拡張（初期実装しない）

- 食事写真からの推定（Claude vision対応）
- 朝のリマインダー（Vercel Cron + Web Push）
- 週次レポートの自動生成
- 停滞期（2週間体重変化なし）の自動検知とダイエットブレイク提案
