import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { MODEL_PRESETS } from '../core/llm/models';
import { updateSettings, wipeHistory } from '../state/controller';
import { useAppState } from '../state/store';
import { Button, LinkRow, Section, SwitchRow } from '../ui/components';
import { colors, common, radius, space } from '../ui/theme';

export default function SettingsScreen() {
  const settings = useAppState((s) => s.settings);
  const model = useAppState((s) => s.model);
  const serviceEnabled = useAppState((s) => s.serviceEnabled);
  const [blocked, setBlocked] = useState(settings.extraBlockedPackages.join('\n'));

  const modelName = MODEL_PRESETS.find((p) => p.id === settings.modelId)?.name ?? 'מותאם אישית';

  return (
    <ScrollView style={common.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Section title="כללי">
        <LinkRow icon="hardware-chip-outline" label="מודל AI" value={`${modelName}${model.status === 'ready' ? ' ✓' : ''}`} href="/model" />
        <LinkRow icon="shield-checkmark-outline" label="הרשאות ואבטחה" value={serviceEnabled ? 'נגישות פעילה' : 'נגישות כבויה'} href="/permissions" />
        <LinkRow icon="bookmark-outline" label="זיכרון וכינויים" href="/memory" />
        <LinkRow icon="time-outline" label="היסטוריית שיחות" href="/history" />
      </Section>

      <Section title="אישורים">
        <SwitchRow
          label="אישור גם לפעולות בינוניות"
          description="הקלדה, כיוון שעון, הכנת הודעה. (שליחה/מחיקה/רכישה תמיד דורשות אישור.)"
          value={settings.confirmTier2}
          onChange={(v) => void updateSettings({ confirmTier2: v })}
        />
        <SwitchRow
          label="שליטה בממשק של אפליקציות"
          description="לחיצות, הקלדה וגלילה דרך שירות הנגישות."
          value={settings.allowUiAutomation}
          onChange={(v) => void updateSettings({ allowUiAutomation: v })}
        />
      </Section>

      <Section title="קול">
        <SwitchRow label="הקראת תשובות" value={settings.speakReplies} onChange={(v) => void updateSettings({ speakReplies: v })} />
        <SwitchRow
          label="שליחה אוטומטית אחרי דיבור"
          description="כבוי = הטקסט שזוהה נכנס לתיבה כדי שתוכל לתקן."
          value={settings.voiceAutoSend}
          onChange={(v) => void updateSettings({ voiceAutoSend: v })}
        />
        <SwitchRow
          label="זיהוי דיבור על המכשיר"
          description="כשנתמך, האודיו לא יוצא מהטלפון. דורש חבילת שפה עברית בהגדרות Google."
          value={settings.voiceOnDevice}
          onChange={(v) => void updateSettings({ voiceOnDevice: v })}
        />
      </Section>

      <Section title="סוכן">
        <SwitchRow
          label="משימות ארוכות (עד 20 צעדים)"
          description="ברירת מחדל: 12 צעדים למשימה."
          value={settings.maxSteps > 12}
          onChange={(v) => void updateSettings({ maxSteps: v ? 20 : 12 })}
        />
      </Section>

      <Section title="אפליקציות חסומות נוספות">
        <View style={{ padding: space.lg, gap: space.sm }}>
          <Text style={common.dim}>
            שם חבילה בכל שורה (למשל com.example.app). אפליקציות בנקים, תשלומים והגדרות מערכת חסומות תמיד.
          </Text>
          <TextInput
            value={blocked}
            onChangeText={setBlocked}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholder="com.example.app"
            placeholderTextColor={colors.textFaint}
          />
          <Button
            label="שמור"
            tone="secondary"
            onPress={() =>
              void updateSettings({
                extraBlockedPackages: blocked
                  .split(/\s+/)
                  .map((s) => s.trim())
                  .filter(Boolean),
              })
            }
          />
        </View>
      </Section>

      <Section title="פרטיות">
        <View style={{ padding: space.lg, gap: space.md }}>
          <Text style={common.dim}>
            Jarvis לא שומר סיסמאות, לא שומר צילומי מסך ולא שומר את תוכן המסך. היסטוריית השיחות והכינויים נשמרים רק בטלפון.
          </Text>
          <Button
            label="מחק את כל ההיסטוריה"
            tone="danger"
            icon="trash"
            onPress={() =>
              Alert.alert('למחוק הכל?', 'כל השיחות ויומן המשימות יימחקו. הכינויים יישמרו.', [
                { text: 'ביטול', style: 'cancel' },
                { text: 'מחק', style: 'destructive', onPress: () => void wipeHistory() },
              ])
            }
          />
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 80,
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    borderRadius: radius.sm,
    padding: space.md,
    textAlign: 'left',
    writingDirection: 'ltr',
    textAlignVertical: 'top',
  },
});
