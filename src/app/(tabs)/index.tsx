import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { getCatalogMeta } from '@/db/catalog';
import { getCollectionCounts } from '@/db/collection';
import { downloadCatalog } from '@/data/catalogDownload';
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
      setError((e as Error).message);
      setProgress(null);
    }
  }, [queryClient]);

  return (
    <Screen>
      <View style={styles.onboarding}>
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
      </View>
    </Screen>
  );
}

function HomeDashboard() {
  const theme = useTheme();
  const router = useRouter();
  const { data: handle } = useDb();

  const { data: meta } = useQuery({
    queryKey: ['catalogMeta'],
    queryFn: () => getCatalogMeta(handle!.db),
    enabled: !!handle?.hasCatalog,
    staleTime: Infinity,
  });

  const { data: counts } = useQuery({
    queryKey: ['collectionCounts'],
    queryFn: () => getCollectionCounts(handle!.db),
    enabled: !!handle,
  });

  return (
    <Screen title="Toreka">
      <View style={{ paddingHorizontal: Spacing.three, gap: Spacing.three }}>
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="small" themeColor="textSecondary">
            Collection
          </ThemedText>
          <ThemedText type="subtitle">{counts?.totalCards ?? 0} cards</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {counts?.distinctCards ?? 0} unique · {counts?.gradedCards ?? 0} graded
          </ThemedText>
        </ThemedView>

        <View style={styles.rowGap}>
          <QuickAction label="Search cards" onPress={() => router.push('/search')} />
          <QuickAction label="My collection" onPress={() => router.push('/collection')} />
        </View>

        <ThemedText type="small" themeColor="textSecondary">
          Catalog v{meta?.version ?? '—'} · {meta?.cardCount.toLocaleString() ?? '…'} cards ·{' '}
          {meta?.setCount ?? '…'} sets
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Portfolio value tracking arrives with price refresh — coming next.
        </ThemedText>
      </View>
    </Screen>
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
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  button: {
    marginTop: Spacing.two,
    alignItems: 'center',
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
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
