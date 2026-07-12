import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CARD_ASPECT, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { getCard } from '@/db/catalog';
import { deleteCollectionItem, getItemsForCard, updateCollectionItem } from '@/db/collection';
import type { CollectionItem } from '@/db/types';
import { isWanted, toggleWant } from '@/db/wantlist';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

export default function CardDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const router = useRouter();
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

  const { data: wanted } = useQuery({
    queryKey: ['wanted', id],
    queryFn: () => isWanted(handle!.db, id!),
    enabled: !!handle && !!id,
  });

  const invalidate = () => queryClient.invalidateQueries();

  const want = useMutation({
    mutationFn: () => toggleWant(handle!.db, id!),
    onSuccess: (nowWanted) => {
      if (Platform.OS === 'ios') {
        Haptics.impactAsync(
          nowWanted ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
        );
      }
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
      <Stack.Screen
        options={{
          title: card.name,
          headerRight: () => (
            <Pressable onPress={() => want.mutate()} hitSlop={10}>
              <ThemedText type="subtitle" style={{ color: theme.accent, lineHeight: 30 }}>
                {wanted ? '♥' : '♡'}
              </ThemedText>
            </Pressable>
          ),
        }}
      />
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
          onPress={() => router.push({ pathname: '/edit-copy', params: { cardId: id! } })}
          style={({ pressed }) => [
            styles.addButton,
            { backgroundColor: theme.accent },
            pressed && { opacity: 0.75 },
          ]}>
          <ThemedText type="smallBold" style={{ color: '#14100A' }}>
            {card.ownedQuantity > 0 ? 'Add another copy' : 'Add to collection'}
          </ThemedText>
        </Pressable>

        {copies && copies.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Your copies</ThemedText>
            {copies.map((copy) => (
              <CopyRow key={copy.id} copy={copy} onChanged={invalidate} />
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

function CopyRow({ copy, onChanged }: { copy: CollectionItem; onChanged: () => void }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: handle } = useDb();

  const bump = useMutation({
    mutationFn: (delta: number) =>
      copy.quantity + delta <= 0
        ? deleteCollectionItem(handle!.db, copy.id)
        : updateCollectionItem(handle!.db, copy.id, { quantity: copy.quantity + delta }),
    onSuccess: onChanged,
  });

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/edit-copy', params: { copyId: String(copy.id) } })}
      style={({ pressed }) => [
        styles.copyRow,
        { borderColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
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
    </Pressable>
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
