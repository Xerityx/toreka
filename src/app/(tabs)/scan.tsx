import { useQuery } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Chip } from '@/components/chip';
import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { CARD_ASPECT, Radius, Spacing } from '@/constants/theme';
import type { Language } from '@/db/types';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';
import { computeCoverCrop, type Rect } from '@/scanner/crop';
import { loadHashIndex, findCandidates, type ScanCandidate } from '@/scanner/matcher';
import { hashFromJpegBase64 } from '@/scanner/photo';

type Mode = 'card' | 'barcode';
type LangFilter = Language | 'all';

export default function ScanScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: handle } = useDb();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>('card');
  const [lang, setLang] = useState<LangFilter>('all');
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<ScanCandidate[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);
  const lastBarcodeAt = useRef(0);

  const { data: hashIndex } = useQuery({
    queryKey: ['hashIndex'],
    queryFn: () => loadHashIndex(handle!.db),
    enabled: !!handle?.hasCatalog,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  if (Platform.OS === 'web') {
    return (
      <Screen title="Scan">
        <Empty text="Card scanning runs on the iPhone build — open Toreka on your phone to use it." />
      </Screen>
    );
  }

  if (!handle?.hasCatalog) {
    return (
      <Screen title="Scan">
        <Empty text="Download the card database from the Home tab first — the scanner matches against it." />
      </Screen>
    );
  }

  if (!permission?.granted) {
    return (
      <Screen title="Scan">
        <View style={styles.empty}>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Toreka needs camera access to identify cards.
          </ThemedText>
          <Pressable
            onPress={requestPermission}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accent },
              pressed && { opacity: 0.8 },
            ]}>
            <ThemedText type="smallBold" style={{ color: '#14100A' }}>
              Allow camera
            </ThemedText>
          </Pressable>
        </View>
      </Screen>
    );
  }

  // Overlay rect: centered card-shaped window, 72% of container width.
  const overlay: Rect | null = containerSize
    ? (() => {
        const w = containerSize.w * 0.72;
        const h = w / CARD_ASPECT;
        return {
          x: (containerSize.w - w) / 2,
          y: (containerSize.h - h) / 2,
          width: w,
          height: h,
        };
      })()
    : null;

  const capture = async () => {
    if (!cameraRef.current || !overlay || !containerSize || !hashIndex || busy) return;
    setBusy(true);
    setError(null);
    setCandidates(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      const crop = computeCoverCrop(photo.width, photo.height, containerSize.w, containerSize.h, overlay);
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.crop({ originX: crop.x, originY: crop.y, width: crop.width, height: crop.height });
      ctx.resize({ width: 128 });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
      if (!saved.base64) throw new Error('Could not read captured image');

      const queryHash = hashFromJpegBase64(saved.base64);
      const results = await findCandidates(handle.db, queryHash, hashIndex, {
        topN: 5,
        language: lang === 'all' ? undefined : lang,
      });
      if (Platform.OS === 'ios') {
        Haptics.notificationAsync(
          results.length > 0 && results[0].distance < 70
            ? Haptics.NotificationFeedbackType.Success
            : Haptics.NotificationFeedbackType.Warning,
        );
      }
      setCandidates(results);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onBarcode = (data: string) => {
    const now = Date.now();
    if (now - lastBarcodeAt.current < 2500) return;
    lastBarcodeAt.current = now;
    if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.push({ pathname: '/edit-sealed', params: { barcode: data } });
  };

  return (
    <Screen
      title="Scan"
      accessory={
        <View style={{ flexDirection: 'row', gap: Spacing.two }}>
          <Chip label="Card" selected={mode === 'card'} onPress={() => setMode('card')} />
          <Chip label="Barcode" selected={mode === 'barcode'} onPress={() => setMode('barcode')} />
        </View>
      }>
      <View
        style={styles.cameraWrap}
        onLayout={(e) =>
          setContainerSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={
            mode === 'barcode'
              ? { barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'] }
              : undefined
          }
          onBarcodeScanned={mode === 'barcode' ? (r) => onBarcode(r.data) : undefined}
        />

        {mode === 'card' && overlay ? (
          <View
            pointerEvents="none"
            style={[
              styles.overlay,
              {
                left: overlay.x,
                top: overlay.y,
                width: overlay.width,
                height: overlay.height,
                borderColor: theme.accent,
              },
            ]}
          />
        ) : null}

        {mode === 'barcode' ? (
          <View style={styles.barcodeHint}>
            <ThemedText type="small" style={styles.hintText}>
              Point at a sealed product&apos;s barcode
            </ThemedText>
          </View>
        ) : null}

        {mode === 'card' ? (
          <View style={styles.controls}>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <Chip label="All" selected={lang === 'all'} onPress={() => setLang('all')} />
              <Chip label="EN" selected={lang === 'en'} onPress={() => setLang('en')} />
              <Chip label="JA" selected={lang === 'ja'} onPress={() => setLang('ja')} />
            </View>
            <Pressable
              onPress={capture}
              disabled={busy || !hashIndex}
              style={({ pressed }) => [
                styles.shutter,
                { borderColor: theme.accent, backgroundColor: 'rgba(0,0,0,0.25)' },
                (pressed || busy) && { opacity: 0.6 },
              ]}>
              {busy ? (
                <ActivityIndicator color={theme.accent} />
              ) : (
                <View style={[styles.shutterInner, { backgroundColor: theme.accent }]} />
              )}
            </Pressable>
            <ThemedText type="small" style={styles.hintText}>
              {hashIndex
                ? 'Fill the frame with the card, then tap'
                : 'Preparing match index…'}
            </ThemedText>
          </View>
        ) : null}
      </View>

      {error ? (
        <ThemedText type="small" style={{ color: theme.negative, padding: Spacing.three }}>
          {error}
        </ThemedText>
      ) : null}

      {candidates ? (
        <ThemedView
          type="backgroundElement"
          style={[styles.results, { borderColor: theme.border }]}>
          <View style={styles.resultsHeader}>
            <ThemedText type="smallBold">
              {candidates.length === 0 ? 'No matches' : 'Best matches'}
            </ThemedText>
            <Pressable onPress={() => setCandidates(null)} hitSlop={10}>
              <ThemedText type="small" themeColor="textSecondary">
                Dismiss
              </ThemedText>
            </Pressable>
          </View>
          <ScrollView style={{ maxHeight: 300 }}>
            {candidates.map((c) => (
              <CandidateRow
                key={c.cardId}
                candidate={c}
                onPick={() => {
                  setCandidates(null);
                  router.push({ pathname: '/edit-copy', params: { cardId: c.cardId } });
                }}
              />
            ))}
            {candidates.length === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={{ padding: Spacing.two }}>
                Try filling the frame with the card, avoiding glare, or searching by name instead.
              </ThemedText>
            ) : null}
          </ScrollView>
        </ThemedView>
      ) : null}
    </Screen>
  );
}

function confidenceLabel(distance: number): { label: string; kind: 'positive' | 'accent' | 'negative' } {
  if (distance < 45) return { label: 'High match', kind: 'positive' };
  if (distance < 70) return { label: 'Possible match', kind: 'accent' };
  return { label: 'Weak match', kind: 'negative' };
}

function CandidateRow({ candidate, onPick }: { candidate: ScanCandidate; onPick: () => void }) {
  const theme = useTheme();
  const conf = confidenceLabel(candidate.distance);
  const confColor =
    conf.kind === 'positive' ? theme.positive : conf.kind === 'accent' ? theme.accent : theme.textSecondary;
  return (
    <Pressable
      onPress={onPick}
      style={({ pressed }) => [
        styles.candidateRow,
        { borderBottomColor: theme.border },
        pressed && { backgroundColor: theme.backgroundSelected },
      ]}>
      <View style={[styles.candidateThumb, { backgroundColor: theme.imageBg }]}>
        {candidate.card.imageSmall ? (
          <Image source={candidate.card.imageSmall} style={{ flex: 1 }} contentFit="contain" />
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ThemedText type="small" numberOfLines={1}>
          {candidate.card.name}
          {candidate.card.language === 'ja' ? '  🇯🇵' : ''}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {candidate.card.setName} · #{candidate.card.number}
        </ThemedText>
      </View>
      <ThemedText type="small" style={{ color: confColor }}>
        {conf.label}
      </ThemedText>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
        {text}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    padding: Spacing.five,
  },
  primaryBtn: {
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two + 2,
    borderRadius: Radius.md,
  },
  cameraWrap: {
    flex: 1,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute',
    borderWidth: 2,
    borderRadius: Radius.md,
  },
  controls: {
    position: 'absolute',
    bottom: Spacing.three,
    width: '100%',
    alignItems: 'center',
    gap: Spacing.two,
  },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  hintText: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  barcodeHint: {
    position: 'absolute',
    top: Spacing.three,
    width: '100%',
    alignItems: 'center',
  },
  results: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.three,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.two,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.one,
    paddingBottom: Spacing.one,
  },
  candidateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.one,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  candidateThumb: {
    height: 48,
    width: 48 * CARD_ASPECT,
    borderRadius: 4,
    overflow: 'hidden',
  },
});
