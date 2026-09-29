// Calm, low-contrast palette for long study sessions: warm neutrals, one
// muted indigo accent, and soft status colours. Every colour has a dark twin.

export const Colors = {
  light: {
    background: '#F6F5F2',
    surface: '#FFFFFF',
    surfaceMuted: '#EFEDE8',
    border: '#E4E1DA',
    text: '#1D1E20',
    textSecondary: '#6B6C70',
    textTertiary: '#9C9DA1',
    accent: '#4B5FB8',
    accentSoft: '#E7EAF7',
    onAccent: '#FFFFFF',
    success: '#3F8A67',
    successSoft: '#E3F1EA',
    warning: '#A9772B',
    warningSoft: '#F6EDDD',
    danger: '#B8514E',
    dangerSoft: '#F7E5E4',
  },
  dark: {
    background: '#111213',
    surface: '#1A1B1D',
    surfaceMuted: '#232427',
    border: '#2C2D31',
    text: '#EBEBED',
    textSecondary: '#A0A1A7',
    textTertiary: '#6D6E74',
    accent: '#8C9BEB',
    accentSoft: '#252A44',
    onAccent: '#111213',
    success: '#72C39C',
    successSoft: '#1D2D25',
    warning: '#DDB060',
    warningSoft: '#302819',
    danger: '#E08480',
    dangerSoft: '#352120',
  },
} as const;

export type ThemeColors = { [K in keyof typeof Colors.light]: string };
export type ThemeColor = keyof ThemeColors;

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
  sm: 10,
  md: 14,
  lg: 20,
  pill: 999,
} as const;
