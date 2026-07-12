import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { downloadCatalog, fetchRemoteManifest } from '@/data/catalogDownload';
import { getCatalogMeta } from '@/db/catalog';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';
import { useState } from 'react';

export default function MoreScreen() {
  return (
    <Screen title="More">
      <View style={{ paddingHorizontal: Spacing.three, gap: Spacing.three }}>
        <CatalogSection />
        <AboutSection />
      </View>
    </Screen>
  );
}

function CatalogSection() {
  const theme = useTheme();
  const { data: handle } = useDb();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<number | null>(null);

  const { data: meta } = useQuery({
    queryKey: ['catalogMeta'],
    queryFn: () => getCatalogMeta(handle!.db),
    enabled: !!handle?.hasCatalog,
    staleTime: Infinity,
  });

  const { data: remote } = useQuery({
    queryKey: ['remoteManifest'],
    queryFn: fetchRemoteManifest,
    staleTime: 10 * 60_000,
  });

  const update = useMutation({
    mutationFn: async () => {
      setProgress(0);
      await downloadCatalog((f) => setProgress(f));
    },
    onSettled: async () => {
      setProgress(null);
      await queryClient.invalidateQueries();
    },
  });

  const updateAvailable = remote && meta && remote.version !== meta.version;

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">Card database</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {handle?.hasCatalog
          ? `v${meta?.version ?? '…'} · ${meta?.cardCount.toLocaleString() ?? '…'} cards · ${meta?.setCount ?? '…'} sets`
          : 'Not downloaded yet'}
      </ThemedText>
      {remote ? (
        <ThemedText type="small" themeColor="textSecondary">
          Latest available: v{remote.version}
        </ThemedText>
      ) : null}

      {progress !== null ? (
        <ProgressBar fraction={progress < 0 ? 0.5 : progress} />
      ) : (
        <ThemedText
          type="linkPrimary"
          style={{ color: theme.accent }}
          onPress={() => update.mutate()}>
          {handle?.hasCatalog
            ? updateAvailable
              ? 'Update available — download now'
              : 'Re-download catalog'
            : 'Download catalog'}
        </ThemedText>
      )}
      {update.isError ? (
        <ThemedText type="small" style={{ color: theme.negative }}>
          {(update.error as Error).message}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

function AboutSection() {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">Toreka</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Personal collection tracker for Pokémon TCG (EN + 日本語).{'\n'}
        Card data: pokemontcg.io & TCGdex. Prices, scanning and grade prediction land in upcoming
        builds.
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
});
