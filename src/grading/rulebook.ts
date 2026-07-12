/**
 * Grading-company rulebook — thresholds as DATA so they're transparent,
 * testable, and adjustable when companies change standards (PSA tightened
 * 10-centering to 55/45 in early 2025, for example).
 *
 * Sources: published company standards + community measurements (see spec).
 * All centering values are the WORST-side percentage (e.g. 55 means 55/45).
 */

import type { GradeCompany } from "../db/types";
import type { CompanyPrediction, Confidence, GradingMeasurements } from "./types";

interface CenteringTier {
  grade: number;
  /** Max worst-side split on the front for this grade. */
  front: number;
  /** Max worst-side split on the back. */
  back: number;
}

/** Ordered best → worst. First tier whose limits both pass wins. */
export const CENTERING_RULES: Record<GradeCompany, CenteringTier[]> = {
  PSA: [
    { grade: 10, front: 55, back: 75 },
    { grade: 9, front: 60, back: 90 },
    { grade: 8, front: 65, back: 90 },
    { grade: 7, front: 70, back: 95 },
    { grade: 6, front: 80, back: 100 },
    { grade: 5, front: 85, back: 100 },
    { grade: 4, front: 90, back: 100 },
    { grade: 3, front: 100, back: 100 },
  ],
  BGS: [
    { grade: 10, front: 51.5, back: 55 },
    { grade: 9.5, front: 55, back: 60 },
    { grade: 9, front: 60, back: 65 },
    { grade: 8.5, front: 65, back: 70 },
    { grade: 8, front: 70, back: 80 },
    { grade: 7, front: 80, back: 90 },
    { grade: 6, front: 85, back: 95 },
    { grade: 5, front: 100, back: 100 },
  ],
  CGC: [
    { grade: 10, front: 55, back: 60 },
    { grade: 9.5, front: 57.5, back: 65 },
    { grade: 9, front: 60, back: 70 },
    { grade: 8.5, front: 65, back: 75 },
    { grade: 8, front: 70, back: 80 },
    { grade: 7, front: 80, back: 90 },
    { grade: 6, front: 85, back: 95 },
    { grade: 5, front: 100, back: 100 },
  ],
  TAG: [
    { grade: 10, front: 51, back: 65 },
    { grade: 9.5, front: 54, back: 65 },
    { grade: 9, front: 57, back: 70 },
    { grade: 8.5, front: 62, back: 75 },
    { grade: 8, front: 67, back: 80 },
    { grade: 7, front: 75, back: 90 },
    { grade: 6, front: 85, back: 95 },
    { grade: 5, front: 100, back: 100 },
  ],
  SGC: [
    { grade: 10, front: 55, back: 75 },
    { grade: 9.5, front: 60, back: 80 },
    { grade: 9, front: 65, back: 85 },
    { grade: 8, front: 70, back: 90 },
    { grade: 7, front: 80, back: 95 },
    { grade: 6, front: 85, back: 100 },
    { grade: 5, front: 100, back: 100 },
  ],
};

export function centeringSubgrade(
  company: GradeCompany,
  frontWorst: number,
  backWorst: number | null,
): number {
  for (const tier of CENTERING_RULES[company]) {
    if (frontWorst <= tier.front && (backWorst == null || backWorst <= tier.back)) {
      return tier.grade;
    }
  }
  return 2;
}

/** Round to the company's grade increments. */
function snapGrade(company: GradeCompany, value: number): number {
  const snapped = company === "PSA" ? Math.round(value) : Math.round(value * 2) / 2;
  return Math.max(1, Math.min(10, snapped));
}

function confidenceRank(c: Confidence): number {
  return c === "high" ? 2 : c === "medium" ? 1 : 0;
}

const COMPANIES: GradeCompany[] = ["PSA", "BGS", "CGC", "TAG"];

export function predictAllCompanies(m: GradingMeasurements): CompanyPrediction[] {
  return COMPANIES.map((company) => predictCompany(company, m));
}

export function predictCompany(company: GradeCompany, m: GradingMeasurements): CompanyPrediction {
  const frontWorst = m.front.centering?.worst ?? 60; // unknown centering: assume mediocre
  const backWorst = m.back?.centering?.worst ?? null;

  // Combine front/back component scores (front-weighted 70/30, like graders do).
  const combine = (frontScore: number, backScore: number | null) =>
    backScore == null ? frontScore : frontScore * 0.7 + backScore * 0.3;

  const subgrades = {
    centering: centeringSubgrade(company, frontWorst, backWorst),
    corners: combine(m.front.corners.score, m.back?.corners.score ?? null),
    edges: combine(m.front.edges.score, m.back?.edges.score ?? null),
    surface: combine(m.front.surface.score, m.back?.surface.score ?? null),
  };

  const entries = Object.entries(subgrades) as [keyof typeof subgrades, number][];
  const lowest = entries.reduce((a, b) => (b[1] < a[1] ? b : a));
  const limitingFactor = lowest[0];
  const lowestScore = lowest[1];
  const mean = entries.reduce((s, [, v]) => s + v, 0) / entries.length;

  let raw: number;
  let tagScore: number | undefined;
  switch (company) {
    case "PSA":
      // PSA gives a single grade ≈ floor of the components, with at most a
      // one-point lift when everything else is clearly stronger.
      raw = mean - lowestScore >= 1.25 ? lowestScore + 1 : lowestScore;
      break;
    case "BGS":
    case "CGC": {
      // Weighted mean pulled toward the lowest subgrade; a 10 needs all 10s.
      raw = Math.min(mean * 0.4 + lowestScore * 0.6 + 0.25, lowestScore + 0.5);
      if (raw >= 10 && lowestScore < 10) raw = 9.5;
      break;
    }
    case "TAG": {
      // 1000-point scale ≈ mean of components × 100, mapped to grade bands.
      tagScore = Math.round(((mean * 0.55 + lowestScore * 0.45) / 10) * 1000);
      raw =
        tagScore >= 970 ? 10 : tagScore >= 940 ? 9.5 : tagScore >= 900 ? 9 : tagScore >= 850 ? 8.5 : tagScore >= 800 ? 8 : tagScore >= 700 ? 7 : tagScore >= 600 ? 6 : 5;
      break;
    }
    default:
      raw = lowestScore;
  }

  const mostLikely = snapGrade(company, raw);

  // Confidence = weakest confidence among the components that matter.
  const confidences: Confidence[] = [
    m.front.centering?.confidence ?? "low",
    m.front.corners.confidence,
    m.front.edges.confidence,
    m.front.surface.confidence,
  ];
  const overall = confidences.reduce((a, b) => (confidenceRank(b) < confidenceRank(a) ? b : a));
  const spread = overall === "high" ? 0.5 : overall === "medium" ? 1 : 1.5;

  // Uncertainty that can't extend above 10 folds downward instead.
  const ceilingOverflow = Math.max(0, mostLikely + spread - 10);
  const lo = snapGrade(company, mostLikely - spread - ceilingOverflow);
  const hi = snapGrade(company, Math.min(10, mostLikely + spread));

  return {
    company,
    mostLikely,
    range: [lo, hi],
    confidence: overall,
    limitingFactor,
    subgrades: {
      centering: subgrades.centering,
      corners: Math.round(subgrades.corners * 2) / 2,
      edges: Math.round(subgrades.edges * 2) / 2,
      surface: Math.round(subgrades.surface * 2) / 2,
    },
    ...(tagScore != null ? { tagScore } : {}),
  };
}
