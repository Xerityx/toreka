import { type ReactNode } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';

/**
 * Tab-screen wrapper: safe area, large title, optional right accessory,
 * consistent horizontal padding and max width.
 */
export function Screen({
  title,
  accessory,
  children,
  contentStyle,
  scrollable = false,
}: {
  title?: string;
  accessory?: ReactNode;
  children: ReactNode;
  contentStyle?: ViewStyle;
  scrollable?: boolean;
}) {
  void scrollable;
  return (
    <ThemedView style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
        <View style={styles.inner}>
          {title ? (
            <View style={styles.header}>
              <ThemedText type="subtitle">{title}</ThemedText>
              {accessory ? <View>{accessory}</View> : null}
            </View>
          ) : null}
          <View style={[styles.content, contentStyle]}>{children}</View>
        </View>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },
  inner: {
    flex: 1,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  content: {
    flex: 1,
    paddingBottom: BottomTabInset,
  },
});
