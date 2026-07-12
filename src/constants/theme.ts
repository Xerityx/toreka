/**
 * Toreka design tokens — dark-first premium palette with a collector-gold accent.
 * Keep light/dark key parity: components address colors via useTheme().
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#101828',
    background: '#F7F8FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#EEF1F5',
    textSecondary: '#667085',
    accent: '#B98A20',
    accentSoft: 'rgba(185, 138, 32, 0.12)',
    positive: '#16A34A',
    negative: '#DC2626',
    border: 'rgba(16, 24, 40, 0.10)',
    imageBg: '#EAEEF3',
  },
  dark: {
    text: '#F2F4F8',
    background: '#0A0C10',
    backgroundElement: '#151920',
    backgroundSelected: '#20262F',
    textSecondary: '#98A2B3',
    accent: '#E8B44A',
    accentSoft: 'rgba(232, 180, 74, 0.14)',
    positive: '#4ADE80',
    negative: '#F87171',
    border: 'rgba(255, 255, 255, 0.09)',
    imageBg: '#10141A',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** Trading cards are 63×88 mm. */
export const CARD_ASPECT = 63 / 88;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
