import { decode as decodeJpeg } from "jpeg-js";

import { buildExplanation } from "./explain";
import { analyzeSide } from "./metrics";
import { predictAllCompanies } from "./rulebook";
import type { CompanyPrediction, GradingExplanation, GradingMeasurements } from "./types";
import { grayscaleFromRgba } from "../scanner/hash";
import { base64ToBytes } from "../scanner/photo";

export interface AnalysisResult {
  measurements: GradingMeasurements;
  predictions: CompanyPrediction[];
  explanation: GradingExplanation;
}

function sideFromBase64(b64: string) {
  const bytes = base64ToBytes(b64);
  const { data, width, height } = decodeJpeg(bytes, { useTArray: true });
  const gray = grayscaleFromRgba(data, width, height);
  return analyzeSide(gray, width, height);
}

/**
 * Full grading analysis from base64 JPEGs of the card (already cropped to the
 * card's bounds by the capture UI).
 */
export function analyzeCardPhotos(frontB64: string, backB64: string | null): AnalysisResult {
  const measurements: GradingMeasurements = {
    front: sideFromBase64(frontB64),
    back: backB64 ? sideFromBase64(backB64) : null,
  };
  const predictions = predictAllCompanies(measurements);
  const explanation = buildExplanation(measurements, predictions);
  return { measurements, predictions, explanation };
}
