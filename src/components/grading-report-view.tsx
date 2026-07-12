import { StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Radius, Spacing } from '@/constants/theme';
import { computeRoi } from '@/grading/roi';
import type { AnalysisResult } from '@/grading/analyze';
import type { CompanyPrediction, Confidence } from '@/grading/types';
import { useTheme } from '@/hooks/use-theme';

const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

/** Renders a full grading analysis (fresh or stored). */
export function GradingReportView({
  result,
  rawValue,
}: {
  result: Pick<AnalysisResult, 'measurements' | 'predictions' | 'explanation'>;
  /** Raw USD market value, when known — enables the ROI section. */
  rawValue: number | null;
}) {
  const theme = useTheme();
  const { predictions, explanation } = result;

  return (
    <View style={styles.root}>
      <ThemedText type="smallBold">{explanation.headline}</ThemedText>

      {/* Per-company grade cards */}
      <View style={styles.grid}>
        {predictions.map((p) => (
          <PredictionCard key={p.company} prediction={p} />
        ))}
      </View>

      {/* Component sections */}
      {explanation.sections.map((s) => (
        <View key={s.title} style={styles.section}>
          <ThemedText type="smallBold">{s.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {s.body}
          </ThemedText>
        </View>
      ))}

      {/* ROI */}
      {rawValue != null && rawValue > 0 ? (
        <View style={styles.section}>
          <ThemedText type="smallBold">Worth grading? (raw ≈ ${rawValue.toFixed(2)})</ThemedText>
          {predictions.map((p) => {
            const roi = computeRoi({ rawValue, prediction: p });
            const color =
              roi.recommendation === 'grade'
                ? theme.positive
                : roi.recommendation === 'borderline'
                  ? theme.accent
                  : theme.textSecondary;
            return (
              <View key={p.company} style={[styles.roiRow, { borderBottomColor: theme.border }]}>
                <ThemedText type="small" style={{ width: 44 }}>
                  {p.company}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
                  fee ${roi.fee} · EV ${roi.expectedValue.toFixed(0)} ·{' '}
                  {roi.expectedProfit >= 0 ? '+' : '−'}${Math.abs(roi.expectedProfit).toFixed(0)}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color }}>
                  {roi.available
                    ? roi.recommendation === 'grade'
                      ? 'Grade it'
                      : roi.recommendation === 'borderline'
                        ? 'Borderline'
                        : 'Skip'
                    : 'Closed'}
                </ThemedText>
              </View>
            );
          })}
          <ThemedText type="small" themeColor="textSecondary">
            EV = probability-weighted graded value. Fees are editable estimates (all-in, per card).
          </ThemedText>
        </View>
      ) : (
        <ThemedText type="small" themeColor="textSecondary">
          No market price for this card yet — refresh prices to unlock the grading ROI estimate.
        </ThemedText>
      )}

      {/* Caveats */}
      <View
        style={[styles.caveats, { backgroundColor: theme.accentSoft, borderColor: theme.accent }]}>
        {explanation.caveats.map((c, i) => (
          <ThemedText key={i} type="small" themeColor="textSecondary">
            • {c}
          </ThemedText>
        ))}
      </View>
    </View>
  );
}

function PredictionCard({ prediction: p }: { prediction: CompanyPrediction }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.predCard, { borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {p.company}
      </ThemedText>
      <ThemedText type="subtitle" style={{ lineHeight: 38 }}>
        {p.mostLikely}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        range {p.range[0]}–{p.range[1]}
        {p.tagScore != null ? ` · ${p.tagScore}/1000` : ''}
      </ThemedText>
      <ThemedText type="small" style={{ color: theme.accent }}>
        {CONFIDENCE_LABEL[p.confidence]}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { gap: Spacing.three },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  predCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two + 2,
    gap: 2,
  },
  section: { gap: Spacing.one },
  roiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  caveats: {
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two + 2,
    gap: 4,
  },
});
