import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { GradingReportView } from '@/components/grading-report-view';
import { CARD_ASPECT, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { getUsdMarketPrices } from '@/db/prices';
import { insertGradingReport } from '@/db/grading';
import { analyzeCardPhotos, type AnalysisResult } from '@/grading/analyze';
import { useDb } from '@/hooks/use-db';
import { useTheme } from '@/hooks/use-theme';
import { computeCoverCrop, type Rect } from '@/scanner/crop';

type Step = 'front' | 'back' | 'analyzing' | 'done';

interface Captured {
  uri: string;
  base64: string;
}

/**
 * Grade-prediction flow: photograph front (and ideally back) of a card inside
 * the overlay → on-device analysis → per-company predictions + explanation.
 * Param: cardId (optional) to attach the report + pull the raw price for ROI.
 */
export default function GradeScreen() {
  const { cardId } = useLocalSearchParams<{ cardId?: string }>();
  const theme = useTheme();
  const router = useRouter();
  const { data: handle } = useDb();
  const queryClient = useQueryClient();
  const [permission, requestPermission] = useCameraPermissions();

  const [step, setStep] = useState<Step>('front');
  const [front, setFront] = useState<Captured | null>(null);
  const [back, setBack] = useState<Captured | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const [containerSize, setContainerSize] = useState<{ w: number; h: number } | null>(null);

  const { data: rawValue } = useQuery({
    queryKey: ['rawValue', cardId],
    queryFn: async () => {
      const prices = await getUsdMarketPrices(handle!.db);
      const cardPrices = prices.get(cardId!);
      if (!cardPrices || cardPrices.size === 0) return null;
      return Math.max(...cardPrices.values());
    },
    enabled: !!handle && !!cardId,
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!result || !front) return null;
      return await insertGradingReport(handle!.db, {
        cardId: cardId ?? null,
        frontUri: front.uri,
        backUri: back?.uri ?? null,
        ...result,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gradingReports'] });
      router.back();
    },
  });

  if (Platform.OS === 'web') {
    return (
      <Gate title="Grade a card">
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Grading capture needs the iPhone camera — open Toreka on your phone.
        </ThemedText>
      </Gate>
    );
  }

  if (!permission?.granted) {
    return (
      <Gate title="Grade a card">
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Toreka needs camera access to photograph the card for grading.
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
      </Gate>
    );
  }

  // Overlay: card window, 82% of width (bigger than scan — resolution matters here).
  const overlay: Rect | null = containerSize
    ? (() => {
        const w = containerSize.w * 0.82;
        const h = w / CARD_ASPECT;
        return { x: (containerSize.w - w) / 2, y: (containerSize.h - h) / 2, width: w, height: h };
      })()
    : null;

  const capture = async () => {
    if (!cameraRef.current || !overlay || !containerSize) return;
    setError(null);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 1 });
      const crop = computeCoverCrop(photo.width, photo.height, containerSize.w, containerSize.h, overlay);
      const ctx = ImageManipulator.manipulate(photo.uri);
      ctx.crop({ originX: crop.x, originY: crop.y, width: crop.width, height: crop.height });
      if (crop.width > 720) ctx.resize({ width: 720 });
      const rendered = await ctx.renderAsync();
      const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.92, base64: true });
      if (!saved.base64) throw new Error('Could not read captured image');
      const captured: Captured = { uri: saved.uri, base64: saved.base64 };

      if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (step === 'front') {
        setFront(captured);
        setStep('back');
      } else if (step === 'back') {
        setBack(captured);
        runAnalysis(front!, captured);
      }
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const runAnalysis = (f: Captured, b: Captured | null) => {
    setStep('analyzing');
    // Let the spinner render before the ~1s synchronous analysis.
    setTimeout(() => {
      try {
        const analysis = analyzeCardPhotos(f.base64, b?.base64 ?? null);
        setResult(analysis);
        setStep('done');
        if (Platform.OS === 'ios') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch (e) {
        setError((e as Error).message);
        setStep(f ? 'back' : 'front');
      }
    }, 50);
  };

  if (step === 'done' && result) {
    return (
      <ThemedView style={styles.root}>
        <Stack.Screen options={{ title: 'Grade Prediction', presentation: 'modal' }} />
        <ScrollView contentContainerStyle={styles.reportScroll}>
          <GradingReportView result={result} rawValue={rawValue ?? null} />
          <Pressable
            onPress={() => save.mutate()}
            disabled={save.isPending}
            style={({ pressed }) => [
              styles.primaryBtn,
              { backgroundColor: theme.accent, alignSelf: 'stretch', alignItems: 'center' },
              (pressed || save.isPending) && { opacity: 0.7 },
            ]}>
            <ThemedText type="smallBold" style={{ color: '#14100A' }}>
              Save report
            </ThemedText>
          </Pressable>
          <Pressable
            onPress={() => {
              setFront(null);
              setBack(null);
              setResult(null);
              setStep('front');
            }}>
            <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
              Retake photos
            </ThemedText>
          </Pressable>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title: 'Grade a Card', presentation: 'modal' }} />
      <View
        style={styles.cameraWrap}
        onLayout={(e) =>
          setContainerSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
        }>
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
        {overlay ? (
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

        <View style={styles.controls}>
          <ThemedText type="smallBold" style={styles.hintText}>
            {step === 'front' ? 'Photograph the FRONT' : 'Now the BACK (or skip)'}
          </ThemedText>
          <ThemedText type="small" style={styles.hintText}>
            Fill the frame · flat card · no sleeve · avoid glare
          </ThemedText>
          {step === 'analyzing' ? (
            <ActivityIndicator color={theme.accent} size="large" />
          ) : (
            <View style={styles.buttonRow}>
              {step === 'back' ? (
                <Pressable onPress={() => runAnalysis(front!, null)} hitSlop={10}>
                  <ThemedText type="small" style={styles.hintText}>
                    Skip back
                  </ThemedText>
                </Pressable>
              ) : (
                <View style={{ width: 60 }} />
              )}
              <Pressable
                onPress={capture}
                style={({ pressed }) => [
                  styles.shutter,
                  { borderColor: theme.accent, backgroundColor: 'rgba(0,0,0,0.25)' },
                  pressed && { opacity: 0.6 },
                ]}>
                <View style={[styles.shutterInner, { backgroundColor: theme.accent }]} />
              </Pressable>
              <View style={{ width: 60 }} />
            </View>
          )}
        </View>
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.negative, padding: Spacing.three }}>
          {error}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

function Gate({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView style={styles.root}>
      <Stack.Screen options={{ title, presentation: 'modal' }} />
      <View style={styles.gate}>{children}</View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  gate: {
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
    margin: Spacing.three,
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
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.four,
  },
  shutter: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 46, height: 46, borderRadius: 23 },
  hintText: {
    color: '#FFFFFF',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 4,
  },
  reportScroll: {
    padding: Spacing.three,
    gap: Spacing.three,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: Spacing.six,
  },
});
