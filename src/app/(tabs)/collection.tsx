import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View } from 'react-native';

import { CardListRow } from '@/components/card-list-row';
import { Chip } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { listCollection, type CollectionEntry } from '@/db/collection';
import { listSealedProducts } from '@/db/sealed';
import type { Language, SealedProduct } from '@/db/types';
import { listWantList } from '@/db/wantlist';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';

type Segment = 'cards' | 'sealed' | 'wishlist';
type LangFilter = Language | 'all';

export default function CollectionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [segment, setSegment] = useState<Segment>('cards');

  return (
    <Screen
      title="Collection"
      accessory={
        segment === 'sealed' ? (
          <Pressable onPress={() => router.push('/edit-sealed')} hitSlop={10}>
            <ThemedText type="subtitle" style={{ color: theme.accent, lineHeight: 34 }}>
              +
            </ThemedText>
          </Pressable>
        ) : null
      }>
      <View style={styles.chips}>
        <Chip label="Cards" selected={segment === 'cards'} onPress={() => setSegment('cards')} />
        <Chip label="Sealed" selected={segment === 'sealed'} onPress={() => setSegment('sealed')} />
        <Chip
          label="Wishlist"
          selected={segment === 'wishlist'}
          onPress={() => setSegment('wishlist')}
        />
      </View>

      {segment === 'cards' ? <CardsSegment /> : segment === 'sealed' ? <SealedSegment /> : <WishlistSegment />}
    </Screen>
  );
}

function CardsSegment() {
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
    <>
      <View style={styles.chips}>
        <Chip label="All" selected={lang === 'all'} onPress={() => setLang('all')} />
        <Chip label="EN" selected={lang === 'en'} onPress={() => setLang('en')} />
        <Chip label="JA" selected={lang === 'ja'} onPress={() => setLang('ja')} />
        <Chip label="Graded" selected={gradedOnly} onPress={() => setGradedOnly(!gradedOnly)} />
      </View>
      {!entries || entries.length === 0 ? (
        <EmptyState text="Nothing here yet. Find cards in Search (or scan them) and add them to your collection." />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <CollectionRow entry={item} />}
        />
      )}
    </>
  );
}

function CollectionRow({ entry }: { entry: CollectionEntry }) {
  const theme = useTheme();
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/edit-copy', params: { copyId: String(entry.id) } })}
      onLongPress={() => router.push({ pathname: '/card/[id]', params: { id: entry.cardId } })}
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

function SealedSegment() {
  const { data: handle } = useDb();
  const { data: products } = useQuery({
    queryKey: ['sealedList'],
    queryFn: () => listSealedProducts(handle!.db),
    enabled: !!handle,
  });

  if (!products || products.length === 0) {
    return <EmptyState text="Track booster boxes, ETBs and other sealed products. Tap + to add one." />;
  }
  return (
    <FlatList
      data={products}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) => <SealedRow product={item} />}
    />
  );
}

function SealedRow({ product }: { product: SealedProduct }) {
  const theme = useTheme();
  const router = useRouter();
  const value = product.currentValue != null ? product.currentValue * product.quantity : null;
  return (
    <Pressable
      onPress={() =>
        router.push({ pathname: '/edit-sealed', params: { sealedId: String(product.id) } })
      }
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText numberOfLines={1}>
          {product.quantity > 1 ? `${product.quantity}× ` : ''}
          {product.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {product.purchaseDate ?? 'no date'}
          {product.purchasePrice != null ? ` · paid $${product.purchasePrice.toFixed(2)}` : ''}
        </ThemedText>
      </View>
      {value != null ? <ThemedText type="smallBold">${value.toFixed(2)}</ThemedText> : null}
    </Pressable>
  );
}

function WishlistSegment() {
  const { data: handle } = useDb();
  const { data: wants } = useQuery({
    queryKey: ['wantList'],
    queryFn: () => listWantList(handle!.db),
    enabled: !!handle?.hasCatalog,
  });

  if (!wants || wants.length === 0) {
    return <EmptyState text="Your wishlist is empty. Tap the ♡ on any card to add it here." />;
  }
  return (
    <FlatList
      data={wants}
      keyExtractor={(item) => String(item.id)}
      renderItem={({ item }) =>
        item.card ? <CardListRow card={item.card} /> : null
      }
    />
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
