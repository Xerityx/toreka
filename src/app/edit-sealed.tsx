import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';

import { ChipsField, PrimaryButton, Stepper, TextField } from '@/components/form';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import {
  addSealedProduct,
  deleteSealedProduct,
  getSealedProduct,
  updateSealedProduct,
  type NewSealedProduct,
} from '@/db/sealed';
import type { SealedProductType } from '@/db/types';
import { useDb } from '@/hooks/use-db';

const TYPES: SealedProductType[] = [
  'booster_box',
  'elite_trainer_box',
  'booster_bundle',
  'collection_box',
  'tin',
  'single_pack',
  'other',
];
const TYPE_LABELS: Record<SealedProductType, string> = {
  booster_box: 'Booster Box',
  elite_trainer_box: 'ETB',
  booster_bundle: 'Bundle',
  collection_box: 'Collection',
  tin: 'Tin',
  single_pack: 'Pack',
  other: 'Other',
};

/** Modal editor for sealed products. Params: `sealedId` to edit, none to create. */
export default function EditSealedScreen() {
  const { sealedId, barcode: scannedBarcode } = useLocalSearchParams<{
    sealedId?: string;
    barcode?: string;
  }>();
  const isNew = !sealedId;
  const { data: handle } = useDb();

  const { data: existing } = useQuery({
    queryKey: ['sealed', sealedId],
    queryFn: () => getSealedProduct(handle!.db, Number(sealedId)),
    enabled: !!handle && !!sealedId,
  });

  // Wait for the record before mounting the form (state initializes from it).
  if (!isNew && !existing) {
    return (
      <ThemedView style={styles.root}>
        <Stack.Screen options={{ title: 'Edit Sealed Product', presentation: 'modal' }} />
      </ThemedView>
    );
  }

  return (
    <SealedForm
      key={sealedId ?? 'new'}
      isNew={isNew}
      sealedId={sealedId}
      existing={existing ?? null}
      scannedBarcode={scannedBarcode}
    />
  );
}

function SealedForm({
  isNew,
  sealedId,
  existing,
  scannedBarcode,
}: {
  isNew: boolean;
  sealedId?: string;
  existing: Awaited<ReturnType<typeof getSealedProduct>>;
  scannedBarcode?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: handle } = useDb();

  const [name, setName] = useState(existing?.name ?? '');
  const [productType, setProductType] = useState<SealedProductType>(
    existing?.productType ?? 'booster_box',
  );
  const [quantity, setQuantity] = useState(existing?.quantity ?? 1);
  const [barcode, setBarcode] = useState(existing?.barcode ?? scannedBarcode ?? '');
  const [purchasePrice, setPurchasePrice] = useState(
    existing?.purchasePrice != null ? String(existing.purchasePrice) : '',
  );
  const [purchaseDate, setPurchaseDate] = useState(existing?.purchaseDate ?? '');
  const [currentValue, setCurrentValue] = useState(
    existing?.currentValue != null ? String(existing.currentValue) : '',
  );
  const [notes, setNotes] = useState(existing?.notes ?? '');

  const build = (): NewSealedProduct => ({
    name: name.trim(),
    productType,
    quantity,
    barcode: barcode.trim() || null,
    purchasePrice: purchasePrice !== '' ? Number(purchasePrice.replace(/[$,]/g, '')) : null,
    purchaseDate: purchaseDate || null,
    currentValue: currentValue !== '' ? Number(currentValue.replace(/[$,]/g, '')) : null,
    notes: notes.trim() || null,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) {
        await addSealedProduct(handle!.db, build());
      } else {
        await updateSealedProduct(handle!.db, Number(sealedId), build());
      }
    },
    onSuccess: () => {
      if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries();
      router.back();
    },
  });

  const remove = useMutation({
    mutationFn: () => deleteSealedProduct(handle!.db, Number(sealedId)),
    onSuccess: () => {
      queryClient.invalidateQueries();
      router.back();
    },
  });

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen
        options={{ title: isNew ? 'Add Sealed Product' : 'Edit Sealed Product', presentation: 'modal' }}
      />
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Surging Sparks Booster Box"
          />
          <ChipsField
            label="Type"
            options={TYPES}
            value={productType}
            onChange={setProductType}
            labels={TYPE_LABELS}
          />
          <Stepper label="Quantity" value={quantity} onChange={setQuantity} />
          <TextField
            label="Purchase price each (USD)"
            value={purchasePrice}
            onChangeText={setPurchasePrice}
            keyboardType="decimal-pad"
            placeholder="what you paid"
          />
          <TextField
            label="Purchase date"
            value={purchaseDate}
            onChangeText={setPurchaseDate}
            placeholder="YYYY-MM-DD"
            autoCapitalize="none"
          />
          <TextField
            label="Current value each (USD)"
            value={currentValue}
            onChangeText={setCurrentValue}
            keyboardType="decimal-pad"
            placeholder="market value"
          />
          <TextField
            label="Barcode"
            value={barcode}
            onChangeText={setBarcode}
            placeholder="optional — scan coming soon"
            autoCapitalize="none"
          />
          <TextField label="Notes" value={notes} onChangeText={setNotes} placeholder="optional" />

          <PrimaryButton
            label={isNew ? 'Add product' : 'Save changes'}
            onPress={() => save.mutate()}
            disabled={save.isPending || name.trim() === ''}
          />
          {!isNew ? (
            <PrimaryButton
              label="Delete product"
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
