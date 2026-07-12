import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';

import { ThemedText } from './themed-text';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export interface SeriesPoint {
  /** YYYY-MM-DD */
  date: string;
  value: number;
}

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(m)}/${Number(d)}`;
}

/**
 * Single-series time chart (portfolio value, price history).
 * Dataviz method: one validated hue, 2px line, recessive axes, no per-point
 * labels, crosshair + tooltip on touch. Title outside names the series.
 */
export function TimeSeriesChart({
  points,
  height = 160,
  currency = true,
}: {
  points: SeriesPoint[];
  height?: number;
  currency?: boolean;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  if (points.length < 2) {
    return (
      <View style={[styles.placeholder, { height, borderColor: theme.border }]}>
        <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
          Not enough history yet — this chart fills in as prices refresh over days.
        </ThemedText>
      </View>
    );
  }

  const fmt = (v: number) =>
    currency
      ? v >= 1000
        ? `$${(v / 1000).toFixed(1)}k`
        : `$${v.toFixed(v < 10 ? 2 : 0)}`
      : String(Math.round(v));

  const data = points.map((p) => ({ value: p.value, date: p.date }));
  const min = Math.min(...points.map((p) => p.value));
  const max = Math.max(...points.map((p) => p.value));
  const pad = (max - min) * 0.15 || max * 0.1 || 1;
  const yMin = Math.max(0, min - pad);

  const chartWidth = Math.max(0, width - 56); // leave room for y labels
  const spacing = data.length > 1 ? Math.max(2, chartWidth / (data.length - 1)) : chartWidth;

  return (
    <View style={styles.wrap} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 ? (
        <LineChart
          areaChart
          data={data}
          height={height}
          width={chartWidth}
          adjustToWidth
          spacing={spacing}
          initialSpacing={0}
          endSpacing={0}
          thickness={2}
          color={theme.chartLine}
          startFillColor={theme.chartLine}
          endFillColor={theme.chartLine}
          startOpacity={0.18}
          endOpacity={0.02}
          hideDataPoints
          yAxisOffset={yMin}
          noOfSections={3}
          yAxisColor="transparent"
          xAxisColor={theme.border}
          rulesColor={theme.border}
          rulesType="solid"
          yAxisTextStyle={{ color: theme.textSecondary, fontSize: 11 }}
          formatYLabel={(label: string) => fmt(Number(label))}
          xAxisLabelsHeight={0}
          disableScroll
          pointerConfig={{
            pointerStripColor: theme.textSecondary,
            pointerStripWidth: 1,
            pointerColor: theme.chartLine,
            radius: 4,
            activatePointersOnLongPress: false,
            autoAdjustPointerLabelPosition: true,
            pointerLabelWidth: 90,
            pointerLabelComponent: (items: { value: number; date?: string }[]) => (
              <View style={[styles.tooltip, { backgroundColor: theme.backgroundSelected, borderColor: theme.border }]}>
                <ThemedText type="smallBold">{fmt(items[0]?.value ?? 0)}</ThemedText>
                {items[0]?.date ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {shortDate(items[0].date)}
                  </ThemedText>
                ) : null}
              </View>
            ),
          }}
        />
      ) : null}
      <View style={styles.xLabels}>
        <ThemedText type="small" themeColor="textSecondary">
          {shortDate(points[0].date)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {shortDate(points[points.length - 1].date)}
        </ThemedText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%' },
  placeholder: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.three,
  },
  xLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingLeft: 40,
    marginTop: 2,
  },
  tooltip: {
    borderRadius: Radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
    alignItems: 'center',
  },
});
