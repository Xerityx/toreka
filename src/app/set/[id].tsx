import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CARD_ASPECT, Radius, Spacing } from '@/constants/theme';
import { getSet, getSetCards } from '@/db/catalog';
import type { CardSummary } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

const NUM_COLUMNS = 3;

export default function SetDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: handle } = useDb();

  const { data: set } = useQuery({
    queryKey: ['set', id],
    queryFn: () => getSet(handle!.db, id!),
    enabled: !!handle?.hasCatalog && !!id,
  });

  const { data: cards } = useQuery({
    queryKey: ['setCards', id],
    queryFn: () => getSetCards(handle!.db, id!),
    enabled: !!handle?.hasCatalog && !!id,
  });

  const owned = cards?.filter((c) => c.ownedQuantity > 0).length ?? 0;
  const total = cards?.length ?? 0;

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: set?.name ?? 'Set' }} />
      <FlatList
        data={cards ?? []}
        numColumns={NUM_COLUMNS}
        keyExtractor={(item) => item.id}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        ListHeaderComponent={
          <View style={styles.header}>
            <ThemedText type="small" themeColor="textSecondary">
              {set?.releaseDate ?? ''}
              {set?.series ? ` · ${set.series}` : ''}
            </ThemedText>
            <View style={styles.progressRow}>
              <ThemedText type="smallBold">
                {owned}/{total}
              </ThemedText>
              <View style={{ flex: 1 }}>
                <ProgressBar fraction={total > 0 ? owned / total : 0} />
              </View>
              <ThemedText type="small" themeColor="textSecondary">
                {total > 0 ? Math.round((owned / total) * 100) : 0}%
              </ThemedText>
            </View>
          </View>
        }
        renderItem={({ item }) => <GridCard card={item} />}
      />
    </ThemedView>
  );
}

function GridCard({ card }: { card: CardSummary }) {
  const theme = useTheme();
  const router = useRouter();
  const owned = card.ownedQuantity > 0;

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
      style={({ pressed }) => [styles.cell, pressed && { opacity: 0.7 }]}>
      <View
        style={[
          styles.cellImage,
          { backgroundColor: theme.imageBg },
          !owned && styles.unownedImage,
        ]}>
        {card.imageSmall ? (
          <Image source={card.imageSmall} style={{ flex: 1 }} contentFit="contain" transition={100} />
        ) : (
          <View style={styles.noImage}>
            <ThemedText type="small" themeColor="textSecondary">
              #{card.number}
            </ThemedText>
          </View>
        )}
        {owned ? (
          <View style={[styles.ownedDot, { backgroundColor: theme.accent }]}>
            <ThemedText type="small" style={{ color: '#14100A', fontSize: 10, lineHeight: 14 }}>
              ✓
            </ThemedText>
          </View>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.cellLabel}>
        #{card.number} {card.name}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  grid: { padding: Spacing.two },
  gridRow: { gap: Spacing.two, paddingBottom: Spacing.two },
  header: {
    padding: Spacing.two,
    gap: Spacing.two,
    paddingBottom: Spacing.three,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  cell: {
    flex: 1 / NUM_COLUMNS,
  },
  cellImage: {
    aspectRatio: CARD_ASPECT,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  unownedImage: {
    opacity: 0.45,
  },
  noImage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownedDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: {
    marginTop: 4,
    textAlign: 'center',
  },
});
