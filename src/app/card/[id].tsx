import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Chip } from '@/components/chip';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { TimeSeriesChart } from '@/components/time-series-chart';
import { CARD_ASPECT, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { createAlert, deleteAlert, getAlertsForCard } from '@/db/alerts';
import { getCard } from '@/db/catalog';
import { listGradingReportsForCard } from '@/db/grading';
import { deleteCollectionItem, getItemsForCard, updateCollectionItem } from '@/db/collection';
import { getPriceHistory, getPricesForCard } from '@/db/prices';
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

        <Pressable
          onPress={() => router.push({ pathname: '/grade', params: { cardId: id! } })}
          style={({ pressed }) => [
            styles.addButton,
            {
              backgroundColor: 'transparent',
              borderColor: theme.accent,
              borderWidth: StyleSheet.hairlineWidth * 2,
            },
            pressed && { opacity: 0.75 },
          ]}>
          <ThemedText type="smallBold" style={{ color: theme.accent }}>
            Predict grade  ✦
          </ThemedText>
        </Pressable>

        <GradeHistorySection cardId={id!} />

        {copies && copies.length > 0 ? (
          <View style={styles.section}>
            <ThemedText type="smallBold">Your copies</ThemedText>
            {copies.map((copy) => (
              <CopyRow key={copy.id} copy={copy} onChanged={invalidate} />
            ))}
          </View>
        ) : null}

        <PricesSection cardId={id!} />
        <AlertsSection cardId={id!} cardName={card.name} />
      </ScrollView>
    </ThemedView>
  );
}

const VARIANT_NAMES: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holofoil',
  reverseHolofoil: 'Reverse Holo',
  firstEditionNormal: '1st Edition',
  firstEditionHolofoil: '1st Ed. Holo',
  unlimited: 'Unlimited',
};

