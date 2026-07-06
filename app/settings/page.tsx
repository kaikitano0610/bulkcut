import { SettingsForm } from "@/components/SettingsForm";
import { getProfileAndTargets } from "@/lib/db";
import { MODEL } from "@/lib/claude";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { profile, phase } = await getProfileAndTargets();

  return (
    <SettingsForm
      initialProfile={profile}
      initialPhase={
        phase ? { kind: phase.kind, targetWeightKg: phase.targetWeightKg, paceKgPerWeek: phase.paceKgPerWeek } : null
      }
      model={MODEL}
    />
  );
}
