import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from './themed-text';

import { CARD_ASPECT, Radius, Spacing } from '@/constants/theme';
import type { CardSummary } from '@/db/types';
import { useTheme } from '@/hooks/use-theme';

const THUMB_HEIGHT = 64;

export function CardListRow({ card }: { card: CardSummary }) {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/card/[id]', params: { id: card.id } })}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View style={[styles.thumbWrap, { backgroundColor: theme.imageBg }]}>
        {card.imageSmall ? (
          <Image
            source={card.imageSmall}
            style={styles.thumb}
            contentFit="contain"
            transition={150}
          />
        ) : null}
      </View>
      <View style={styles.info}>
        <ThemedText numberOfLines={1}>
          {card.name}
          {card.language === 'ja' ? '  🇯🇵' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {card.setName} · #{card.number}
          {card.rarity ? ` · ${card.rarity}` : ''}
        </ThemedText>
      </View>
      {card.ownedQuantity > 0 ? (
        <View style={[styles.ownedBadge, { backgroundColor: theme.accentSoft }]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            ×{card.ownedQuantity}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumbWrap: {
    height: THUMB_HEIGHT,
    width: THUMB_HEIGHT * CARD_ASPECT,
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  thumb: {
    flex: 1,
  },
  info: {
    flex: 1,
    gap: 2,
  },
  ownedBadge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Radius.sm,
  },
});
