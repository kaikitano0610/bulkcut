import { describe, expect, it } from "vitest";
import {
  calculateAge,
  calculateBMR,
  calculateDailyTargets,
  calculatePFC,
  calculateTargetCalories,
  calculateTDEE,
  resolveCalculationWeight,
} from "../nutrition";

describe("calculateAge", () => {
  it("counts a year older on the exact birthday", () => {
    expect(calculateAge("1990-07-06", "2026-07-06")).toBe(36);
  });

  it("has not yet incremented the day before the birthday", () => {
    expect(calculateAge("1990-07-06", "2026-07-05")).toBe(35);
  });

  it("has already incremented the day after the birthday", () => {
    expect(calculateAge("1990-07-06", "2026-07-07")).toBe(36);
  });

  it("has not incremented earlier in the same birth month", () => {
    expect(calculateAge("1990-07-06", "2026-06-30")).toBe(35);
  });
});

describe("calculateBMR", () => {
  it("adds 5 for male", () => {
    expect(calculateBMR({ weightKg: 70, heightCm: 175, age: 30, sex: "male" })).toBeCloseTo(
      10 * 70 + 6.25 * 175 - 5 * 30 + 5,
    );
  });

  it("subtracts 161 for female", () => {
    expect(calculateBMR({ weightKg: 55, heightCm: 160, age: 28, sex: "female" })).toBeCloseTo(
      10 * 55 + 6.25 * 160 - 5 * 28 - 161,
    );
  });
});

describe("calculateTDEE", () => {
  it("multiplies BMR by the activity factor", () => {
    expect(calculateTDEE(1600, 1.5)).toBeCloseTo(2400);
  });
});

describe("calculateTargetCalories", () => {
  const tdee = 2500;

  it("maintain returns TDEE unchanged", () => {
    expect(calculateTargetCalories({ tdee, phase: "maintain" })).toBe(tdee);
  });

  it("bulk without a pace defaults to +300", () => {
    expect(calculateTargetCalories({ tdee, phase: "bulk" })).toBe(tdee + 300);
  });

  it("bulk with a modest pace uses the computed surplus", () => {
    // 0.3kg/week * 7700 / 7 = 330, under the 500 cap
    expect(calculateTargetCalories({ tdee, phase: "bulk", pacePerWeekKg: 0.3 })).toBeCloseTo(tdee + 330);
  });

  it("bulk with an aggressive pace is capped at +500", () => {
    // 1.0kg/week * 7700 / 7 = 1100, exceeds the 500 cap
    expect(calculateTargetCalories({ tdee, phase: "bulk", pacePerWeekKg: 1.0 })).toBe(tdee + 500);
  });

  it("cut without a pace defaults to -500", () => {
    expect(calculateTargetCalories({ tdee, phase: "cut" })).toBe(tdee - 500);
  });

  it("cut with a modest pace uses the computed deficit", () => {
    // 0.5kg/week * 7700 / 7 = 550, under the 750 cap
    expect(calculateTargetCalories({ tdee, phase: "cut", pacePerWeekKg: -0.5 })).toBeCloseTo(tdee - 550);
  });

  it("cut with an aggressive pace is capped at -750", () => {
    // 1.0kg/week * 7700 / 7 = 1100, exceeds the 750 cap
    expect(calculateTargetCalories({ tdee, phase: "cut", pacePerWeekKg: -1.0 })).toBe(tdee - 750);
  });
});

describe("calculatePFC", () => {
  it("derives protein from body weight, fat from calorie ratio, carbs from the remainder", () => {
    const result = calculatePFC({ targetCalories: 2800, weightKg: 70, proteinPerKg: 2.0, fatRatio: 0.22 });

    expect(result.proteinG).toBeCloseTo(140);
    expect(result.fatG).toBeCloseTo((2800 * 0.22) / 9);
    expect(result.carbsG).toBeCloseTo((2800 - 140 * 4 - result.fatG * 9) / 4);
  });
});

describe("resolveCalculationWeight", () => {
  it("returns null when there is no data", () => {
    expect(resolveCalculationWeight([])).toBeNull();
  });

  it("returns the latest value when fewer than 7 readings exist", () => {
    expect(resolveCalculationWeight([70, 70.5, 71])).toBe(71);
  });

  it("averages exactly the last 7 readings when 7 or more exist", () => {
    const weights = [69, 69.5, 70, 70.2, 70.4, 70.6, 70.8, 71]; // 8 entries
    const last7 = weights.slice(-7);
    expect(resolveCalculationWeight(weights)).toBeCloseTo(last7.reduce((a, b) => a + b, 0) / 7);
  });
});

describe("calculateDailyTargets", () => {
  it("chains BMR -> TDEE -> target calories -> PFC", () => {
    const result = calculateDailyTargets({
      weightKg: 70,
      heightCm: 175,
      birthDateStr: "1990-07-06",
      onDateStr: "2026-07-06",
      sex: "male",
      activityFactor: 1.5,
      phase: "cut",
      pacePerWeekKg: -0.5,
      proteinPerKg: 2.0,
      fatRatio: 0.22,
    });

    const expectedBmr = 10 * 70 + 6.25 * 175 - 5 * 36 + 5;
    const expectedTdee = expectedBmr * 1.5;
    const expectedTarget = expectedTdee - Math.min(750, (0.5 * 7700) / 7);

    expect(result.bmr).toBeCloseTo(expectedBmr);
    expect(result.tdee).toBeCloseTo(expectedTdee);
    expect(result.targetCalories).toBeCloseTo(expectedTarget);
    expect(result.pfc.proteinG).toBeCloseTo(140);
  });
});
