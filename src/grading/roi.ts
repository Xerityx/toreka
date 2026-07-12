/**
 * Grading ROI calculator: is this card worth sending in, and to whom?
 *
 * Fees and multipliers are 2026 defaults and editable (stored in settings) —
 * the grading market moves fast (PSA paused Value tiers June 2026; TAG closed
 * core submissions May 2026).
 */

import type { GradeCompany } from "../db/types";
import type { CompanyPrediction } from "./types";

export interface GradingFees {
  /** All-in cost per card (fee + shipping both ways, prorated). */
  perCard: Record<GradeCompany, number>;
  /** Whether the company currently accepts submissions at this tier. */
  available: Record<GradeCompany, boolean>;
}

export const DEFAULT_FEES: GradingFees = {
  perCard: { PSA: 110, BGS: 40, CGC: 32, TAG: 35, SGC: 30 },
  available: { PSA: true, BGS: true, CGC: true, TAG: false, SGC: true },
};

/** Value multiplier vs raw NM price, by achieved grade. */
export type GradeMultipliers = Record<string, number>;

export const DEFAULT_MULTIPLIERS: GradeMultipliers = {
  "10": 5.0, // PSA 10 / BGS 10 premium
  "9.5": 2.2,
  "9": 1.7,
  "8.5": 1.25,
  "8": 1.1,
  "7": 0.9,
  "6": 0.75,
  "5": 0.6,
};

export interface RoiInput {
  rawValue: number;
  prediction: CompanyPrediction;
  fees?: GradingFees;
  multipliers?: GradeMultipliers;
}

export interface RoiResult {
  company: GradeCompany;
  available: boolean;
  fee: number;
  /** Probability-weighted graded value. */
  expectedValue: number;
  /** expectedValue − fee − rawValue (what grading adds over keeping it raw). */
  expectedProfit: number;
  /** Value if the most-likely grade hits. */
  likelyValue: number;
  recommendation: "grade" | "borderline" | "skip";
}

/**
 * Probability mass over the predicted range: most-likely grade gets 50%,
 * the rest is split across the remaining grades in range (triangular-ish).
 */
export function gradeDistribution(prediction: CompanyPrediction): Map<number, number> {
  const [lo, hi] = prediction.range;
  const step = prediction.company === "PSA" ? 1 : 0.5;
  const grades: number[] = [];
  for (let g = lo; g <= hi + 1e-9; g += step) grades.push(Math.round(g * 2) / 2);
  const dist = new Map<number, number>();
  const others = grades.filter((g) => g !== prediction.mostLikely);
  const otherMass = others.length > 0 ? 0.5 / others.length : 0;
  for (const g of grades) {
    dist.set(g, g === prediction.mostLikely ? (others.length > 0 ? 0.5 : 1) : otherMass);
  }
  return dist;
}

function multiplierFor(grade: number, multipliers: GradeMultipliers): number {
  const exact = multipliers[String(grade)];
  if (exact != null) return exact;
  // Fall back to the nearest defined grade below.
  const keys = Object.keys(multipliers)
    .map(Number)
    .sort((a, b) => b - a);
  for (const k of keys) {
    if (grade >= k) return multipliers[String(k)];
  }
  return 0.5;
}

export function computeRoi(input: RoiInput): RoiResult {
  const fees = input.fees ?? DEFAULT_FEES;
  const multipliers = input.multipliers ?? DEFAULT_MULTIPLIERS;
  const { prediction, rawValue } = input;
  const fee = fees.perCard[prediction.company];
  const available = fees.available[prediction.company];

  const dist = gradeDistribution(prediction);
  let expectedValue = 0;
  for (const [grade, p] of dist) {
    expectedValue += p * rawValue * multiplierFor(grade, multipliers);
  }
  const likelyValue = rawValue * multiplierFor(prediction.mostLikely, multipliers);
  const expectedProfit = expectedValue - fee - rawValue;

  let recommendation: RoiResult["recommendation"];
  if (rawValue < 30 || expectedProfit < 0) recommendation = "skip";
  else if (expectedProfit < fee * 0.5) recommendation = "borderline";
  else recommendation = "grade";

  return {
    company: prediction.company,
    available,
    fee,
    expectedValue: Math.round(expectedValue * 100) / 100,
    expectedProfit: Math.round(expectedProfit * 100) / 100,
    likelyValue: Math.round(likelyValue * 100) / 100,
    recommendation,
  };
}
