import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { GradingReportView } from '@/components/grading-report-view';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getGradingReport } from '@/db/grading';
import { getUsdMarketPrices } from '@/db/prices';
import { useDb } from '@/hooks/use-db';

/** A previously saved grading report. */
export default function GradeReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: handle } = useDb();

  const { data: report } = useQuery({
    queryKey: ['gradingReports', id],
    queryFn: () => getGradingReport(handle!.db, Number(id)),
    enabled: !!handle && !!id,
  });

  const { data: rawValue } = useQuery({
    queryKey: ['rawValue', report?.cardId],
    queryFn: async () => {
      const prices = await getUsdMarketPrices(handle!.db);
      const cardPrices = prices.get(report!.cardId!);
      if (!cardPrices || cardPrices.size === 0) return null;
      return Math.max(...cardPrices.values());
    },
    enabled: !!handle && !!report?.cardId,
  });

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: 'Grade Report' }} />
      {report ? (
        <ScrollView contentContainerStyle={styles.scroll}>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(report.createdAt).toLocaleString()}
          </ThemedText>
          <GradingReportView result={report} rawValue={rawValue ?? null} />
        </ScrollView>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: Spacing.three,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: Spacing.six,
  },
});
