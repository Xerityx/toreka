import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import {
  ChipsField,
  PrimaryButton,
  Stepper,
  SwitchField,
  TextField,
} from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { getCard } from '@/db/catalog';
import {
  addCollectionItem,
  deleteCollectionItem,
  getCollectionItem,
  updateCollectionItem,
  type NewCollectionItem,
} from '@/db/collection';
import type { CardCondition, CardVariant, GradeCompany } from '@/db/types';
import { useDb } from '@/hooks/use-db';

const CONDITIONS: CardCondition[] = ['NM', 'LP', 'MP', 'HP', 'DMG'];
const VARIANTS: CardVariant[] = ['normal', 'holofoil', 'reverseHolofoil', 'firstEditionNormal', 'firstEditionHolofoil'];
const VARIANT_LABELS: Record<string, string> = {
  normal: 'Normal',
  holofoil: 'Holo',
  reverseHolofoil: 'Reverse Holo',
  firstEditionNormal: '1st Ed.',
  firstEditionHolofoil: '1st Ed. Holo',
};
const COMPANIES: GradeCompany[] = ['PSA', 'BGS', 'CGC', 'TAG', 'SGC'];

/**
 * Modal editor for one collection copy.
 * Params: either `copyId` (edit existing) or `cardId` (create new).
 */
export default function EditCopyScreen() {
  const { copyId, cardId } = useLocalSearchParams<{ copyId?: string; cardId?: string }>();
  const isNew = !copyId;
  const { data: handle } = useDb();

  const { data: existing } = useQuery({
    queryKey: ['copy', copyId],
    queryFn: () => getCollectionItem(handle!.db, Number(copyId)),
    enabled: !!handle && !!copyId,
  });

  const effectiveCardId = existing?.cardId ?? cardId ?? '';

  // When editing, wait for the copy to load before mounting the form so state
  // can be initialized directly from it (no setState-in-effect hydration).
  if (!isNew && !existing) {
    return (
      <ThemedView style={styles.root}>
        <Stack.Screen options={{ title: 'Edit Copy', presentation: 'modal' }} />
      </ThemedView>
    );
  }

  return (
    <CopyForm
      key={copyId ?? cardId ?? 'new'}
      isNew={isNew}
      copyId={copyId}
      existing={existing ?? null}
      effectiveCardId={effectiveCardId}
    />
  );
}

function CopyForm({
  isNew,
  copyId,
  existing,
  effectiveCardId,
}: {
  isNew: boolean;
  copyId?: string;
  existing: Awaited<ReturnType<typeof getCollectionItem>>;
  effectiveCardId: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: handle } = useDb();

  const { data: card } = useQuery({
    queryKey: ['card', effectiveCardId],
    queryFn: () => getCard(handle!.db, effectiveCardId),
    enabled: !!handle?.hasCatalog && !!effectiveCardId,
  });

  const [quantity, setQuantity] = useState(existing?.quantity ?? 1);
  const [condition, setCondition] = useState<CardCondition>(existing?.condition ?? 'NM');
  const [variant, setVariant] = useState<CardVariant>(existing?.variant ?? 'normal');
  const [isGraded, setIsGraded] = useState(existing?.isGraded ?? false);
  const [gradeCompany, setGradeCompany] = useState<GradeCompany>(existing?.gradeCompany ?? 'PSA');
  const [gradeValue, setGradeValue] = useState(
    existing?.gradeValue != null ? String(existing.gradeValue) : '',
  );
  const [certNumber, setCertNumber] = useState(existing?.certNumber ?? '');
  const [purchasePrice, setPurchasePrice] = useState(
    existing?.purchasePrice != null ? String(existing.purchasePrice) : '',
  );
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ?? '');
  const [valueOverride, setValueOverride] = useState(
    existing?.valueOverride != null ? String(existing.valueOverride) : '',
  );
  const [storageLocation, setStorageLocation] = useState(existing?.storageLocation ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const invalidateAll = () => queryClient.invalidateQueries();

  const buildItem = (): NewCollectionItem => ({
    cardId: effectiveCardId,
    quantity,
    condition,
    variant,
    language: card?.language ?? 'en',
    isGraded,
    gradeCompany: isGraded ? gradeCompany : null,
    gradeValue: isGraded && gradeValue !== '' ? Number(gradeValue) : null,
    certNumber: isGraded && certNumber !== '' ? certNumber : null,
    purchasePrice: purchasePrice !== '' ? Number(purchasePrice.replace(/[$,]/g, '')) : null,
    purchaseDate: purchaseDate !== '' ? purchaseDate : null,
    valueOverride: valueOverride !== '' ? Number(valueOverride.replace(/[$,]/g, '')) : null,
    storageLocation: storageLocation !== '' ? storageLocation : null,
    notes: notes !== '' ? notes : null,
  });

  const save = useMutation({
    mutationFn: async () => {
      const item = buildItem();
      if (isNew) {
        await addCollectionItem(handle!.db, item);
      } else {
        await updateCollectionItem(handle!.db, Number(copyId), item);
      }
    },
    onSuccess: () => {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      invalidateAll();
      router.back();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteCollectionItem(handle!.db, Number(copyId)),
    onSuccess: () => {
      invalidateAll();
      router.back();
    },
  });

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen
        options={{ title: isNew ? 'Add to Collection' : 'Edit Copy', presentation: 'modal' }}
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {card ? (
            <ThemedText type="smallBold" themeColor="textSecondary">
              {card.name} · {card.setName} #{card.number}
            </ThemedText>
          ) : null}

          <Stepper label="Quantity" value={quantity} onChange={setQuantity} />
          <SwitchField label="Graded card" value={isGraded} onChange={setIsGraded} />

          {isGraded ? (
            <>
              <ChipsField
                label="Company"
                options={COMPANIES}
                value={gradeCompany}
                onChange={setGradeCompany}
              />
              <TextField
                label="Grade"
                value={gradeValue}
                onChangeText={setGradeValue}
                placeholder="e.g. 9.5"
                keyboardType="decimal-pad"
              />
              <TextField
                label="Cert number"
                value={certNumber}
                onChangeText={setCertNumber}
                placeholder="optional"
                autoCapitalize="none"
              />
              <TextField
                label="Current value (USD)"
                value={valueOverride}
                onChangeText={setValueOverride}
                placeholder="graded market value"
                keyboardType="decimal-pad"
              />
            </>
          ) : (
            <>
              <ChipsField
                label="Condition"
                options={CONDITIONS}
                value={condition}
                onChange={setCondition}
              />
              <ChipsField
                label="Variant"
                options={VARIANTS}
                value={variant}
                onChange={setVariant}
                labels={VARIANT_LABELS}
              />
            </>
          )}

          <TextField
            label="Purchase price (USD)"
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            placeholder="what you paid"
            keyboardType="decimal-pad"
          />
          <TextField
            label="Purchase date"
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
          <TextField
            label="Storage location"
            value={storageLocation}
            onChangeText={setStorageLocation}
            placeholder="Binder A · Page 3"
          />
          <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="optional" />

          <PrimaryButton
            label={isNew ? 'Add to collection' : 'Save changes'}
            onPress={() => save.mutate()}
            disabled={save.isPending || !effectiveCardId}
          />
          {!isNew ? (
            <PrimaryButton
              label="Remove from collection"
              onPress={() => remove.mutate()}
              disabled={remove.isPending}
              destructive
            />
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
});
