import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { listCollection, type CollectionEntry } from '@/db/collection';
import type { Language } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

type LangFilter = Language | 'all';

export default function CollectionScreen() {
  const { data: handle } = useDb();
  const [lang, setLang] = useState<LangFilter>('all');
  const [gradedOnly, setGradedOnly] = useState(false);

  const { data: entries } = useQuery({
    queryKey: ['collection', lang, gradedOnly],
    queryFn: () =>
      listCollection(handle!.db, {
        language: lang === 'all' ? undefined : lang,
        gradedOnly,
      }),
    enabled: !!handle?.hasCatalog,
  });

  return (
    <Screen title="Collection">
      <View style={styles.chips}>
        <Chip label="All" selected={lang === 'all'} onPress={() => setLang('all')} />
        <Chip label="English" selected={lang === 'en'} onPress={() => setLang('en')} />
        <Chip label="日本語" selected={lang === 'ja'} onPress={() => setLang('ja')} />
        <Chip label="Graded" selected={gradedOnly} onPress={() => setGradedOnly(!gradedOnly)} />
      </View>

      {!entries || entries.length === 0 ? (
        <View style={styles.empty}>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Nothing here yet. Find cards in Search (or scan them) and add them to your collection.
          </ThemedText>
        </View>
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CollectionRow entry={item} />}
        />
      )}
    </Screen>
  );
}

function CollectionRow({ entry }: { entry: CollectionEntry }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: entry.cardId } })}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText numberOfLines={1}>
          {entry.quantity > 1 ? `${entry.quantity}× ` : ''}
          {entry.cardName}
          {entry.language === 'ja' ? '  🇯🇵' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {entry.setName} · #{entry.cardNumber} ·{' '}
          {entry.isGraded
            ? `${entry.gradeCompany ?? ''} ${entry.gradeValue ?? ''}`.trim()
            : entry.condition}
          {entry.storageLocation ? ` · ${entry.storageLocation}` : ''}
        </ThemedText>
      </View>
      {entry.isGraded ? (
        <View style={[styles.gradeBadge, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            {entry.gradeValue ?? '—'}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    gap: Spacing.two,
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.five,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  gradeBadge: {
    minWidth: 36,
    alignItems: 'center',
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
