import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { getDaySummary, getProfileAndTargets } from "./db";
import { todayJST } from "./date";
import { tools } from "./tools";

export const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export const MODEL = process.env.CLAUDE_MODEL ?? "claude-opus-4-8";

export const MAX_HISTORY_MESSAGES = 20;
export const MAX_TOOL_ITERATIONS = 8;

// Fixed string so prompt caching applies. Never interpolate dates/values here —
// dynamic context goes into the first user turn instead (see buildContextBlock).
export const SYSTEM_PROMPT = `あなたは日本語で対応するパーソナル栄養・トレーニングコーチです。
ユーザー（kitano）は筋トレをしており、増量期・減量期のサイクルを回しています。あなた以外の利用者はいません。

# 役割
- ユーザーの自由文から食事・運動・体重の記録を読み取り、対応するツールで保存する
- 記録後は、その日の残り目標（残りkcal・残りタンパク質など）を踏まえた簡潔なフィードバック（2〜3文）を返す
- 「明日何を食べればいいか」のような相談には、get_recent_daysで直近の実績を確認してから、手持ちの食材で具体的な量を提案する。週単位の帳尻合わせ（前日オーバー分を今日絞る、など）も考慮する

# 食事推定の方針
- 日本の一般的な食品成分（文部科学省食品成分表ベースの知識）で推定する。「1合=炊飯後約330g」など日本の単位・慣習に対応する
- 同じ入力には同じ推定を返す一貫性を重視する。不確かな幅がある場合は中央値で記録し、幅がある旨を一言添える
- **量（グラム数・個数・合数など）が入力から分からない場合は、絶対に当て推量で記録しない。必ず聞き返す**。量以外（部位・調理法など）の不足情報は、推定誤差が±30%を超えそうなときだけ聞き返し、細かすぎる質問はしない
- 記録系の入力を受け取ったら、曖昧さが許容範囲内である限り必ず対応するツールを呼ぶ。呼ばずに終わらせない。聞き返すときはツールを呼ばない

# 食事の追加 vs 修正・削除の判断（重要）
- 同じmeal_slot（例: lunch）に既に記録があっても、新しい入力は基本的に**別の新しい食事として log_meal で追加**する。1回の食事を複数回に分けて記録する、間食を後から追加する、といった状況は普通に起こる
- update_meal / delete_meal を使うのは、ユーザーが明示的に既存の記録を指して訂正・削除を求めたとき**だけ**（例:「さっきの昼飯、米は0.5合だったわ」「さっき言った分は間違いで」「昼ごはんの記録消して」）。そうした明示的な言及がない限り、既存の記録を消したり上書きしたりしてはいけない
- get_day_summaryなどで同じmeal_slotの記録が既にあるのを見つけても、それだけを理由に重複とみなして削除・統合しない
- 「さっきの記録した？」「これ記録済み？」のように記録状況を確認されたら、会話履歴の記憶だけで判断せず、必ずget_day_summaryまたはget_recent_daysを呼んでDBの実際の状態を確認してから答える。確認せずに「まだ記録してない」と判断してlog_mealなどを呼ぶと重複記録になるため注意する

# 運動記録の方針
- METs基準で消費カロリーを推定する。体重は最新の記録値を使う
- 筋トレは種目・時間から概算する。厳密さより一貫性を優先し、同じ入力には同じ推定を返す

# その他
- 日付は全てAsia/Tokyo基準で解釈する（「今日」「昨日」「今朝」など）
- 目標値（目標カロリー・PFC）はコード側で決定論的に計算されるため、あなた自身で計算し直さない。必ずget_day_summaryやget_profile_and_targetsが返す値を使う
- 医療アドバイスはしない。極端な減量ペース（週体重の1%を超える）を求められたら健康リスクを説明し、慎重に扱う
- 初回でプロフィールが未設定の場合は、チャットで身長・生年月日・性別・活動レベル・現在のフェーズと目標・トレーニング頻度を聞き取り、update_profileとset_phaseで保存する`;

interface DaySummaryLike {
  intakeKcal: number;
  intakeProteinG: number;
  intakeFatG: number;
  intakeCarbsG: number;
  burnedKcal: number;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
  remainingKcal: number;
}

function round(n: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function formatDaySummary(s: DaySummaryLike): string {
  return [
    `摂取: ${round(s.intakeKcal)}kcal (P${round(s.intakeProteinG, 1)}/F${round(s.intakeFatG, 1)}/C${round(s.intakeCarbsG, 1)})`,
    `運動消費: ${round(s.burnedKcal)}kcal`,
    `目標: ${round(s.targetKcal)}kcal (P${round(s.targetProteinG, 1)}/F${round(s.targetFatG, 1)}/C${round(s.targetCarbsG, 1)})`,
    `残りkcal: ${round(s.remainingKcal)}`,
  ].join(" / ");
}

/**
 * Dynamic per-request context (today's date, targets, today's progress).
 * Injected into the first user turn's content rather than the system prompt,
 * so the system prompt stays a fixed string and prompt caching stays effective.
 */
export async function buildContextBlock(): Promise<string> {
  const today = todayJST();
  const [{ profile, phase, targets }, todaySummary] = await Promise.all([
    getProfileAndTargets(),
    getDaySummary(today),
  ]);

  const lines = [`[参考情報。会話の一部ではない] 本日の日付(JST): ${today}`];

  if (!profile) {
    lines.push("プロフィール未設定。オンボーディングとして身長・生年月日・性別・活動レベル・フェーズを聞き取ること。");
  } else {
    lines.push(`現在のフェーズ: ${phase?.kind ?? "未設定"}`);
    if (targets) {
      lines.push(`本日の目標: ${round(targets.targetKcal)}kcal (P${round(targets.proteinG, 1)}/F${round(targets.fatG, 1)}/C${round(targets.carbsG, 1)})`);
    }
    lines.push(`本日の実績: ${formatDaySummary(todaySummary)}`);
  }

  return lines.join("\n");
}

export { tools };
