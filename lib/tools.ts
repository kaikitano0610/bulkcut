import "server-only";
import { z } from "zod";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  deleteMeal,
  getDaySummary,
  getProfileAndTargets,
  getRecentDays,
  logExercise,
  logMeal,
  setPhase,
  updateMeal,
  upsertProfile,
  upsertWeightLog,
  type MealItem,
} from "./db";

function round(n: number, decimals = 0): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD形式（JST基準）で指定してください");

const mealItemSchema = z.object({
  name: z.string().describe("食品名"),
  amount: z.string().describe("量の表記。例: '150g', '1合', '6切れ'"),
  kcal: z.number().describe("推定カロリー(kcal)"),
  protein_g: z.number().describe("推定タンパク質(g)"),
  fat_g: z.number().describe("推定脂質(g)"),
  carbs_g: z.number().describe("推定炭水化物(g)"),
});

function toMealItems(items: z.infer<typeof mealItemSchema>[]): MealItem[] {
  return items.map((i) => ({
    name: i.name,
    amount: i.amount,
    kcal: i.kcal,
    proteinG: i.protein_g,
    fatG: i.fat_g,
    carbsG: i.carbs_g,
  }));
}

function roundedMealResult(meal: {
  id: number;
  totalKcal: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbsG: number;
}) {
  return {
    meal_id: meal.id,
    total_kcal: round(meal.totalKcal),
    total_protein_g: round(meal.totalProteinG, 1),
    total_fat_g: round(meal.totalFatG, 1),
    total_carbs_g: round(meal.totalCarbsG, 1),
  };
}

export const logMealTool = betaZodTool({
  name: "log_meal",
  description:
    "食事を記録する。食品ごとにname/amount/kcal/protein_g/fat_g/carbs_gを推定して渡すこと。同じmeal_slotに既に記録があっても、ユーザーが訂正だと明示していない限り新しい食事として追加でこれを呼ぶ（既存の記録を消す必要はない）。記録後、その日の残り目標を確認するにはget_day_summaryを使う。",
  inputSchema: z.object({
    eaten_on: dateSchema.describe("食べた日 (JST)"),
    meal_slot: z.enum(["breakfast", "lunch", "dinner", "snack"]),
    raw_input: z.string().describe("ユーザーの元の発言"),
    items: z.array(mealItemSchema).min(1),
  }),
  run: async (args) => {
    const meal = await logMeal({
      eatenOn: args.eaten_on,
      mealSlot: args.meal_slot,
      rawInput: args.raw_input,
      items: toMealItems(args.items),
    });
    return JSON.stringify(roundedMealResult(meal));
  },
});

export const updateMealTool = betaZodTool({
  name: "update_meal",
  description:
    "既に記録済みの食事の内容を修正する。品目全体を渡し直すこと（差分ではなく置き換え）。ユーザーが明示的にその記録の訂正を求めたときだけ使うこと。同じmeal_slotの新しい食事を追加したいだけならlog_mealを使う。",
  inputSchema: z.object({
    meal_id: z.number().int(),
    items: z.array(mealItemSchema).min(1),
  }),
  run: async (args) => {
    const meal = await updateMeal(args.meal_id, toMealItems(args.items));
    return JSON.stringify(roundedMealResult(meal));
  },
});

export const deleteMealTool = betaZodTool({
  name: "delete_meal",
  description: "記録済みの食事を削除する。ユーザーが明示的にその記録の削除を求めたときだけ使うこと。",
  inputSchema: z.object({ meal_id: z.number().int() }),
  run: async (args) => {
    await deleteMeal(args.meal_id);
    return JSON.stringify({ deleted: true, meal_id: args.meal_id });
  },
});

export const logExerciseTool = betaZodTool({
  name: "log_exercise",
  description:
    "運動を記録する。METs基準で消費カロリーを推定すること。同じ内容には同じ推定を返す一貫性を重視する。",
  inputSchema: z.object({
    done_on: dateSchema.describe("運動した日 (JST)"),
    description: z.string().describe("正規化した内容。例: 'ベンチプレス 60kg 5x5 + ランニング30分'"),
    kcal_burned: z.number().describe("推定消費カロリー(kcal)"),
    raw_input: z.string().describe("ユーザーの元の発言"),
  }),
  run: async (args) => {
    const log = await logExercise({
      doneOn: args.done_on,
      rawInput: args.raw_input,
      description: args.description,
      kcalBurned: args.kcal_burned,
    });
    return JSON.stringify({ exercise_id: log.id, kcal_burned: round(log.kcalBurned) });
  },
});

export const logWeightTool = betaZodTool({
  name: "log_weight",
  description: "体重を記録する。同じ日にすでに記録があれば上書きする。",
  inputSchema: z.object({
    logged_on: dateSchema.describe("計測日 (JST)"),
    weight_kg: z.number(),
  }),
  run: async (args) => {
    const w = await upsertWeightLog(args.logged_on, args.weight_kg);
    return JSON.stringify({ logged_on: w.loggedOn, weight_kg: w.weightKg });
  },
});

