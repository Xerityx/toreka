import { StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';

export default function ScanScreen() {
  return (
    <Screen title="Scan">
      <View style={styles.empty}>
        <ThemedText type="subtitle" style={{ textAlign: 'center' }}>
          📷
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Card scanning needs the camera build of Toreka.{'\n'}
          It identifies cards from a photo and adds them in one tap — coming in the next build.
        </ThemedText>
      </View>
    </Screen>
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
});
