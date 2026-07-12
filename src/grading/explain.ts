import type { CompanyPrediction, GradingExplanation, GradingMeasurements } from "./types";

const FACTOR_NAMES: Record<CompanyPrediction["limitingFactor"], string> = {
  centering: "Centering",
  corners: "Corners",
  edges: "Edges",
  surface: "Surface",
};

/** Build the human-readable report from measurements + predictions. */
export function buildExplanation(
  m: GradingMeasurements,
  predictions: CompanyPrediction[],
): GradingExplanation {
  const psa = predictions.find((p) => p.company === "PSA");
  const headline = psa
    ? `Most likely PSA ${psa.mostLikely} (range ${psa.range[0]}–${psa.range[1]}) — ${FACTOR_NAMES[psa.limitingFactor].toLowerCase()} is the limiting factor.`
    : "Grading estimate ready.";

  const sections: GradingExplanation["sections"] = [];

  // Centering
  const c = m.front.centering;
  if (c) {
    const back = m.back?.centering;
    sections.push({
      title: "Centering",
      body:
        `Front measures ${c.leftRight[0]}/${c.leftRight[1]} left-right and ${c.topBottom[0]}/${c.topBottom[1]} top-bottom` +
        (back
          ? `; back measures ${back.leftRight[0]}/${back.leftRight[1]} and ${back.topBottom[0]}/${back.topBottom[1]}.`
          : ' (no back photo — back centering assumed acceptable).') +
        ` PSA 10 allows up to 55/45 on the front; BGS 9.5 up to 55/45; TAG 10 is stricter at ~51/49.` +
        ` Measurement confidence: ${c.confidence}.`,
    });
  } else {
    sections.push({
      title: "Centering",
      body: "The artwork frame couldn't be located reliably, so centering wasn't measured — full-art and borderless cards defeat geometric centering checks. Companies still grade it; treat predictions as wider than shown.",
    });
  }

  // Corners
  sections.push({
    title: "Corners",
    body: `${m.front.corners.findings.join(" ")} ${
      m.back ? m.back.corners.findings.join(" ") : ""
    }Score ${m.front.corners.score}/10 (photo-based, ${m.front.corners.confidence} confidence) — graders inspect under magnification, so light fraying can hide from a phone photo.`,
  });

  // Edges
  sections.push({
    title: "Edges",
    body: `${m.front.edges.findings.join(" ")} Score ${m.front.edges.score}/10 (${m.front.edges.confidence} confidence).`,
  });

  // Surface
  sections.push({
    title: "Surface",
    body: `${m.front.surface.findings.join(" ")} Surface is the hardest component to judge from a photo — scratches, clouding and print lines often only show under angled light. Treat this as a floor, not a ceiling.`,
  });

  const caveats = [
    "This is a photo-based estimate, not a guarantee — professional graders use magnification, angled light and touch.",
    "Centering is measured geometrically and is the most reliable number here.",
  ];
  if (m.front.glareFraction > 0.02) {
    caveats.push("Glare detected in the photo — surface and edge reads are less reliable. Retake in diffuse light if possible.");
  }
  if (!m.back) {
    caveats.push("No back photo was provided; back condition is assumed clean, which inflates the estimate.");
  }

  return { headline, sections, caveats };
}