export const getDaySummaryTool = betaZodTool({
  name: "get_day_summary",
  description: "指定日の摂取カロリー/PFC・運動消費・目標に対する残りを取得する。",
  inputSchema: z.object({ date: dateSchema }),
  run: async (args) => {
    const s = await getDaySummary(args.date);
    return JSON.stringify({
      date: s.date,
      intake: {
        kcal: round(s.intakeKcal),
        protein_g: round(s.intakeProteinG, 1),
        fat_g: round(s.intakeFatG, 1),
        carbs_g: round(s.intakeCarbsG, 1),
      },
      burned_kcal: round(s.burnedKcal),
      target: {
        kcal: round(s.targetKcal),
        protein_g: round(s.targetProteinG, 1),
        fat_g: round(s.targetFatG, 1),
        carbs_g: round(s.targetCarbsG, 1),
      },
      remaining: {
        kcal: round(s.remainingKcal),
        protein_g: round(s.remainingProteinG, 1),
        fat_g: round(s.remainingFatG, 1),
        carbs_g: round(s.remainingCarbsG, 1),
      },
      meals: s.meals.map((m) => ({
        id: m.id,
        meal_slot: m.mealSlot,
        items: m.items.map((i) => ({ name: i.name, amount: i.amount, kcal: round(i.kcal) })),
        total_kcal: round(m.totalKcal),
      })),
      exercises: s.exercises.map((e) => ({
        id: e.id,
        description: e.description,
        kcal_burned: round(e.kcalBurned),
      })),
    });
  },
});

export const getRecentDaysTool = betaZodTool({
  name: "get_recent_days",
  description: "直近N日分の日次サマリー（摂取/消費/目標/残り）を取得する。未来の献立提案や週次の帳尻合わせの検討に使う。",
  inputSchema: z.object({ days: z.number().int().min(1).max(14) }),
  run: async (args) => {
    const days = await getRecentDays(args.days);
    return JSON.stringify(
      days.map((d) => ({
        date: d.date,
        intake_kcal: round(d.intakeKcal),
        protein_g: round(d.intakeProteinG, 1),
        fat_g: round(d.intakeFatG, 1),
        carbs_g: round(d.intakeCarbsG, 1),
        burned_kcal: round(d.burnedKcal),
        target_kcal: round(d.targetKcal),
        remaining_kcal: round(d.remainingKcal),
      })),
    );
  },
});

export const getProfileAndTargetsTool = betaZodTool({
  name: "get_profile_and_targets",
  description: "プロフィール・現行フェーズ・現在の目標PFCを取得する。",
  inputSchema: z.object({}),
  run: async () => {
    const { profile, phase, targets } = await getProfileAndTargets();
    return JSON.stringify({
      profile: profile
        ? {
            height_cm: profile.heightCm,
            birth_date: profile.birthDate,
            sex: profile.sex,
            activity_factor: profile.activityFactor,
            protein_per_kg: profile.proteinPerKg,
            fat_ratio: profile.fatRatio,
          }
        : null,
      phase: phase
        ? {
            kind: phase.kind,
            started_on: phase.startedOn,
            target_weight_kg: phase.targetWeightKg,
            pace_kg_per_week: phase.paceKgPerWeek,
          }
        : null,
      targets: targets
        ? {
            kcal: round(targets.targetKcal),
            protein_g: round(targets.proteinG, 1),
            fat_g: round(targets.fatG, 1),
            carbs_g: round(targets.carbsG, 1),
            bmr: round(targets.bmr),
            tdee: round(targets.tdee),
          }
        : null,
    });
  },
});

export const updateProfileTool = betaZodTool({
  name: "update_profile",
  description: "プロフィールを作成・更新する。渡した項目のみ更新され、他は保持される。目標値は自動で再計算される。",
  inputSchema: z.object({
    height_cm: z.number().optional(),
    birth_date: dateSchema.optional(),
    sex: z.enum(["male", "female"]).optional(),
    activity_factor: z.number().min(1.2).max(1.9).optional().describe("活動係数。デスクワーク中心=1.3〜1.5、立ち仕事=1.6〜1.7、高強度=1.8〜1.9目安"),
    protein_per_kg: z.number().optional().describe("体重1kgあたりの目標タンパク質g。デフォルト2.0"),
    fat_ratio: z.number().min(0).max(1).optional().describe("摂取kcalに占める脂質割合。デフォルト0.22"),
  }),
  run: async (args) => {
    const p = await upsertProfile({
      heightCm: args.height_cm,
      birthDate: args.birth_date,
      sex: args.sex,
      activityFactor: args.activity_factor,
      proteinPerKg: args.protein_per_kg,
      fatRatio: args.fat_ratio,
    });
    return JSON.stringify({
      height_cm: p.heightCm,
      birth_date: p.birthDate,
      sex: p.sex,
      activity_factor: p.activityFactor,
      protein_per_kg: p.proteinPerKg,
      fat_ratio: p.fatRatio,
    });
  },
});

export const setPhaseTool = betaZodTool({
  name: "set_phase",
  description: "増量/減量/維持のフェーズを切り替える。現行フェーズは自動的に終了扱いになる。目標カロリーは自動で再計算される。",
  inputSchema: z.object({
    kind: z.enum(["bulk", "cut", "maintain"]),
    started_on: dateSchema.optional().describe("省略時は今日(JST)"),
    target_weight_kg: z.number().optional(),
    pace_kg_per_week: z.number().optional().describe("絶対値で指定。増量/減量の方向はkindで決まる"),
  }),
  run: async (args) => {
    const phase = await setPhase({
      kind: args.kind,
      startedOn: args.started_on,
      targetWeightKg: args.target_weight_kg,
      paceKgPerWeek: args.pace_kg_per_week,
    });
    return JSON.stringify({
      kind: phase.kind,
      started_on: phase.startedOn,
      target_weight_kg: phase.targetWeightKg,
      pace_kg_per_week: phase.paceKgPerWeek,
    });
  },
});

export const tools = [
  logMealTool,
  updateMealTool,
  deleteMealTool,
  logExerciseTool,
  logWeightTool,
  getDaySummaryTool,
  getRecentDaysTool,
  getProfileAndTargetsTool,
  updateProfileTool,
  setPhaseTool,
];
