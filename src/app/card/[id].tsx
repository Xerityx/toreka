import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CARD_ASPECT, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { getCard } from '@/db/catalog';
import { addCollectionItem, deleteCollectionItem, getItemsForCard, updateCollectionItem } from '@/db/collection';
import type { CollectionItem } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const { data: handle } = useDb();
  const queryClient = useQueryClient();

  const { data: card } = useQuery({
    queryKey: ['card', id],
    queryFn: () => getCard(handle!.db, id!),
    enabled: !!handle?.hasCatalog && !!id,
  });

  const { data: copies } = useQuery({
    queryKey: ['copies', id],
    queryFn: () => getItemsForCard(handle!.db, id!),
    enabled: !!handle && !!id,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['copies', id] });
    queryClient.invalidateQueries({ queryKey: ['card', id] });
    queryClient.invalidateQueries({ queryKey: ['collection'] });
    queryClient.invalidateQueries({ queryKey: ['collectionCounts'] });
    queryClient.invalidateQueries({ queryKey: ['search'] });
    queryClient.invalidateQueries({ queryKey: ['sets'] });
    queryClient.invalidateQueries({ queryKey: ['setCards'] });
  };

  const addCopy = useMutation({
    mutationFn: () =>
      addCollectionItem(handle!.db, { cardId: id!, language: card?.language ?? 'en' }),
    onSuccess: () => {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidate();
    },
  });

  if (!card) {
    return (
      <ThemedView style={styles.root}>
        <Stack.Screen options={{ title: 'Card' }} />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: card.name }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={[styles.imageWrap, { backgroundColor: theme.imageBg }]}>
          {card.imageLarge || card.imageSmall ? (
            <Image
              source={card.imageLarge ?? card.imageSmall}
              style={styles.image}
              contentFit="contain"
              transition={200}
            />
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No image available
            </ThemedText>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="subtitle">{card.name}</ThemedText>
          {card.nameLocal && card.nameLocal !== card.name ? (
            <ThemedText themeColor="textSecondary">{card.nameLocal}</ThemedText>
          ) : null}
          <ThemedText type="small" themeColor="textSecondary">
            {card.setName} · #{card.number}
            {card.setPrintedTotal ? `/${card.setPrintedTotal}` : ''}
            {card.rarity ? ` · ${card.rarity}` : ''} · {card.language === 'ja' ? '日本語' : 'English'}
          </ThemedText>
        </View>

        <Pressable
          onPress={() => addCopy.mutate()}
          disabled={addCopy.isPending}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: theme.accent },
            (pressed || addCopy.isPending) && { opacity: 0.75 },
          ]}>
          <ThemedText type="smallBold" style={{ color: '#14100A' }}>
            {card.ownedQuantity > 0 ? 'Add another copy' : 'Add to collection'}
          </ThemedText>
        </Pressable>

        {copies && copies.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Your copies</ThemedText>
            {copies.map((copy) => (
              <CopyRow key={copy.id} copy={copy} cardId={id!} onChanged={invalidate} />
            ))}
          </View>
        ) : null}

        <View style={styles.section}>
          <ThemedText type="smallBold">Prices</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Market prices arrive with the price-refresh update.
          </ThemedText>
        </View>
      </ScrollView>
    </ThemedView>
  );
}

function CopyRow({
  copy,
  cardId,
  onChanged,
}: {
  copy: CollectionItem;
  cardId: string;
  onChanged: () => void;
}) {
  void cardId;
  const theme = useTheme();
  const { data: handle } = useDb();

  const bump = useMutation({
    mutationFn: (delta: number) =>
      copy.quantity + delta <= 0
        ? deleteCollectionItem(handle!.db, copy.id)
        : updateCollectionItem(handle!.db, copy.id, { quantity: copy.quantity + delta }),
    onSuccess: onChanged,
  });

  return (
    <View style={[styles.copyRow, { borderColor: theme.border }]}>
      <View style={{ flex: 1 }}>
        <ThemedText type="small">
          {copy.isGraded
            ? `${copy.gradeCompany ?? ''} ${copy.gradeValue ?? ''}`.trim()
            : `${copy.condition} · ${copy.variant}`}
        </ThemedText>
        {copy.storageLocation ? (
          <ThemedText type="small" themeColor="textSecondary">
            {copy.storageLocation}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.stepper}>
        <Pressable onPress={() => bump.mutate(-1)} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            −
          </ThemedText>
        </Pressable>
        <ThemedText type="smallBold">{copy.quantity}</ThemedText>
        <Pressable onPress={() => bump.mutate(+1)} hitSlop={8}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            +
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  imageWrap: {
    alignSelf: 'center',
    width: '62%',
    aspectRatio: CARD_ASPECT,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  section: { gap: Spacing.one },
  addButton: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.md,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.two,
  },
});
