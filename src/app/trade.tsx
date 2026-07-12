import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { Stack } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { ProgressBar } from '@/components/progress-bar';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CARD_ASPECT, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { searchCards } from '@/db/catalog';
import { getUsdMarketPrices } from '@/db/prices';
import type { CardSummary } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

interface TradeItem {
  card: CardSummary;
  /** Editable USD value (prefilled from market price when known). */
  value: string;
}

/** Two-sided trade calculator with live totals and a fairness meter. */
export default function TradeScreen() {
  const theme = useTheme();
  const [give, setGive] = useState<TradeItem[]>([]);
  const [get, setGet] = useState<TradeItem[]>([]);

  const giveTotal = sumSide(give);
  const getTotal = sumSide(get);
  const delta = getTotal - giveTotal;
  const total = giveTotal + getTotal;
  const fairness = total > 0 ? getTotal / total : 0.5;

  const verdict =
    total === 0
      ? 'Add cards to both sides'
      : Math.abs(delta) < total * 0.05
        ? 'Fair trade'
        : delta > 0
          ? `In your favor by $${Math.abs(delta).toFixed(2)}`
          : `Against you by $${Math.abs(delta).toFixed(2)}`;
  const verdictColor =
    total === 0
      ? theme.textSecondary
      : Math.abs(delta) < total * 0.05
        ? theme.positive
        : delta > 0
          ? theme.positive
          : theme.negative;

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: 'Trade Calculator' }} />
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Verdict */}
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="smallBold" style={{ color: verdictColor }}>
            {verdict}
          </ThemedText>
          <ProgressBar fraction={fairness} />
          <View style={styles.totalsRow}>
            <ThemedText type="small" themeColor="textSecondary">
              You give ${giveTotal.toFixed(2)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              You get ${getTotal.toFixed(2)}
            </ThemedText>
          </View>
        </ThemedView>

        <TradeSide title="You give" items={give} setItems={setGive} />
        <TradeSide title="You get" items={get} setItems={setGet} />
      </ScrollView>
    </ThemedView>
  );
}

function sumSide(items: TradeItem[]): number {
  return items.reduce((sum, item) => {
    const v = Number(item.value.replace(/[$,]/g, ''));
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

function TradeSide({
  title,
  items,
  setItems,
}: {
  title: string;
  items: TradeItem[];
  setItems: (items: TradeItem[]) => void;
}) {
  const theme = useTheme();
  const { data: handle } = useDb();
  const [query, setQuery] = useState('');

  const { data: results } = useQuery({
    queryKey: ['tradeSearch', title, query],
    queryFn: () =>
      searchCards(handle!.db, { query, ftsAvailable: handle!.ftsAvailable, limit: 6 }),
    enabled: !!handle?.hasCatalog && query.trim().length > 1,
    placeholderData: (prev) => prev,
  });

  const { data: prices } = useQuery({
    queryKey: ['usdPrices'],
    queryFn: () => getUsdMarketPrices(handle!.db),
    enabled: !!handle,
    staleTime: 60_000,
  });

  const suggestions = useMemo(
    () => (query.trim().length > 1 ? (results ?? []) : []),
    [query, results],
  );

  const addCard = (card: CardSummary) => {
    const cardPrices = prices?.get(card.id);
    const best = cardPrices && cardPrices.size > 0 ? Math.max(...cardPrices.values()) : null;
    setItems([...items, { card, value: best != null ? best.toFixed(2) : '' }]);
    setQuery('');
  };

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">{title}</ThemedText>

      {items.map((item, i) => (
        <View key={`${item.card.id}-${i}`} style={[styles.itemRow, { borderBottomColor: theme.border }]}>
          <View style={[styles.thumb, { backgroundColor: theme.imageBg }]}>
            {item.card.imageSmall ? (
              <Image source={item.card.imageSmall} style={{ flex: 1 }} contentFit="contain" />
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText type="small" numberOfLines={1}>
              {item.card.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {item.card.setName} · #{item.card.number}
            </ThemedText>
          </View>
          <TextInput
            value={item.value}
            onChangeText={(v) => {
              const next = [...items];
              next[i] = { ...item, value: v };
              setItems(next);
            }}
            placeholder="$"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
            style={[
              styles.valueInput,
              { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
            ]}
          />
          <Pressable onPress={() => setItems(items.filter((_, j) => j !== i))} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.negative }}>
              ✕
            </ThemedText>
          </Pressable>
        </View>
      ))}

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Add a card…"
        placeholderTextColor={theme.textSecondary}
        autoCorrect={false}
        style={[
          styles.searchInput,
          { backgroundColor: theme.background, color: theme.text, borderColor: theme.border },
        ]}
      />
      {suggestions.map((card) => (
        <Pressable
          key={card.id}
          onPress={() => addCard(card)}
          style={({ pressed }) => [
            styles.suggestionRow,
            pressed && { backgroundColor: theme.backgroundSelected },
          ]}>
          <ThemedText type="small" numberOfLines={1}>
            {card.name}
            <ThemedText type="small" themeColor="textSecondary">
              {'  '}
              {card.setName} #{card.number}
            </ThemedText>
          </ThemedText>
        </Pressable>
      ))}
    </ThemedView>
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
    paddingBottom: Spacing.six,
  },
  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  thumb: {
    height: 40,
    width: 40 * CARD_ASPECT,
    borderRadius: 4,
    overflow: 'hidden',
  },
  valueInput: {
    width: 76,
    height: 34,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.one + 2,
    fontSize: 13,
    textAlign: 'right',
  },
  searchInput: {
    height: 38,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  suggestionRow: {
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.one,
  },
});
