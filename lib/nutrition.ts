export type Sex = "male" | "female";
export type PhaseKind = "bulk" | "cut" | "maintain";

const KCAL_PER_KG = 7700;

/**
 * Age in whole years as of `onDateStr`, using calendar-date comparison
 * (not elapsed milliseconds) so it matches how people count age.
 */
export function calculateAge(birthDateStr: string, onDateStr: string): number {
  const [by, bm, bd] = birthDateStr.split("-").map(Number);
  const [oy, om, od] = onDateStr.split("-").map(Number);

  let age = oy - by;
  if (om < bm || (om === bm && od < bd)) {
    age -= 1;
  }
  return age;
}

/** Mifflin-St Jeor basal metabolic rate. */
export function calculateBMR(params: { weightKg: number; heightCm: number; age: number; sex: Sex }): number {
  const { weightKg, heightCm, age, sex } = params;
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === "male" ? base + 5 : base - 161;
}

export function calculateTDEE(bmr: number, activityFactor: number): number {
  return bmr * activityFactor;
}

/**
 * Target daily intake calories after phase adjustment.
 * pacePerWeekKg: absolute value is used; sign is implied by `phase`.
 * When omitted, falls back to the phase's default adjustment (+300 bulk / -500 cut).
 */
export function calculateTargetCalories(params: {
  tdee: number;
  phase: PhaseKind;
  pacePerWeekKg?: number | null;
}): number {
  const { tdee, phase, pacePerWeekKg } = params;

  if (phase === "maintain") {
    return tdee;
  }

  if (phase === "bulk") {
    const surplus =
      pacePerWeekKg != null ? Math.min(500, (Math.abs(pacePerWeekKg) * KCAL_PER_KG) / 7) : 300;
    return tdee + surplus;
  }

  // cut
  const deficit =
    pacePerWeekKg != null ? Math.min(750, (Math.abs(pacePerWeekKg) * KCAL_PER_KG) / 7) : 500;
  return tdee - deficit;
}

export interface PFCTargets {
  proteinG: number;
  fatG: number;
  carbsG: number;
}

/** PFC targets in grams, derived from the target calories and body weight. */
export function calculatePFC(params: {
  targetCalories: number;
  weightKg: number;
  proteinPerKg: number;
  fatRatio: number;
}): PFCTargets {
  const { targetCalories, weightKg, proteinPerKg, fatRatio } = params;

  const proteinG = proteinPerKg * weightKg;
  const fatG = (targetCalories * fatRatio) / 9;
  const carbsG = (targetCalories - proteinG * 4 - fatG * 9) / 4;

  return { proteinG, fatG, carbsG };
}

/**
 * The weight used for nutrition calculations: 7-day moving average when available,
 * otherwise the latest single reading.
 */
export function resolveCalculationWeight(recentWeightsKg: number[]): number | null {
  if (recentWeightsKg.length === 0) return null;
  if (recentWeightsKg.length >= 7) {
    const last7 = recentWeightsKg.slice(-7);
    return last7.reduce((a, b) => a + b, 0) / last7.length;
  }
  return recentWeightsKg[recentWeightsKg.length - 1]!;
}

export interface DailyTargets {
  bmr: number;
  tdee: number;
  targetCalories: number;
  pfc: PFCTargets;
}

/** Full target computation pipeline, combining §8's steps. */
export function calculateDailyTargets(params: {
  weightKg: number;
  heightCm: number;
  birthDateStr: string;
  onDateStr: string;
  sex: Sex;
  activityFactor: number;
  phase: PhaseKind;
  pacePerWeekKg?: number | null;
  proteinPerKg: number;
  fatRatio: number;
}): DailyTargets {
  const age = calculateAge(params.birthDateStr, params.onDateStr);
  const bmr = calculateBMR({ weightKg: params.weightKg, heightCm: params.heightCm, age, sex: params.sex });
  const tdee = calculateTDEE(bmr, params.activityFactor);
  const targetCalories = calculateTargetCalories({
    tdee,
    phase: params.phase,
    pacePerWeekKg: params.pacePerWeekKg,
  });
  const pfc = calculatePFC({
    targetCalories,
    weightKg: params.weightKg,
    proteinPerKg: params.proteinPerKg,
    fatRatio: params.fatRatio,
  });

  return { bmr, tdee, targetCalories, pfc };
}
