import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, Stack } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hasNativeAgent } from '../core/platform/device';
import type { StoredMessage } from '../core/memory/repositories';
import { newConversation, sendUserMessage } from '../state/controller';
import { useAppState } from '../state/store';
import { Banner, LiveSteps, MessageBubble } from '../ui/components';
import { Composer } from '../ui/Composer';
import { colors, common, space } from '../ui/theme';

const EXAMPLES = ['פתח וואטסאפ', 'שלח לאמא שאני מגיע בעוד חצי שעה', 'טיימר 10 דקות', 'תעיר אותי ב-7:00', 'נווט לעזריאלי', 'מה יש על המסך?'];

export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const ready = useAppState((s) => s.ready);
  const messages = useAppState((s) => s.messages);
  const running = useAppState((s) => s.running);
  const liveSteps = useAppState((s) => s.liveSteps);
  const thinking = useAppState((s) => s.thinking);
  const model = useAppState((s) => s.model);
  const serviceEnabled = useAppState((s) => s.serviceEnabled);
  const listRef = useRef<FlatList<StoredMessage>>(null);

  useEffect(() => {
    const t = setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    return () => clearTimeout(t);
  }, [messages.length, liveSteps.length, running]);

  if (!ready) {
    return (
      <View style={[common.screen, styles.center]}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={common.screen} behavior="padding">
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable onPress={() => void newConversation()} hitSlop={10} accessibilityLabel="שיחה חדשה">
                <Ionicons name="create-outline" size={22} color={colors.text} />
              </Pressable>
              <Link href="/history" asChild>
                <Pressable hitSlop={10} accessibilityLabel="היסטוריה">
                  <Ionicons name="time-outline" size={22} color={colors.text} />
                </Pressable>
              </Link>
              <Link href="/settings" asChild>
                <Pressable hitSlop={10} accessibilityLabel="הגדרות">
                  <Ionicons name="settings-outline" size={22} color={colors.text} />
                </Pressable>
              </Link>
            </View>
          ),
        }}
      />

      {!hasNativeAgent && <Banner icon="information-circle" tone="warning" text="רץ בלי המודול המקורי (Expo Go/web). נדרש development build כדי לשלוט בטלפון." />}
      {hasNativeAgent && !serviceEnabled && (
        <Banner icon="accessibility" tone="warning" text="שירות הנגישות כבוי — Jarvis לא יוכל ללחוץ או לשלוח בעצמו. הקש להפעלה." href="/permissions" />
      )}
      {model.status !== 'ready' && model.status !== 'loading' && (
        <Banner icon="hardware-chip-outline" text="מודל ה-AI לא טעון. פקודות בסיסיות עובדות; למשימות חופשיות טען מודל." href="/model" />
      )}
      {model.status === 'loading' && <Banner icon="hourglass-outline" text={`טוען מודל… ${Math.round(model.progress * 100)}%`} />}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        renderItem={({ item }) => <MessageBubble message={item} />}
        contentContainerStyle={{ paddingVertical: space.md, flexGrow: 1 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.logo}>J</Text>
            <Text style={[common.title, { textAlign: 'center' }]}>מה אפשר לעשות בשבילך?</Text>
            <Text style={[common.dim, { textAlign: 'center' }]}>הכל רץ על הטלפון. שום דבר לא נשלח לענן.</Text>
            <View style={styles.examples}>
              {EXAMPLES.map((e) => (
                <Pressable key={e} style={styles.chip} onPress={() => void sendUserMessage(e)}>
                  <Text style={styles.chipText}>{e}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        }
        ListFooterComponent={running ? <LiveSteps steps={liveSteps} thinking={thinking} /> : undefined}
      />

      <View style={{ paddingBottom: insets.bottom }}>
        <Composer />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  headerButtons: { flexDirection: 'row', gap: 18, alignItems: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  logo: {
    fontSize: 44,
    fontWeight: '800',
    color: colors.accent,
    width: 84,
    height: 84,
    lineHeight: 84,
    textAlign: 'center',
    borderRadius: 42,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    marginBottom: space.md,
  },
  examples: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: space.sm, marginTop: space.lg },
  chip: { backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  chipText: { color: colors.text, fontSize: 14 },
});
