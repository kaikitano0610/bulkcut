"use client";

import { useState } from "react";

interface ProfileData {
  heightCm: number;
  birthDate: string;
  sex: "male" | "female";
  activityFactor: number;
  proteinPerKg: number;
  fatRatio: number;
}

interface PhaseData {
  kind: "bulk" | "cut" | "maintain";
  targetWeightKg: number | null;
  paceKgPerWeek: number | null;
}

export function SettingsForm({
  initialProfile,
  initialPhase,
  model,
}: {
  initialProfile: ProfileData | null;
  initialPhase: PhaseData | null;
  model: string;
}) {
  const [profile, setProfile] = useState<ProfileData>(
    initialProfile ?? {
      heightCm: 170,
      birthDate: "1990-01-01",
      sex: "male",
      activityFactor: 1.5,
      proteinPerKg: 2.0,
      fatRatio: 0.22,
    },
  );
  const [phase, setPhase] = useState<PhaseData>(
    initialPhase ?? { kind: "maintain", targetWeightKg: null, paceKgPerWeek: null },
  );
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPhase, setSavingPhase] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    setMessage(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          height_cm: profile.heightCm,
          birth_date: profile.birthDate,
          sex: profile.sex,
          activity_factor: profile.activityFactor,
          protein_per_kg: profile.proteinPerKg,
          fat_ratio: profile.fatRatio,
        }),
      });
      setMessage(res.ok ? "プロフィールを保存しました" : "保存に失敗しました");
    } finally {
      setSavingProfile(false);
    }
  }

  async function savePhase(e: React.FormEvent) {
    e.preventDefault();
    setSavingPhase(true);
    setMessage(null);
    try {
      const res = await fetch("/api/phase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: phase.kind,
          target_weight_kg: phase.targetWeightKg,
          pace_kg_per_week: phase.paceKgPerWeek,
        }),
      });
      setMessage(res.ok ? "フェーズを切り替えました" : "保存に失敗しました");
    } finally {
      setSavingPhase(false);
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 overflow-y-auto p-4">
      {message && <p className="text-sm text-teal-700 dark:text-teal-400">{message}</p>}

      <form onSubmit={saveProfile} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold">プロフィール</h2>

        <label className="flex flex-col gap-1 text-sm">
          身長 (cm)
          <input
            type="number"
            value={profile.heightCm}
            onChange={(e) => setProfile({ ...profile, heightCm: Number(e.target.value) })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          生年月日
          <input
            type="date"
            value={profile.birthDate}
            onChange={(e) => setProfile({ ...profile, birthDate: e.target.value })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          性別
          <select
            value={profile.sex}
            onChange={(e) => setProfile({ ...profile, sex: e.target.value as "male" | "female" })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="male">男性</option>
            <option value="female">女性</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          活動係数 (1.2〜1.9。デスクワーク中心=1.3〜1.5、立ち仕事=1.6〜1.7、高強度=1.8〜1.9目安)
          <input
            type="number"
            step="0.05"
            min="1.2"
            max="1.9"
            value={profile.activityFactor}
            onChange={(e) => setProfile({ ...profile, activityFactor: Number(e.target.value) })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          目標タンパク質 (g/kg体重)
          <input
            type="number"
            step="0.1"
            value={profile.proteinPerKg}
            onChange={(e) => setProfile({ ...profile, proteinPerKg: Number(e.target.value) })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          脂質比率 (摂取kcalに占める割合。例: 0.22)
          <input
            type="number"
            step="0.01"
            min="0"
            max="1"
            value={profile.fatRatio}
            onChange={(e) => setProfile({ ...profile, fatRatio: Number(e.target.value) })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <button
          type="submit"
          disabled={savingProfile}
          className="rounded-lg bg-teal-700 py-2 font-medium text-white disabled:opacity-50"
        >
          {savingProfile ? "保存中..." : "プロフィールを保存"}
        </button>
      </form>

      <form onSubmit={savePhase} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
        <h2 className="font-semibold">フェーズ・目標</h2>

        <label className="flex flex-col gap-1 text-sm">
          フェーズ
          <select
            value={phase.kind}
            onChange={(e) => setPhase({ ...phase, kind: e.target.value as PhaseData["kind"] })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="bulk">増量期</option>
            <option value="cut">減量期</option>
            <option value="maintain">維持期</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          目標体重 (kg・任意)
          <input
            type="number"
            step="0.1"
            value={phase.targetWeightKg ?? ""}
            onChange={(e) => setPhase({ ...phase, targetWeightKg: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="flex flex-col gap-1 text-sm">
          ペース (kg/週・絶対値・任意)
          <input
            type="number"
            step="0.1"
            value={phase.paceKgPerWeek != null ? Math.abs(phase.paceKgPerWeek) : ""}
            onChange={(e) => setPhase({ ...phase, paceKgPerWeek: e.target.value ? Number(e.target.value) : null })}
            className="rounded-lg border border-zinc-300 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <button
          type="submit"
          disabled={savingPhase}
          className="rounded-lg bg-teal-700 py-2 font-medium text-white disabled:opacity-50"
        >
          {savingPhase ? "切替中..." : "フェーズを切り替える"}
        </button>
      </form>

      <div className="rounded-xl border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
        使用モデル: <span className="font-mono">{model}</span>
      </div>
    </div>
  );
}
