import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { CARD_ASPECT, Radius, Spacing } from '@/constants/theme';
import { downloadCatalog } from '@/data/catalogDownload';
import { refreshPrices } from '@/data/priceRefresh';
import { getCatalogMeta } from '@/db/catalog';
import { getCollectionCounts } from '@/db/collection';
import { getSetting, SETTING_KEYS } from '@/db/settings';
import {
  computePortfolio,
  getSnapshots,
  writeDailySnapshotIfNeeded,
  type TopItem,
} from '@/portfolio/valuation';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

export default function HomeScreen() {
  const { data: handle, isLoading } = useDb();

  if (isLoading || !handle) {
    return (
      <Screen title="Toreka">
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!handle.hasCatalog) {
    return <CatalogOnboarding />;
  }

  return <HomeDashboard />;
}

function CatalogOnboarding() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(async () => {
    setError(null);
    setProgress(0);
    try {
      await downloadCatalog((f) => setProgress(f));
      await queryClient.invalidateQueries();
    } catch (e) {
      const msg = (e as Error).message;
      setError(msg.length > 200 ? `${msg.slice(0, 200)}…` : msg);
      setProgress(null);
    }
  }, [queryClient]);

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.onboarding}>
        <ThemedText type="title" themeColor="accent">
          Toreka
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary" style={styles.centerText}>
          Your Pokémon collection, graded and priced.{'\n'}One download to get started.
        </ThemedText>

        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">Card database</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            26,000+ cards · English + Japanese · ~13 MB
          </ThemedText>

          {progress === null ? (
            <Pressable
              onPress={start}
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: theme.accent },
                pressed && { opacity: 0.8 },
              ]}>
              <ThemedText type="smallBold" style={{ color: '#14100A' }}>
                Download
              </ThemedText>
            </Pressable>
          ) : (
            <View style={{ gap: Spacing.two, marginTop: Spacing.two }}>
              <ProgressBar fraction={progress < 0 ? 0.5 : progress} />
              <ThemedText type="small" themeColor="textSecondary">
                {progress < 0 ? 'Downloading…' : `${Math.round(progress * 100)}%`}
              </ThemedText>
            </View>
          )}

          {error ? (
            <ThemedText type="small" style={{ color: theme.negative }}>
              {error}
            </ThemedText>
          ) : null}
        </ThemedView>
      </ScrollView>
    </Screen>
  );
}

function HomeDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { data: handle } = useDb();
  const queryClient = useQueryClient();

  // Ensure a snapshot exists for today (cheap; no network).
  useEffect(() => {
    if (handle) {
      writeDailySnapshotIfNeeded(handle.db).then((wrote) => {
        if (wrote) queryClient.invalidateQueries({ queryKey: ['snapshots'] });
      });
    }
  }, [handle, queryClient]);

  const { data: portfolio } = useQuery({
    queryKey: ['portfolio'],
    queryFn: () => computePortfolio(handle!.db),
    enabled: !!handle,
  });

  const { data: snapshots } = useQuery({
    queryKey: ['snapshots'],
    queryFn: () => getSnapshots(handle!.db, 90),
    enabled: !!handle,
  });

  const { data: counts } = useQuery({
    queryKey: ['collectionCounts'],
    queryFn: () => getCollectionCounts(handle!.db),
    enabled: !!handle,
  });

  const { data: lastRefresh } = useQuery({
    queryKey: ['lastPriceRefresh'],
    queryFn: () => getSetting(handle!.db, SETTING_KEYS.lastPriceRefresh),
    enabled: !!handle,
  });

  const { data: meta } = useQuery({
    queryKey: ['catalogMeta'],
    queryFn: () => getCatalogMeta(handle!.db),
    enabled: !!handle?.hasCatalog,
    staleTime: Infinity,
  });

  const refresh = useMutation({
    mutationFn: async () => {
      const result = await refreshPrices(handle!.db);
      const { notifyTriggeredAlerts } = await import('@/data/notify');
      await notifyTriggeredAlerts(result.triggeredAlerts);
      return result;
    },
    onSuccess: () => {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries();
    },
  });

  const totalWithSealed = (portfolio?.totalValue ?? 0) + (portfolio?.sealedValue ?? 0);
  const costWithSealed = (portfolio?.costBasis ?? 0) + (portfolio?.sealedCost ?? 0);
  const gain = totalWithSealed - costWithSealed;
  const gainPct = costWithSealed > 0 ? (gain / costWithSealed) * 100 : null;

  return (
    <Screen title="Toreka">
      <ScrollView
        contentContainerStyle={styles.dashboard}
        refreshControl={
          <RefreshControl
            refreshing={refresh.isPending}
            onRefresh={() => refresh.mutate()}
            tintColor={theme.accent}
          />
        }>
        {/* Hero: portfolio value */}
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Portfolio value
          </ThemedText>
          <ThemedText type="title" style={styles.heroValue}>
            ${totalWithSealed.toFixed(2)}
          </ThemedText>
          {costWithSealed > 0 ? (
            <ThemedText
              type="smallBold"
              style={{ color: gain >= 0 ? theme.positive : theme.negative }}>
              {gain >= 0 ? '▲' : '▼'} ${Math.abs(gain).toFixed(2)}
              {gainPct != null ? ` (${gainPct >= 0 ? '+' : ''}${gainPct.toFixed(1)}%)` : ''} vs cost
            </ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {counts?.totalCards ?? 0} cards · {counts?.gradedCards ?? 0} graded
            {portfolio?.sealedValue ? ` · sealed $${portfolio.sealedValue.toFixed(0)}` : ''}
            {portfolio && portfolio.unpricedCount > 0
              ? ` · ${portfolio.unpricedCount} unpriced`
              : ''}
          </ThemedText>
        </ThemedView>

        {/* Value over time */}
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="smallBold">Value over time</ThemedText>
          <TimeSeriesChart
            points={(snapshots ?? []).map((s) => ({ date: s.date, value: s.totalValue }))}
          />
        </ThemedView>

        {/* Refresh prices */}
        <Pressable
          onPress={() => refresh.mutate()}
          disabled={refresh.isPending}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: theme.accent },
            (pressed || refresh.isPending) && { opacity: 0.7 },
          ]}>
          <ThemedText type="smallBold" style={{ color: '#14100A' }}>
            {refresh.isPending ? 'Refreshing prices…' : 'Refresh prices'}
          </ThemedText>
        </Pressable>
        {refresh.isError ? (
          <ThemedText type="small" style={{ color: theme.negative }}>
            {(refresh.error as Error).message}
          </ThemedText>
        ) : null}
        <ThemedText type="small" themeColor="textSecondary">
          {lastRefresh
            ? `Prices updated ${new Date(lastRefresh).toLocaleString()}`
            : 'Prices update for owned + wishlisted cards. Pull down or tap refresh.'}
        </ThemedText>

        {/* Language breakdown */}
        {portfolio && (portfolio.byLanguage.en > 0 || portfolio.byLanguage.ja > 0) ? (
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">By language</ThemedText>
            <BreakdownRow label="English" value={portfolio.byLanguage.en} total={portfolio.totalValue} />
            <BreakdownRow label="日本語" value={portfolio.byLanguage.ja} total={portfolio.totalValue} />
          </ThemedView>
        ) : null}

        {/* Most valuable */}
        {portfolio && portfolio.topItems.length > 0 ? (
          <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
            <ThemedText type="smallBold">Most valuable</ThemedText>
            {portfolio.topItems.map((item) => (
              <TopItemRow key={`${item.cardId}-${item.gradeLabel ?? 'raw'}-${item.unitValue}`} item={item} />
            ))}
          </ThemedView>
        ) : null}

        {/* Empty-collection guidance */}
        {counts && counts.totalCards === 0 ? (
          <View style={styles.rowGap}>
            <QuickAction label="Search cards" onPress={() => router.push('/search')} />
            <QuickAction label="My collection" onPress={() => router.push('/collection')} />
          </View>
        ) : null}

        <ThemedText type="small" themeColor="textSecondary">
          Catalog v{meta?.version ?? '—'} · {meta?.cardCount.toLocaleString() ?? '…'} cards ·{' '}
          {meta?.setCount ?? '…'} sets
        </ThemedText>
      </ScrollView>
    </Screen>
  );
}

function BreakdownRow({ label, value, total }: { label: string; value: number; total: number }) {
  return (
    <View style={styles.breakdownRow}>
      <ThemedText type="small" style={{ width: 76 }}>
        {label}
      </ThemedText>
      <View style={{ flex: 1 }}>
        <ProgressBar fraction={total > 0 ? value / total : 0} height={5} />
      </View>
      <ThemedText type="small" themeColor="textSecondary" style={styles.breakdownValue}>
        ${value.toFixed(0)}
      </ThemedText>
    </View>
  );
}

function TopItemRow({ item }: { item: TopItem }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.cardId } })}
      style={({ pressed }) => [styles.topRow, pressed && { opacity: 0.7 }]}>
      <View style={[styles.topThumb, { backgroundColor: theme.imageBg }]}>
        {item.imageSmall ? (
          <Image source={item.imageSmall} style={{ flex: 1 }} contentFit="contain" />
        ) : null}
      </View>
      <View style={{ flex: 1 }}>
        <ThemedText type="small" numberOfLines={1}>
          {item.quantity > 1 ? `${item.quantity}× ` : ''}
          {item.name}
          {item.gradeLabel ? `  ·  ${item.gradeLabel}` : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.setName}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">${item.totalValue.toFixed(2)}</ThemedText>
    </Pressable>
  );
}

function QuickAction({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickAction,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText type="smallBold">{label}</ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  centerText: { textAlign: 'center' },
  onboarding: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.five,
  },
  dashboard: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.three,
    paddingBottom: Spacing.six,
  },
  card: {
    width: '100%',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  heroValue: {
    fontSize: 40,
    lineHeight: 46,
  },
  button: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: 2,
  },
  breakdownValue: {
    minWidth: 56,
    textAlign: 'right',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  topThumb: {
    height: 40,
    width: 40 * CARD_ASPECT,
    borderRadius: 4,
    overflow: 'hidden',
  },
  rowGap: { flexDirection: 'row', gap: Spacing.two },
  quickAction: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
