import type { SqlDb } from "./sql";
import type { CompanyPrediction, GradingExplanation, GradingMeasurements } from "../grading/types";

export interface StoredGradingReport {
  id: number;
  cardId: string | null;
  frontUri: string;
  backUri: string | null;
  measurements: GradingMeasurements;
  predictions: CompanyPrediction[];
  explanation: GradingExplanation;
  createdAt: string;
}

export async function insertGradingReport(
  db: SqlDb,
  report: Omit<StoredGradingReport, "id" | "createdAt">,
): Promise<number> {
  const res = await db.run(
    `INSERT INTO grading_reports (card_id, front_uri, back_uri, measurements, predictions, explanation, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      report.cardId,
      report.frontUri,
      report.backUri,
      JSON.stringify(report.measurements),
      JSON.stringify(report.predictions),
      JSON.stringify(report.explanation),
      new Date().toISOString(),
    ],
  );
  return res.lastInsertRowId;
}

interface Row {
  id: number;
  card_id: string | null;
  front_uri: string;
  back_uri: string | null;
  measurements: string;
  predictions: string;
  explanation: string;
  created_at: string;
}

function mapRow(r: Row): StoredGradingReport {
  return {
    id: r.id,
    cardId: r.card_id,
    frontUri: r.front_uri,
    backUri: r.back_uri,
    measurements: JSON.parse(r.measurements) as GradingMeasurements,
    predictions: JSON.parse(r.predictions) as CompanyPrediction[],
    explanation: JSON.parse(r.explanation) as GradingExplanation,
    createdAt: r.created_at,
  };
}

const SELECT = `
  SELECT id, card_id, front_uri, back_uri, measurements, predictions, explanation, created_at
  FROM grading_reports
`;

export async function getGradingReport(db: SqlDb, id: number): Promise<StoredGradingReport | null> {
  const row = await db.get<Row>(`${SELECT} WHERE id = ?`, [id]);
  return row ? mapRow(row) : null;
}

export async function listGradingReportsForCard(
  db: SqlDb,
  cardId: string,
): Promise<StoredGradingReport[]> {
  const rows = await db.all<Row>(`${SELECT} WHERE card_id = ? ORDER BY created_at DESC`, [cardId]);
  return rows.map(mapRow);
}

export async function deleteGradingReport(db: SqlDb, id: number): Promise<void> {
  await db.run("DELETE FROM grading_reports WHERE id = ?", [id]);
}
