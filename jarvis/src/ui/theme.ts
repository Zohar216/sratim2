import { StyleSheet } from 'react-native';

export const colors = {
  bg: '#0B1020',
  surface: '#131A2E',
  surfaceHigh: '#1B2440',
  border: '#26304F',
  text: '#E8ECF8',
  textDim: '#9AA4C2',
  textFaint: '#66708F',
  accent: '#4F8CFF',
  accentDim: '#2A4C8F',
  userBubble: '#2F5BD3',
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F05252',
} as const;

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 } as const;

export const common = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: space.lg,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700', textAlign: 'left' },
  body: { color: colors.text, fontSize: 15, lineHeight: 22, textAlign: 'left' },
  dim: { color: colors.textDim, fontSize: 13, lineHeight: 19, textAlign: 'left' },
  sectionLabel: {
    color: colors.textFaint,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: space.xl,
    marginBottom: space.sm,
    marginHorizontal: space.lg,
    textAlign: 'left',
  },
});
