import type { GradeCompany } from "../db/types";

export type Confidence = "high" | "medium" | "low";

/** Border-centering measurement for one axis pair. */
export interface CenteringMeasurement {
  /** Left/right border split, normalized to sum 100 (e.g. [58, 42]). */
  leftRight: [number, number];
  /** Top/bottom border split. */
  topBottom: [number, number];
  /** Worst-side percentage across both axes (the number graders quote). */
  worst: number;
  confidence: Confidence;
}

/** A 1–10 component score with supporting findings. */
export interface ComponentScore {
  score: number;
  confidence: Confidence;
  findings: string[];
}

export interface SideMeasurements {
  centering: CenteringMeasurement | null;
  corners: ComponentScore;
  edges: ComponentScore;
  surface: ComponentScore;
  /** 0–1 fraction of likely glare pixels; high glare degrades confidence. */
  glareFraction: number;
}

export interface GradingMeasurements {
  front: SideMeasurements;
  back: SideMeasurements | null;
}

export interface CompanyPrediction {
  company: GradeCompany;
  /** e.g. 9 or 9.5; TAG also gets `tagScore` (0–1000). */
  mostLikely: number;
  range: [number, number];
  confidence: Confidence;
  /** Which component holds the grade down. */
  limitingFactor: "centering" | "corners" | "edges" | "surface";
  /** Company-specific subgrades used. */
  subgrades: { centering: number; corners: number; edges: number; surface: number };
  tagScore?: number;
}

export interface GradingExplanation {
  headline: string;
  /** Ordered explanation paragraphs (component by component). */
  sections: { title: string; body: string }[];
  caveats: string[];
}