function GradeHistorySection({ cardId }: { cardId: string }) {
  const theme = useTheme();
  const router = useRouter();
  const { data: handle } = useDb();

  const { data: reports } = useQuery({
    queryKey: ['gradingReports', 'card', cardId],
    queryFn: () => listGradingReportsForCard(handle!.db, cardId),
    enabled: !!handle,
  });

  if (!reports || reports.length === 0) return null;
  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Grade predictions</ThemedText>
      {reports.map((r) => {
        const psa = r.predictions.find((p) => p.company === 'PSA');
        return (
          <Pressable
            key={r.id}
            onPress={() => router.push({ pathname: '/grade-report/[id]', params: { id: String(r.id) } })}
            style={({ pressed }) => [
              styles.priceRow,
              { borderColor: theme.border },
              pressed && { backgroundColor: theme.backgroundSelected },
            ]}>
            <ThemedText type="small" style={{ flex: 1 }}>
              {new Date(r.createdAt).toLocaleDateString()}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: theme.accent }}>
              PSA {psa?.mostLikely ?? '—'} est.
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

function PricesSection({ cardId }: { cardId: string }) {
  const theme = useTheme();
  const { data: handle } = useDb();

  const { data: prices } = useQuery({
    queryKey: ['prices', cardId],
    queryFn: () => getPricesForCard(handle!.db, cardId),
    enabled: !!handle,
  });

  const { data: history } = useQuery({
    queryKey: ['priceHistory', cardId],
    queryFn: () => getPriceHistory(handle!.db, cardId, null, 90),
    enabled: !!handle,
  });

  const tcgRows = (prices ?? []).filter((p) => p.source === 'tcgplayer' && p.market != null);
  const cm = (prices ?? []).find((p) => p.source === 'cardmarket' && p.market != null);

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Prices</ThemedText>
      {tcgRows.length === 0 && !cm ? (
        <ThemedText type="small" themeColor="textSecondary">
          No price data yet — add this card to your collection or wishlist, then refresh prices
          from Home.
        </ThemedText>
      ) : (
        <>
          {tcgRows.map((p) => (
            <View key={`${p.variant}`} style={[styles.priceRow, { borderColor: theme.border }]}>
              <ThemedText type="small" style={{ flex: 1 }}>
                {VARIANT_NAMES[p.variant] ?? p.variant}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {p.low != null ? `$${p.low.toFixed(2)} – ` : ''}
                {p.high != null ? `$${p.high.toFixed(2)}` : ''}
              </ThemedText>
              <ThemedText type="smallBold" style={styles.priceMarket}>
                ${p.market!.toFixed(2)}
              </ThemedText>
            </View>
          ))}
          {cm ? (
            <ThemedText type="small" themeColor="textSecondary">
              Cardmarket trend (EU): €{cm.market!.toFixed(2)}
            </ThemedText>
          ) : null}
          {(history ?? []).length >= 2 ? (
            <View style={{ marginTop: Spacing.two }}>
              <TimeSeriesChart
                points={(history ?? []).map((h) => ({ date: h.date, value: h.market }))}
                height={120}
              />
            </View>
          ) : null}
        </>
      )}
    </View>
  );
}

function AlertsSection({ cardId, cardName }: { cardId: string; cardName: string }) {
  void cardName;
  const theme = useTheme();
  const { data: handle } = useDb();
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [threshold, setThreshold] = useState('');

  const { data: alerts } = useQuery({
    queryKey: ['alerts', cardId],
    queryFn: () => getAlertsForCard(handle!.db, cardId),
    enabled: !!handle,
  });

  const add = useMutation({
    mutationFn: () =>
      createAlert(handle!.db, {
        cardId,
        direction,
        threshold: Number(threshold.replace(/[$,]/g, '')),
      }),
    onSuccess: () => {
      setThreshold('');
      queryClient.invalidateQueries({ queryKey: ['alerts', cardId] });
    },
  });

  const remove = useMutation({
    mutationFn: (alertId: number) => deleteAlert(handle!.db, alertId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts', cardId] }),
  });

  const valid = Number(threshold.replace(/[$,]/g, '')) > 0;

  return (
    <View style={styles.section}>
      <ThemedText type="smallBold">Price alerts</ThemedText>
      {(alerts ?? []).map((a) => (
        <View key={a.id} style={[styles.priceRow, { borderColor: theme.border }]}>
          <ThemedText type="small" style={{ flex: 1 }}>
            Notify when {a.direction} ${a.threshold.toFixed(2)}
          </ThemedText>
          <Pressable onPress={() => remove.mutate(a.id)} hitSlop={8}>
            <ThemedText type="small" style={{ color: theme.negative }}>
              Remove
            </ThemedText>
          </Pressable>
        </View>
      ))}
      <View style={styles.alertForm}>
        <Chip label="Above" selected={direction === 'above'} onPress={() => setDirection('above')} />
        <Chip label="Below" selected={direction === 'below'} onPress={() => setDirection('below')} />
        <TextInput
          value={threshold}
          onChangeText={setThreshold}
          placeholder="$0.00"
          placeholderTextColor={theme.textSecondary}
          keyboardType="decimal-pad"
          style={[
            styles.alertInput,
            {
              backgroundColor: theme.backgroundElement,
              color: theme.text,
              borderColor: theme.border,
            },
          ]}
        />
        <Pressable
          onPress={() => add.mutate()}
          disabled={!valid || add.isPending}
          style={({ pressed }) => [
            styles.alertButton,
            { backgroundColor: valid ? theme.accent : theme.backgroundSelected },
            pressed && { opacity: 0.7 },
          ]}>
          <ThemedText
            type="smallBold"
            style={{ color: valid ? '#14100A' : theme.textSecondary }}>
            Set
          </ThemedText>
        </Pressable>
      </View>
    </View>
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
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  priceMarket: {
    minWidth: 70,
    textAlign: 'right',
  },
  alertForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  alertInput: {
    flex: 1,
    height: 38,
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    fontSize: 14,
  },
  alertButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.sm,
  },
});
