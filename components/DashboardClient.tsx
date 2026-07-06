"use client";

import { Fragment, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface WeightPoint {
  date: string;
  weightKg: number;
  movingAvg7d: number | null;
  phaseKind: "bulk" | "cut" | "maintain" | null;
  targetPaceKg: number | null;
}

interface WeeklyBalancePoint {
  date: string;
  intakeKcal: number;
  tdee: number;
  burnedKcal: number;
  balance: number;
}

interface PfcHeatmapPoint {
  date: string;
  proteinPct: number | null;
  fatPct: number | null;
  carbsPct: number | null;
}

interface MealItem {
  id: number;
  mealSlot: string;
  items: { name: string; amount: string; kcal: number }[];
  totalKcal: number;
}

interface ExerciseItem {
  id: number;
  description: string;
  kcalBurned: number;
}

interface DaySummary {
  date: string;
  intakeKcal: number;
  targetKcal: number;
  meals: MealItem[];
  exercises: ExerciseItem[];
}

const PHASE_COLOR: Record<string, string> = {
  bulk: "#3b82f6",
  cut: "#f97316",
  maintain: "#a1a1aa",
};

const PHASE_LABEL: Record<string, string> = {
  bulk: "増量期",
  cut: "減量期",
  maintain: "維持期",
};

const MEAL_SLOT_LABEL: Record<string, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

function phaseSegments(points: WeightPoint[]) {
  const segments: { start: string; end: string; kind: string }[] = [];
  let current: { start: string; end: string; kind: string } | null = null;
  for (const p of points) {
    const kind = p.phaseKind ?? "none";
    if (current && current.kind === kind) {
      current.end = p.date;
    } else {
      if (current) segments.push(current);
      current = { start: p.date, end: p.date, kind };
    }
  }
  if (current) segments.push(current);
  return segments.filter((s) => s.kind !== "none");
}

function heatColor(pct: number | null): string {
  if (pct == null) return "transparent";
  if (pct <= 100) {
    const alpha = Math.max(0.08, Math.min(1, pct / 100));
    return `rgba(13, 148, 136, ${alpha})`; // teal
  }
  const overshoot = Math.min(50, pct - 100) / 50;
  return `rgba(249, 115, 22, ${0.3 + overshoot * 0.7})`; // orange
}

export function DashboardClient({
  weightHistory,
  weeklyBalance,
  pfcHeatmap,
  today,
}: {
  weightHistory: WeightPoint[];
  weeklyBalance: WeeklyBalancePoint[];
  pfcHeatmap: PfcHeatmapPoint[];
  today: DaySummary;
}) {
  const [meals, setMeals] = useState(today.meals);
  const segments = phaseSegments(weightHistory);
  const usedPhaseKinds = new Set(segments.map((s) => s.kind));

  async function handleDeleteMeal(id: number) {
    const res = await fetch(`/api/meals/${id}`, { method: "DELETE" });
    if (res.ok) setMeals((prev) => prev.filter((m) => m.id !== id));
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      <section>
        <h2 className="mb-2 font-semibold">体重推移</h2>
        <div className="h-56 w-full">
          <ResponsiveContainer>
            <LineChart data={weightHistory} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              {segments.map((s, i) => (
                <ReferenceArea key={i} x1={s.start} x2={s.end} fill={PHASE_COLOR[s.kind]} fillOpacity={0.08} />
              ))}
              <XAxis dataKey="date" tick={{ fontSize: 10 }} minTickGap={20} />
              <YAxis domain={["auto", "auto"]} tick={{ fontSize: 10 }} width={40} />
              <Tooltip />
              <Line type="monotone" dataKey="weightKg" stroke="#71717a" strokeWidth={1} dot={{ r: 2 }} name="体重" />
              <Line
                type="monotone"
                dataKey="movingAvg7d"
                stroke="#0d9488"
                strokeWidth={2}
                dot={false}
                name="7日移動平均"
              />
              <Line
                type="monotone"
                dataKey="targetPaceKg"
                stroke="#f97316"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                name="目標ペース"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {usedPhaseKinds.size > 0 && (
          <div className="mt-1 flex gap-3 text-xs text-zinc-500">
            {[...usedPhaseKinds].map((k) => (
              <span key={k} className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: PHASE_COLOR[k] }} />
                {PHASE_LABEL[k]}
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">週間カロリー収支（摂取 − TDEE − 運動）</h2>
        <div className="h-48 w-full">
          <ResponsiveContainer>
            <BarChart data={weeklyBalance} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip />
              <Bar dataKey="balance" name="収支(kcal)">
                {weeklyBalance.map((d, i) => (
                  <Cell key={i} fill={d.balance >= 0 ? "#f97316" : "#3b82f6"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">PFC達成率（週間）</h2>
        <div className="grid grid-cols-[2.5rem_repeat(7,1fr)] gap-1 text-[10px]">
          <div />
          {pfcHeatmap.map((d) => (
            <div key={d.date} className="text-center text-zinc-500">
              {d.date.slice(8)}
            </div>
          ))}
          {(["P", "F", "C"] as const).map((label) => (
            <Fragment key={label}>
              <div className="flex items-center text-zinc-500">{label}</div>
              {pfcHeatmap.map((d) => {
                const pct = label === "P" ? d.proteinPct : label === "F" ? d.fatPct : d.carbsPct;
                return (
                  <div
                    key={`${label}-${d.date}`}
                    className="flex aspect-square items-center justify-center rounded"
                    style={{ background: heatColor(pct) }}
                    title={pct != null ? `${Math.round(pct)}%` : "—"}
                  >
                    {pct != null ? Math.round(pct) : "—"}
                  </div>
                );
              })}
            </Fragment>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 font-semibold">
          今日の記録（{Math.round(today.intakeKcal)} / {Math.round(today.targetKcal)}kcal）
        </h2>
        <div className="flex flex-col gap-2">
          {meals.map((m) => (
            <button
              key={m.id}
              onClick={() => handleDeleteMeal(m.id)}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-left text-sm dark:border-zinc-800"
            >
              <span>
                {MEAL_SLOT_LABEL[m.mealSlot] ?? m.mealSlot}: {m.items.map((i) => i.name).join(", ")}
              </span>
              <span className="text-zinc-500">{Math.round(m.totalKcal)}kcal ✕</span>
            </button>
          ))}
          {today.exercises.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span>🏃 {e.description}</span>
              <span className="text-zinc-500">-{Math.round(e.kcalBurned)}kcal</span>
            </div>
          ))}
          {meals.length === 0 && today.exercises.length === 0 && (
            <p className="text-sm text-zinc-500">今日はまだ記録がありません</p>
          )}
        </div>
      </section>
    </div>
  );
}
