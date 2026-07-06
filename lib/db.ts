import "server-only";
import { supabase } from "./supabase";
import { addDays, recentDateStrings, todayJST } from "./date";
import { calculateDailyTargets, resolveCalculationWeight, type PFCTargets, type Sex, type PhaseKind } from "./nutrition";

export type { Sex, PhaseKind };
export type MealSlot = "breakfast" | "lunch" | "dinner" | "snack";

export interface Profile {
  heightCm: number;
  birthDate: string;
  sex: Sex;
  activityFactor: number;
  proteinPerKg: number;
  fatRatio: number;
  updatedAt: string;
}

export interface ProfileInput {
  heightCm: number;
  birthDate: string;
  sex: Sex;
  activityFactor?: number;
  proteinPerKg?: number;
  fatRatio?: number;
}

export interface Phase {
  id: number;
  kind: PhaseKind;
  startedOn: string;
  endedOn: string | null;
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
}

export interface MealItem {
  name: string;
  amount: string;
  kcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
}

export interface Meal {
  id: number;
  eatenOn: string;
  mealSlot: MealSlot;
  rawInput: string;
  items: MealItem[];
  totalKcal: number;
  totalProteinG: number;
  totalFatG: number;
  totalCarbsG: number;
}

export interface LogMealInput {
  eatenOn: string;
  mealSlot: MealSlot;
  rawInput: string;
  items: MealItem[];
}

export interface ExerciseLog {
  id: number;
  doneOn: string;
  rawInput: string;
  description: string;
  kcalBurned: number;
}

export interface LogExerciseInput {
  doneOn: string;
  rawInput: string;
  description: string;
  kcalBurned: number;
}

