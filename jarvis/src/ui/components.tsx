import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import type { StoredMessage } from '../core/memory/repositories';
import type { LiveStep } from '../state/store';
import { colors, common, radius, space } from './theme';

type IconName = keyof typeof Ionicons.glyphMap;

// ---- Chat ---------------------------------------------------------------------------------------

export function MessageBubble({ message }: { message: StoredMessage }) {
  const isUser = message.role === 'user';
  const meta = message.meta;
  return (
    <View style={[styles.bubbleRow, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant, meta?.error && styles.bubbleError]}>
        <Text style={[common.body, isUser && { color: '#fff' }]} selectable>
          {message.text}
        </Text>
        {!isUser && meta?.steps && meta.steps.length > 0 && (
          <View style={styles.stepsBox}>
            {meta.steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Ionicons name={s.ok ? 'checkmark-circle' : 'close-circle'} size={14} color={s.ok ? colors.success : colors.danger} />
                <Text style={styles.stepText} numberOfLines={2}>
                  {s.label}
                </Text>
              </View>
            ))}
          </View>
        )}
        {!isUser && meta && (meta.latencyMs != null || meta.source) && (
          <Text style={styles.metaText}>
            {[
              meta.source === 'router' ? 'פקודה מהירה' : meta.source === 'llm' ? 'מודל מקומי' : null,
              meta.latencyMs != null ? `${(meta.latencyMs / 1000).toFixed(1)} שנ׳` : null,
              meta.tokensPerSecond ? `${meta.tokensPerSecond.toFixed(1)} טוקנים/שנ׳` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        )}
      </View>
    </View>
  );
}

export function LiveSteps({ steps, thinking }: { steps: LiveStep[]; thinking: string }) {
  return (
    <View style={[styles.bubbleRow, styles.rowAssistant]}>
      <View style={[styles.bubble, styles.bubbleAssistant]}>
        {steps.map((s) => (
          <View key={s.id} style={styles.stepRow}>
            {s.status === 'running' ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons
                name={s.status === 'ok' ? 'checkmark-circle' : s.status === 'skipped' ? 'remove-circle' : 'close-circle'}
                size={16}
                color={s.status === 'ok' ? colors.success : s.status === 'skipped' ? colors.textDim : colors.danger}
              />
            )}
            <Text style={[styles.stepText, { fontSize: 14 }]}>{s.label}</Text>
          </View>
        ))}
        {(thinking || steps.length === 0) && (
          <View style={styles.stepRow}>
            <ActivityIndicator size="small" color={colors.accent} />
            <Text style={[styles.stepText, { fontSize: 14 }]}>חושב…</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ---- Banners ------------------------------------------------------------------------------------

export function Banner({ icon, text, tone = 'info', href }: { icon: IconName; text: string; tone?: 'info' | 'warning'; href?: Href }) {
  const content = (
    <View style={[styles.banner, tone === 'warning' && { borderColor: colors.warning }]}>
      <Ionicons name={icon} size={18} color={tone === 'warning' ? colors.warning : colors.accent} />
      <Text style={[common.dim, { flex: 1, color: colors.text }]}>{text}</Text>
      {href && <Ionicons name="chevron-back" size={16} color={colors.textDim} />}
    </View>
  );
  return href ? (
    <Link href={href} asChild>
      <Pressable>{content}</Pressable>
    </Link>
  ) : (
    content
  );
}

// ---- Settings rows -------------------------------------------------------------------------------

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <Text style={common.sectionLabel}>{title}</Text>
      <View style={styles.section}>{children}</View>
    </View>
  );
}

export function SwitchRow({ label, description, value, onChange }: { label: string; description?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={common.body}>{label}</Text>
        {description ? <Text style={common.dim}>{description}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.border }} thumbColor="#fff" />
    </View>
  );
}

export function LinkRow({ icon, label, value, href, onPress }: { icon: IconName; label: string; value?: string; href?: Href; onPress?: () => void }) {
  const body = (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.accent} />
      <Text style={[common.body, { flex: 1 }]}>{label}</Text>
      {value ? <Text style={common.dim}>{value}</Text> : null}
      <Ionicons name="chevron-back" size={16} color={colors.textDim} />
    </View>
  );
  if (href) {
    return (
      <Link href={href} asChild>
        <Pressable>{body}</Pressable>
      </Link>
    );
  }
  return <Pressable onPress={onPress}>{body}</Pressable>;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: 'primary' | 'secondary' | 'danger';
  icon?: IconName;
  disabled?: boolean;
}) {
  const bg = tone === 'primary' ? colors.accent : tone === 'danger' ? colors.danger : colors.surfaceHigh;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 }]}
    >
      {icon && <Ionicons name={icon} size={18} color="#fff" />}
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function StatusDot({ ok }: { ok: boolean }) {
  return <View style={[styles.dot, { backgroundColor: ok ? colors.success : colors.warning }]} />;
}

const styles = StyleSheet.create({
  bubbleRow: { flexDirection: 'row', paddingHorizontal: space.md, marginVertical: space.xs },
  rowUser: { justifyContent: 'flex-start' },
  rowAssistant: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '86%', borderRadius: radius.lg, paddingHorizontal: space.lg, paddingVertical: space.md },
  bubbleUser: { backgroundColor: colors.userBubble, borderBottomStartRadius: 6 },
  bubbleAssistant: { backgroundColor: colors.surface, borderBottomEndRadius: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  bubbleError: { borderColor: colors.danger },
  stepsBox: { marginTop: space.sm, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: space.sm },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginVertical: 2 },
  stepText: { color: colors.textDim, fontSize: 12, flexShrink: 1, textAlign: 'left' },
  metaText: { color: colors.textFaint, fontSize: 11, marginTop: space.sm, textAlign: 'left' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.md,
    marginTop: space.sm,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accentDim,
  },
  section: {
    backgroundColor: colors.surface,
    marginHorizontal: space.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    borderRadius: radius.md,
    paddingVertical: 13,
    paddingHorizontal: space.lg,
  },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
