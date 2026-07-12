import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, StyleSheet, TextInput, View } from 'react-native';

import { CardListRow } from '@/components/card-list-row';
import { Chip } from '@/components/chip';
import { ProgressBar } from '@/components/progress-bar';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { getSets, searchCards, type SetWithProgress } from '@/db/catalog';
import type { Language } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

type LangFilter = Language | 'all';

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export default function SearchScreen() {
  const theme = useTheme();
  const { data: handle } = useDb();
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<LangFilter>('all');
  const [ownedOnly, setOwnedOnly] = useState(false);
  const debouncedQuery = useDebounced(query, 250);

  const hasCatalog = !!handle?.hasCatalog;
  const trimmed = debouncedQuery.trim();

  const { data: results } = useQuery({
    queryKey: ['search', trimmed, lang, ownedOnly],
    queryFn: () =>
      searchCards(handle!.db, {
        query: trimmed,
        language: lang === 'all' ? undefined : lang,
        ownedOnly,
        ftsAvailable: handle!.ftsAvailable,
        limit: 50,
      }),
    enabled: hasCatalog && trimmed.length > 0,
    placeholderData: (prev) => prev,
  });

  return (
    <Screen title="Search">
      <View style={styles.controls}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Card name, number, or set…"
          placeholderTextColor={theme.textSecondary}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
          style={[
            styles.input,
            {
              backgroundColor: theme.backgroundElement,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
        />
        <View style={styles.chips}>
          <Chip label="All" selected={lang === 'all'} onPress={() => setLang('all')} />
          <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
          <Chip label="日本語" selected={lang === 'ja'} onPress={() => setLang('ja')} />
          <Chip label="Owned" selected={ownedOnly} onPress={() => setOwnedOnly(!ownedOnly)} />
        </View>
      </View>

      {!hasCatalog ? (
        <EmptyState text="Download the card database from the Home tab to start searching." />
      ) : trimmed.length === 0 ? (
        <SetBrowser lang={lang} />
      ) : results && results.length === 0 ? (
        <EmptyState text={`No cards match “${trimmed}”.`} />
      ) : (
        <FlatList
          data={results ?? []}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <CardListRow card={item} />}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </Screen>
  );
}

function SetBrowser({ lang }: { lang: LangFilter }) {
  const { data: handle } = useDb();
  const { data: sets } = useQuery({
    queryKey: ['sets', lang],
    queryFn: () => getSets(handle!.db, lang === 'all' ? undefined : lang),
    enabled: !!handle?.hasCatalog,
    staleTime: 60_000,
  });

  const grouped = useMemo(() => {
    const bySeries = new Map<string, SetWithProgress[]>();
    for (const s of sets ?? []) {
      const key = s.series ?? 'Other';
      const list = bySeries.get(key) ?? [];
      list.push(s);
      bySeries.set(key, list);
    }
    return [...bySeries.entries()].flatMap(([series, list]) => [
      { type: 'header' as const, key: `h:${series}`, series },
      ...list.map((s) => ({ type: 'set' as const, key: s.id, set: s })),
    ]);
  }, [sets]);

  return (
    <FlatList
      data={grouped}
      keyExtractor={(item) => item.key}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) =>
        item.type === 'header' ? (
          <View style={styles.seriesHeader}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {item.series}
            </ThemedText>
          </View>
        ) : (
          <SetRow set={item.set} />
        )
      }
    />
  );
}

function SetRow({ set }: { set: SetWithProgress }) {
  const theme = useTheme();
  const router = useRouter();
  const total = set.total ?? 0;
  const fraction = total > 0 ? set.ownedCount / total : 0;

  return (
    <View style={[styles.setRow, { borderBottomColor: theme.border }]}>
      <View style={{ flex: 1, gap: 4 }}>
        <ThemedText
          numberOfLines={1}
          onPress={() => router.push({ pathname: '/set/[id]', params: { id: set.id } })}>
          {set.name}
          {set.language === 'ja' ? '  🇯🇵' : ''}
        </ThemedText>
        <View style={styles.setMeta}>
          <ThemedText type="small" themeColor="textSecondary">
            {set.releaseDate?.slice(0, 4) ?? '—'} · {set.ownedCount}/{total || '?'}
          </ThemedText>
          <View style={{ flex: 1 }}>
            <ProgressBar fraction={fraction} height={4} />
          </View>
        </View>
      </View>
    </View>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: {
    paddingHorizontal: Spacing.three,
    gap: Spacing.two,
    paddingBottom: Spacing.two,
  },
  input: {
    height: 44,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
  },
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
  },
  seriesHeader: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.one,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  setMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
});