export interface WeightLog {
  loggedOn: string;
  weightKg: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface DaySummary {
  date: string;
  intakeKcal: number;
  intakeProteinG: number;
  intakeFatG: number;
  intakeCarbsG: number;
  burnedKcal: number;
  tdee: number;
  targetKcal: number;
  targetProteinG: number;
  targetFatG: number;
  targetCarbsG: number;
  remainingKcal: number;
  remainingProteinG: number;
  remainingFatG: number;
  remainingCarbsG: number;
  meals: Meal[];
  exercises: ExerciseLog[];
}

// ---------- row <-> domain mapping ----------

function mapProfile(row: any): Profile {
  return {
    heightCm: Number(row.height_cm),
    birthDate: row.birth_date,
    sex: row.sex,
    activityFactor: Number(row.activity_factor),
    proteinPerKg: Number(row.protein_per_kg),
    fatRatio: Number(row.fat_ratio),
    updatedAt: row.updated_at,
  };
}

function mapPhase(row: any): Phase {
  return {
    id: row.id,
    kind: row.kind,
    startedOn: row.started_on,
    endedOn: row.ended_on,
    targetWeightKg: row.target_weight_kg != null ? Number(row.target_weight_kg) : null,
    paceKgPerWeek: row.pace_kg_per_week != null ? Number(row.pace_kg_per_week) : null,
  };
}

function toDbMealItem(item: MealItem) {
  return {
    name: item.name,
    amount: item.amount,
    kcal: item.kcal,
    protein_g: item.proteinG,
    fat_g: item.fatG,
    carbs_g: item.carbsG,
  };
}

function fromDbMealItem(row: any): MealItem {
  return {
    name: row.name,
    amount: row.amount,
    kcal: Number(row.kcal),
    proteinG: Number(row.protein_g),
    fatG: Number(row.fat_g),
    carbsG: Number(row.carbs_g),
  };
}

function mapMeal(row: any): Meal {
  return {
    id: row.id,
    eatenOn: row.eaten_on,
    mealSlot: row.meal_slot,
    rawInput: row.raw_input,
    items: (row.items ?? []).map(fromDbMealItem),
    totalKcal: Number(row.total_kcal),
    totalProteinG: Number(row.total_protein_g),
    totalFatG: Number(row.total_fat_g),
    totalCarbsG: Number(row.total_carbs_g),
  };
}

function mapExerciseLog(row: any): ExerciseLog {
  return {
    id: row.id,
    doneOn: row.done_on,
    rawInput: row.raw_input,
    description: row.description,
    kcalBurned: Number(row.kcal_burned),
  };
}

function mapWeightLog(row: any): WeightLog {
  return { loggedOn: row.logged_on, weightKg: Number(row.weight_kg) };
}

function mapChatMessage(row: any): ChatMessage {
  return { role: row.role, content: row.content, createdAt: row.created_at };
}

function sumItems(items: MealItem[]) {
  return items.reduce(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      proteinG: acc.proteinG + item.proteinG,
      fatG: acc.fatG + item.fatG,
      carbsG: acc.carbsG + item.carbsG,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
}

// ---------- profile ----------

export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase.from("profile").select("*").eq("id", 1).maybeSingle();
  if (error) throw error;
  return data ? mapProfile(data) : null;
}

export async function upsertProfile(patch: Partial<ProfileInput>): Promise<Profile> {
  const current = await getProfile();
  const merged = {
    height_cm: patch.heightCm ?? current?.heightCm,
    birth_date: patch.birthDate ?? current?.birthDate,
    sex: patch.sex ?? current?.sex,
    activity_factor: patch.activityFactor ?? current?.activityFactor ?? 1.5,
    protein_per_kg: patch.proteinPerKg ?? current?.proteinPerKg ?? 2.0,
    fat_ratio: patch.fatRatio ?? current?.fatRatio ?? 0.22,
  };
  if (merged.height_cm == null || merged.birth_date == null || merged.sex == null) {
    throw new Error("height_cm, birth_date, and sex are required to create a profile");
  }

  const { data, error } = await supabase
    .from("profile")
    .upsert({ id: 1, ...merged, updated_at: new Date().toISOString() })
    .select("*")
    .single();
  if (error) throw error;
  return mapProfile(data);
}

// ---------- phases ----------

export async function getCurrentPhase(): Promise<Phase | null> {
  const { data, error } = await supabase
    .from("phases")
    .select("*")
    .is("ended_on", null)
    .order("started_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPhase(data) : null;
}

export async function getPhaseHistory(): Promise<Phase[]> {
  const { data, error } = await supabase.from("phases").select("*").order("started_on", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapPhase);
}

async function getPhaseForDate(date: string): Promise<Phase | null> {
  const { data, error } = await supabase
    .from("phases")
    .select("*")
    .lte("started_on", date)
    .or(`ended_on.is.null,ended_on.gte.${date}`)
    .order("started_on", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapPhase(data) : null;
}

export async function setPhase(input: {
  kind: PhaseKind;
  startedOn?: string;
  targetWeightKg?: number | null;
  paceKgPerWeek?: number | null;
}): Promise<Phase> {
  const startedOn = input.startedOn ?? todayJST();
  const current = await getCurrentPhase();
  if (current) {
    const { error: endError } = await supabase
      .from("phases")
      .update({ ended_on: addDays(startedOn, -1) })
      .eq("id", current.id);
    if (endError) throw endError;
  }

  // Stored signed per schema: positive for bulk, negative for cut.
  const signedPace =
    input.paceKgPerWeek == null ? null
    : input.kind === "cut" ? -Math.abs(input.paceKgPerWeek)
    : input.kind === "bulk" ? Math.abs(input.paceKgPerWeek)
    : null;

  const { data, error } = await supabase
    .from("phases")
    .insert({
      kind: input.kind,
      started_on: startedOn,
      target_weight_kg: input.targetWeightKg ?? null,
      pace_kg_per_week: signedPace,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapPhase(data);
}

// ---------- weight ----------

export async function upsertWeightLog(loggedOn: string, weightKg: number): Promise<WeightLog> {
  const { data, error } = await supabase
    .from("weight_logs")
    .upsert({ logged_on: loggedOn, weight_kg: weightKg }, { onConflict: "logged_on" })
    .select("*")
    .single();
  if (error) throw error;
  return mapWeightLog(data);
}

async function getWeightsUpTo(endDate: string, limit: number): Promise<WeightLog[]> {
  const { data, error } = await supabase
    .from("weight_logs")
    .select("*")
    .lte("logged_on", endDate)
    .order("logged_on", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapWeightLog).reverse();
}

export async function getWeightHistory(days: number): Promise<WeightLog[]> {
  const start = addDays(todayJST(), -(days - 1));
  const { data, error } = await supabase
    .from("weight_logs")
    .select("*")
    .gte("logged_on", start)
    .order("logged_on", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapWeightLog);
}

// ---------- meals ----------

export async function logMeal(input: LogMealInput): Promise<Meal> {
  const totals = sumItems(input.items);
  const { data, error } = await supabase
    .from("meals")
    .insert({
      eaten_on: input.eatenOn,
      meal_slot: input.mealSlot,
      raw_input: input.rawInput,
      items: input.items.map(toDbMealItem),
      total_kcal: totals.kcal,
      total_protein_g: totals.proteinG,
      total_fat_g: totals.fatG,
      total_carbs_g: totals.carbsG,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapMeal(data);
}

export async function updateMeal(mealId: number, items: MealItem[]): Promise<Meal> {
  const totals = sumItems(items);
  const { data, error } = await supabase
    .from("meals")
    .update({
      items: items.map(toDbMealItem),
      total_kcal: totals.kcal,
      total_protein_g: totals.proteinG,
      total_fat_g: totals.fatG,
      total_carbs_g: totals.carbsG,
    })
    .eq("id", mealId)
    .select("*")
    .single();
  if (error) throw error;
  return mapMeal(data);
}

export async function deleteMeal(mealId: number): Promise<void> {
  const { error } = await supabase.from("meals").delete().eq("id", mealId);
  if (error) throw error;
}

export async function getMealsForDate(date: string): Promise<Meal[]> {
  const { data, error } = await supabase.from("meals").select("*").eq("eaten_on", date).order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapMeal);
}

// ---------- exercise ----------

export async function logExercise(input: LogExerciseInput): Promise<ExerciseLog> {
  const { data, error } = await supabase
    .from("exercise_logs")
    .insert({
      done_on: input.doneOn,
      raw_input: input.rawInput,
      description: input.description,
      kcal_burned: input.kcalBurned,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapExerciseLog(data);
}

export async function deleteExercise(id: number): Promise<void> {
  const { error } = await supabase.from("exercise_logs").delete().eq("id", id);
  if (error) throw error;
}

export async function getExerciseForDate(date: string): Promise<ExerciseLog[]> {
  const { data, error } = await supabase
    .from("exercise_logs")
    .select("*")
    .eq("done_on", date)
    .order("created_at");
  if (error) throw error;
  return (data ?? []).map(mapExerciseLog);
}

// ---------- chat messages ----------

export async function insertChatMessage(role: "user" | "assistant", content: string): Promise<void> {
  const { error } = await supabase.from("chat_messages").insert({ role, content });
  if (error) throw error;
}

export async function getRecentChatMessages(limit: number): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("*")
    .order("id", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map(mapChatMessage).reverse();
}

// ---------- aggregation: targets & summaries ----------

export async function getProfileAndTargets(): Promise<{
  profile: Profile | null;
  phase: Phase | null;
  targets: (PFCTargets & { targetKcal: number; bmr: number; tdee: number }) | null;
}> {
  const today = todayJST();
  const [profile, phase, weights] = await Promise.all([getProfile(), getCurrentPhase(), getWeightsUpTo(today, 7)]);

  if (!profile) return { profile: null, phase, targets: null };

  const weightKg = resolveCalculationWeight(weights.map((w) => w.weightKg));
  if (weightKg == null) return { profile, phase, targets: null };

  const daily = calculateDailyTargets({
    weightKg,
    heightCm: profile.heightCm,
    birthDateStr: profile.birthDate,
    onDateStr: today,
    sex: profile.sex,
    activityFactor: profile.activityFactor,
    phase: phase?.kind ?? "maintain",
    pacePerWeekKg: phase?.paceKgPerWeek,
    proteinPerKg: profile.proteinPerKg,
    fatRatio: profile.fatRatio,
  });

  return {
    profile,
    phase,
    targets: { targetKcal: daily.targetCalories, bmr: daily.bmr, tdee: daily.tdee, ...daily.pfc },
  };
}

export async function getDaySummary(date: string): Promise<DaySummary> {
  const [profile, phase, meals, exercises, weights] = await Promise.all([
    getProfile(),
    getPhaseForDate(date),
    getMealsForDate(date),
    getExerciseForDate(date),
    getWeightsUpTo(date, 7),
  ]);

  const intake = meals.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.totalKcal,
      proteinG: acc.proteinG + m.totalProteinG,
      fatG: acc.fatG + m.totalFatG,
      carbsG: acc.carbsG + m.totalCarbsG,
    }),
    { kcal: 0, proteinG: 0, fatG: 0, carbsG: 0 },
  );
  const burnedKcal = exercises.reduce((sum, e) => sum + e.kcalBurned, 0);

  let targets = { targetKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  let tdee = 0;
  const weightKg = resolveCalculationWeight(weights.map((w) => w.weightKg));
  if (profile && weightKg != null) {
    const daily = calculateDailyTargets({
      weightKg,
      heightCm: profile.heightCm,
      birthDateStr: profile.birthDate,
      onDateStr: date,
      sex: profile.sex,
      activityFactor: profile.activityFactor,
      phase: phase?.kind ?? "maintain",
      pacePerWeekKg: phase?.paceKgPerWeek,
      proteinPerKg: profile.proteinPerKg,
      fatRatio: profile.fatRatio,
    });
    targets = { targetKcal: daily.targetCalories, ...daily.pfc };
    tdee = daily.tdee;
  }

  return {
    date,
    intakeKcal: intake.kcal,
    intakeProteinG: intake.proteinG,
    intakeFatG: intake.fatG,
    intakeCarbsG: intake.carbsG,
    burnedKcal,
    tdee,
    targetKcal: targets.targetKcal,
    targetProteinG: targets.proteinG,
    targetFatG: targets.fatG,
    targetCarbsG: targets.carbsG,
    remainingKcal: targets.targetKcal - intake.kcal + burnedKcal,
    remainingProteinG: targets.proteinG - intake.proteinG,
    remainingFatG: targets.fatG - intake.fatG,
    remainingCarbsG: targets.carbsG - intake.carbsG,
    meals,
    exercises,
  };
}

export async function getRecentDays(days: number): Promise<DaySummary[]> {
  const dates = recentDateStrings(days);
  return Promise.all(dates.map((date) => getDaySummary(date)));
}

// ---------- chat processing lock ----------
// Single-user app: prevents two /api/chat requests (e.g. a message sent before
// the previous one finished) from running concurrent agent loops that each act
// on a stale snapshot of the day's records and duplicate tool calls.

const CHAT_LOCK_STALE_MS = 2 * 60 * 1000;

export async function acquireChatLock(): Promise<boolean> {
  const staleBefore = new Date(Date.now() - CHAT_LOCK_STALE_MS).toISOString();
  const { data, error } = await supabase
    .from("chat_lock")
    .update({ processing_since: new Date().toISOString() })
    .eq("id", 1)
    .or(`processing_since.is.null,processing_since.lt.${staleBefore}`)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return data != null;
}

export async function releaseChatLock(): Promise<void> {
  const { error } = await supabase.from("chat_lock").update({ processing_since: null }).eq("id", 1);
  if (error) throw error;
}
