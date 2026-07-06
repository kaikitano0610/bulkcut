export interface DaySummaryUI {
  intakeKcal: number;
  targetKcal: number;
  intakeProteinG: number;
  targetProteinG: number;
  intakeFatG: number;
  targetFatG: number;
  intakeCarbsG: number;
  targetCarbsG: number;
}

function ProgressBar({ label, value, target, unit }: { label: string; value: number; target: number; unit: string }) {
  const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex justify-between text-[10px] text-zinc-500">
        <span>{label}</span>
        <span>
          {Math.round(value)}/{Math.round(target)}
          {unit}
        </span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div className="h-1.5 rounded-full bg-teal-600" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function SummaryBar({ summary }: { summary: DaySummaryUI }) {
  return (
    <div className="grid grid-cols-4 gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
      <ProgressBar label="kcal" value={summary.intakeKcal} target={summary.targetKcal} unit="" />
      <ProgressBar label="P" value={summary.intakeProteinG} target={summary.targetProteinG} unit="g" />
      <ProgressBar label="F" value={summary.intakeFatG} target={summary.targetFatG} unit="g" />
      <ProgressBar label="C" value={summary.intakeCarbsG} target={summary.targetCarbsG} unit="g" />
    </div>
  );
}
