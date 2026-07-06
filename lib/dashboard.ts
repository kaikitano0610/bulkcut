import "server-only";
import { getDaySummary, getPhaseHistory, getRecentDays, getWeightHistory, type DaySummary, type PhaseKind } from "./db";
import { todayJST } from "./date";

const WEIGHT_WINDOW_DAYS = 30;
const WEEK_DAYS = 7;

export interface WeightPoint {
  date: string;
  weightKg: number;
  movingAvg7d: number | null;
  phaseKind: PhaseKind | null;
  targetPaceKg: number | null;
}

export interface WeeklyBalancePoint {
  date: string;
  intakeKcal: number;
  tdee: number;
  burnedKcal: number;
  balance: number; // intake - tdee - burned
}

export interface PfcHeatmapPoint {
  date: string;
  proteinPct: number | null;
  fatPct: number | null;
  carbsPct: number | null;
}

export interface DashboardData {
  weightHistory: WeightPoint[];
  weeklyBalance: WeeklyBalancePoint[];
  pfcHeatmap: PfcHeatmapPoint[];
  today: DaySummary;
}

export async function getDashboardData(): Promise<DashboardData> {
  const today = todayJST();

  const [weights, phases, weekSummaries, todaySummary] = await Promise.all([
    getWeightHistory(WEIGHT_WINDOW_DAYS),
    getPhaseHistory(),
    getRecentDays(WEEK_DAYS),
    getDaySummary(today),
  ]);

  function phaseForDate(date: string) {
    return phases.find((p) => p.startedOn <= date && (p.endedOn == null || p.endedOn >= date)) ?? null;
  }

  const weightHistory: WeightPoint[] = weights.map((w, i) => {
    const window = weights.slice(Math.max(0, i - 6), i + 1).map((x) => x.weightKg);
    const movingAvg7d = window.length >= 7 ? window.reduce((a, b) => a + b, 0) / window.length : null;
    const phase = phaseForDate(w.loggedOn);

    let targetPaceKg: number | null = null;
    if (phase?.paceKgPerWeek) {
      const phaseStartWeight = weights.find((x) => x.loggedOn >= phase.startedOn)?.weightKg;
      if (phaseStartWeight != null) {
        const daysSinceStart =
          (new Date(`${w.loggedOn}T00:00:00Z`).getTime() - new Date(`${phase.startedOn}T00:00:00Z`).getTime()) /
          (1000 * 60 * 60 * 24);
        targetPaceKg = phaseStartWeight + (phase.paceKgPerWeek * daysSinceStart) / 7;
      }
    }

    return { date: w.loggedOn, weightKg: w.weightKg, movingAvg7d, phaseKind: phase?.kind ?? null, targetPaceKg };
  });

  const weeklyBalance: WeeklyBalancePoint[] = weekSummaries.map((s) => ({
    date: s.date,
    intakeKcal: s.intakeKcal,
    tdee: s.tdee,
    burnedKcal: s.burnedKcal,
    balance: s.intakeKcal - s.tdee - s.burnedKcal,
  }));

  const pfcHeatmap: PfcHeatmapPoint[] = weekSummaries.map((s) => ({
    date: s.date,
    proteinPct: s.targetProteinG > 0 ? (s.intakeProteinG / s.targetProteinG) * 100 : null,
    fatPct: s.targetFatG > 0 ? (s.intakeFatG / s.targetFatG) * 100 : null,
    carbsPct: s.targetCarbsG > 0 ? (s.intakeCarbsG / s.targetCarbsG) * 100 : null,
  }));

  return { weightHistory, weeklyBalance, pfcHeatmap, today: todaySummary };
}
