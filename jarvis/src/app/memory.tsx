import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { deleteAlias, listAliases, recentTasks, setAlias, type Alias, type TaskLogEntry } from '../core/memory/repositories';
import { Button, Section } from '../ui/components';
import { colors, common, radius, space } from '../ui/theme';

export default function MemoryScreen() {
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [tasks, setTasks] = useState<TaskLogEntry[]>([]);
  const [alias, setAliasText] = useState('');
  const [value, setValue] = useState('');

  const reload = useCallback(() => {
    void listAliases().then(setAliases);
    void recentTasks(30).then(setTasks);
  }, []);

  useFocusEffect(reload);

  return (
    <ScrollView style={common.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <Section title="כינויים">
        <View style={{ padding: space.lg, gap: space.sm }}>
          <Text style={common.dim}>
            למד את Jarvis איך אתה קורא לאנשים. הערך יכול להיות שם איש קשר או מספר טלפון. אפשר גם בצ׳אט: ״תזכור שאמא זה רחל כהן״.
          </Text>
          <View style={styles.inputs}>
            <TextInput style={[styles.input, { flex: 1 }]} value={alias} onChangeText={setAliasText} placeholder="כינוי (אמא)" placeholderTextColor={colors.textFaint} />
            <TextInput style={[styles.input, { flex: 1.4 }]} value={value} onChangeText={setValue} placeholder="שם או מספר" placeholderTextColor={colors.textFaint} />
          </View>
          <Button
            label="הוסף"
            icon="add"
            disabled={!alias.trim() || !value.trim()}
            onPress={async () => {
              await setAlias(alias, value);
              setAliasText('');
              setValue('');
              reload();
            }}
          />
        </View>
        {aliases.map((a) => (
          <View key={a.alias} style={styles.row}>
            <Text style={[common.body, { flex: 1 }]}>
              {a.alias} <Text style={common.dim}>← {a.value}</Text>
            </Text>
            <Pressable hitSlop={10} onPress={() => void deleteAlias(a.alias).then(reload)} accessibilityLabel={`מחק ${a.alias}`}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </Pressable>
          </View>
        ))}
      </Section>

      <Section title="יומן משימות (שמות פעולות בלבד)">
        {tasks.length === 0 && <Text style={[common.dim, { padding: space.lg }]}>אין משימות עדיין.</Text>}
        {tasks.map((t) => (
          <View key={t.id} style={[styles.row, { alignItems: 'flex-start' }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={common.body}>{t.request}</Text>
              <Text style={common.dim} numberOfLines={2}>
                {t.actions.join(' → ') || '—'} · {(t.durationMs / 1000).toFixed(1)} שנ׳
              </Text>
              <Text style={common.dim} numberOfLines={2}>
                {t.outcome}
              </Text>
            </View>
          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  inputs: { flexDirection: 'row', gap: space.sm },
  input: { backgroundColor: colors.surfaceHigh, color: colors.text, borderRadius: radius.sm, paddingHorizontal: space.md, paddingVertical: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
