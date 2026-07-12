import { centeringSubgrade, predictAllCompanies, predictCompany } from "../rulebook";
import { computeRoi, gradeDistribution, DEFAULT_FEES } from "../roi";
import type { CompanyPrediction, GradingMeasurements, SideMeasurements } from "../types";

function side(overrides: Partial<SideMeasurements> = {}): SideMeasurements {
  return {
    centering: {
      leftRight: [52, 48],
      topBottom: [51, 49],
      worst: 52,
      confidence: "high",
    },
    corners: { score: 10, confidence: "medium", findings: [] },
    edges: { score: 10, confidence: "medium", findings: [] },
    surface: { score: 10, confidence: "low", findings: [] },
    glareFraction: 0,
    ...overrides,
  };
}

describe("centeringSubgrade", () => {
  it("applies PSA's 55/45 front rule for a 10", () => {
    expect(centeringSubgrade("PSA", 54, 60)).toBe(10);
    expect(centeringSubgrade("PSA", 56, 60)).toBe(9);
    expect(centeringSubgrade("PSA", 63, 60)).toBe(8);
  });

  it("enforces the back threshold too", () => {
    expect(centeringSubgrade("PSA", 54, 74)).toBe(10);
    expect(centeringSubgrade("PSA", 54, 80)).toBe(9); // back worse than 75/25
  });

  it("is stricter for TAG and BGS tens", () => {
    expect(centeringSubgrade("TAG", 52, 50)).toBeLessThan(10);
    expect(centeringSubgrade("TAG", 50.5, 50)).toBe(10);
    expect(centeringSubgrade("BGS", 53, 50)).toBeLessThan(10);
  });

  it("handles missing back measurement", () => {
    expect(centeringSubgrade("PSA", 54, null)).toBe(10);
  });
});

describe("predictCompany", () => {
  it("predicts gem-mint across companies for a flawless card", () => {
    const m: GradingMeasurements = { front: side(), back: side() };
    const all = predictAllCompanies(m);
    const psa = all.find((p) => p.company === "PSA")!;
    const tag = all.find((p) => p.company === "TAG")!;
    expect(psa.mostLikely).toBe(10);
    expect(tag.tagScore).toBeGreaterThanOrEqual(970);
  });

  it("caps the grade at the weak component and names it", () => {
    const m: GradingMeasurements = {
      front: side({ corners: { score: 6, confidence: "medium", findings: [] } }),
      back: side(),
    };
    const psa = predictCompany("PSA", m);
    expect(psa.limitingFactor).toBe("corners");
    expect(psa.mostLikely).toBeLessThanOrEqual(8);
  });

  it("centering-limited card: PSA 9 when front is 58/42", () => {
    const m: GradingMeasurements = {
      front: side({
        centering: { leftRight: [58, 42], topBottom: [52, 48], worst: 58, confidence: "high" },
      }),
      back: side(),
    };
    const psa = predictCompany("PSA", m);
    expect(psa.subgrades.centering).toBe(9);
    expect(psa.mostLikely).toBeLessThanOrEqual(9);
    expect(psa.limitingFactor).toBe("centering");
  });

  it("widens the range when confidence is low", () => {
    const m: GradingMeasurements = {
      front: side({
        centering: { leftRight: [52, 48], topBottom: [51, 49], worst: 52, confidence: "low" },
      }),
      back: null,
    };
    const psa = predictCompany("PSA", m);
    expect(psa.range[1] - psa.range[0]).toBeGreaterThanOrEqual(2);
  });
});

describe("ROI", () => {
  const prediction: CompanyPrediction = {
    company: "PSA",
    mostLikely: 10,
    range: [9, 10],
    confidence: "high",
    limitingFactor: "surface",
    subgrades: { centering: 10, corners: 10, edges: 10, surface: 9.5 },
  };

  it("grade distribution sums to 1", () => {
    const dist = gradeDistribution(prediction);
    const total = [...dist.values()].reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 5);
    expect(dist.get(10)).toBe(0.5);
  });

  it("recommends grading a likely-10 valuable card", () => {
    const roi = computeRoi({ rawValue: 200, prediction });
    // EV = 0.5×200×5 + 0.5×200×1.7 = 670; profit = 670 − 110 − 200 = 360
    expect(roi.expectedValue).toBeCloseTo(670);
    expect(roi.expectedProfit).toBeCloseTo(360);
    expect(roi.recommendation).toBe("grade");
  });

  it("recommends skipping cheap cards regardless of grade", () => {
    const roi = computeRoi({ rawValue: 12, prediction });
    expect(roi.recommendation).toBe("skip");
  });

  it("flags companies with closed submissions", () => {
    const tagPrediction = { ...prediction, company: "TAG" as const };
    const roi = computeRoi({ rawValue: 200, prediction: tagPrediction });
    expect(roi.available).toBe(DEFAULT_FEES.available.TAG);
    expect(roi.available).toBe(false);
  });
});
