import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, TextInput, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Radius, Spacing } from '@/constants/theme';
import { downloadCatalog, fetchRemoteManifest } from '@/data/catalogDownload';
import { getCatalogMeta } from '@/db/catalog';
import { getSetting, setSetting, SETTING_KEYS } from '@/db/settings';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';
import { useState } from 'react';

export default function MoreScreen() {
  return (
    <Screen title="More">
      <View style={{ paddingHorizontal: Spacing.three, gap: Spacing.three }}>
        <ToolsSection />
        <CatalogSection />
        <ApiKeySection />
        <DataSection />
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

function ToolsSection() {
  const theme = useTheme();
  const router = useRouter();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">Tools</ThemedText>
      <ThemedText
        type="linkPrimary"
        style={{ color: theme.accent }}
        onPress={() => router.push('/trade')}>
        Trade calculator
      </ThemedText>
      <ThemedText
        type="linkPrimary"
        style={{ color: theme.accent }}
        onPress={() => router.push('/grade')}>
        Grade a card (no card link)
      </ThemedText>
    </ThemedView>
  );
}

function ApiKeySection() {
  const theme = useTheme();
  const { data: handle } = useDb();
  const [draft, setDraft] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const { data: stored } = useQuery({
    queryKey: ['setting', SETTING_KEYS.pokemonTcgIoApiKey],
    queryFn: () => getSetting(handle!.db, SETTING_KEYS.pokemonTcgIoApiKey),
    enabled: !!handle,
  });

  const value = draft ?? stored ?? '';

  const save = useMutation({
    mutationFn: () => setSetting(handle!.db, SETTING_KEYS.pokemonTcgIoApiKey, value.trim()),
    onSuccess: () => setSaved(true),
  });

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">pokemontcg.io API key</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Optional but recommended — raises the price-refresh rate limit. Free signup at
        dev.pokemontcg.io.
      </ThemedText>
      <TextInput
        value={value}
        onChangeText={(t) => {
          setDraft(t);
          setSaved(false);
        }}
        placeholder="paste key here"
        placeholderTextColor={theme.textSecondary}
        autoCapitalize="none"
        autoCorrect={false}
        style={[
          styles.input,
          { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
        ]}
      />
      <ThemedText type="linkPrimary" style={{ color: theme.accent }} onPress={() => save.mutate()}>
        {saved ? 'Saved ✓' : 'Save key'}
      </ThemedText>
    </ThemedView>
  );
}

function DataSection() {
  const theme = useTheme();
  const { data: handle } = useDb();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<string | null>(null);

  const run = async (fn: () => Promise<string>) => {
    try {
      setStatus(null);
      setStatus(await fn());
    } catch (e) {
      setStatus(`Failed: ${(e as Error).message}`);
    }
  };

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">Your data</ThemedText>
      <ThemedText
        type="linkPrimary"
        style={{ color: theme.accent }}
        onPress={() =>
          run(async () => {
            const { exportCollectionCsvFile } = await import('@/data/backup');
            const n = await exportCollectionCsvFile(handle!.db);
            return `Exported ${n} entries.`;
          })
        }>
        Export collection as CSV
      </ThemedText>
      <ThemedText
        type="linkPrimary"
        style={{ color: theme.accent }}
        onPress={() =>
          run(async () => {
            const { importCollectionCsvFile } = await import('@/data/backup');
            const report = await importCollectionCsvFile(handle!.db);
            if (!report) return 'Import cancelled.';
            await queryClient.invalidateQueries();
            const skipped = report.skipped.length > 0 ? ` (${report.skipped.length} skipped)` : '';
            return `Imported ${report.imported} entries${skipped}.`;
          })
        }>
        Import collection from CSV
      </ThemedText>
      <ThemedText
        type="linkPrimary"
        style={{ color: theme.accent }}
        onPress={() =>
          run(async () => {
            const { backupUserDatabase } = await import('@/data/backup');
            await backupUserDatabase(handle!.db);
            return 'Backup shared.';
          })
        }>
        Back up database
      </ThemedText>
      {status ? (
        <ThemedText type="small" themeColor="textSecondary">
          {status}
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
  input: {
    height: 40,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
});
