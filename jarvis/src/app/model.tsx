import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { isDownloaded, freeSpaceGb } from '../core/llm/modelManager';
import { MODEL_PRESETS, customPreset } from '../core/llm/models';
import { cancelDownload, currentPreset, loadModel, refreshModelStatus, removeModel, startDownload, unloadModel } from '../core/llm/service';
import { updateSettings } from '../state/controller';
import { getState, setState, useAppState } from '../state/store';
import { Button, Section, SwitchRow } from '../ui/components';
import { colors, common, radius, space } from '../ui/theme';

export default function ModelScreen() {
  const model = useAppState((s) => s.model);
  const settings = useAppState((s) => s.settings);
  const [customUrl, setCustomUrl] = useState(settings.customModelUrl);
  const preset = currentPreset();
  const free = freeSpaceGb();

  useEffect(() => {
    refreshModelStatus();
  }, [settings.modelId, settings.customModelUrl]);

  const select = async (id: string) => {
    if (getState().model.status === 'downloading' || getState().model.status === 'loading') return;
    await unloadModel();
    await updateSettings({ modelId: id });
    setState({ model: { status: 'none' } });
    refreshModelStatus();
  };

  const busy = model.status === 'downloading' || model.status === 'loading';

  return (
    <ScrollView style={common.screen} contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={[common.card, styles.statusCard]}>
        <Text style={common.title}>{preset.name}</Text>
        <Text style={common.dim}>{statusText(model)}</Text>
        {model.status === 'downloading' && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(model.progress * 100)}%` }]} />
          </View>
        )}
        {model.status === 'loading' && (
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(model.progress * 100)}%` }]} />
          </View>
        )}
        <View style={styles.buttons}>
          {model.status === 'none' && <Button label={`הורד (${preset.sizeGb ? `${preset.sizeGb}GB` : 'גודל לא ידוע'})`} icon="cloud-download" onPress={() => void startDownload()} />}
          {model.status === 'error' && <Button label="נסה שוב" icon="refresh" onPress={() => (isDownloaded(preset) ? void loadModel() : void startDownload())} />}
          {model.status === 'downloading' && <Button label="בטל הורדה" tone="secondary" onPress={cancelDownload} />}
          {model.status === 'downloaded' && <Button label="טען מודל" icon="flash" onPress={() => void loadModel()} />}
          {model.status === 'ready' && <Button label="פרוק מהזיכרון" tone="secondary" onPress={() => void unloadModel()} />}
          {(model.status === 'downloaded' || model.status === 'ready') && <Button label="מחק קובץ" tone="danger" onPress={() => void removeModel()} />}
        </View>
        {free != null && <Text style={common.dim}>מקום פנוי בטלפון: {free.toFixed(1)}GB</Text>}
      </View>

      <Section title="בחירת מודל">
        {MODEL_PRESETS.map((p) => (
          <Pressable key={p.id} onPress={() => void select(p.id)} disabled={busy} style={styles.option}>
            <View style={[styles.radio, settings.modelId === p.id && styles.radioOn]} />
            <View style={{ flex: 1 }}>
              <Text style={common.body}>{p.name}</Text>
              <Text style={common.dim}>
                {p.description} · {p.sizeGb}GB{safeDownloaded(p) ? ' · הורד ✓' : ''}
              </Text>
            </View>
          </Pressable>
        ))}
        <View style={styles.option}>
          <View style={[styles.radio, settings.modelId.startsWith('custom:') && styles.radioOn]} />
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={common.body}>מודל מותאם אישית (GGUF)</Text>
            <TextInput
              value={customUrl}
              onChangeText={setCustomUrl}
              placeholder="https://huggingface.co/…/model-Q4_K_M.gguf"
              placeholderTextColor={colors.textFaint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
            />
            <Button
              label="השתמש בקישור"
              tone="secondary"
              disabled={busy || !/^https:\/\/.+/.test(customUrl.trim())}
              onPress={async () => {
                const url = customUrl.trim();
                await unloadModel();
                await updateSettings({ customModelUrl: url, modelId: customPreset(url).id });
                setState({ model: { status: 'none' } });
                refreshModelStatus();
              }}
            />
          </View>
        </View>
      </Section>

      <Section title="ביצועים">
        <SwitchRow label="שימוש ב-GPU" description="מהיר יותר ב-S25. אם הטעינה נכשלת, Jarvis עובר ל-CPU אוטומטית." value={settings.useGpu} onChange={(v) => void updateSettings({ useGpu: v })} />
        <SwitchRow label="טעינה אוטומטית בהפעלה" value={settings.autoLoadModel} onChange={(v) => void updateSettings({ autoLoadModel: v })} />
        <SwitchRow
          label="חלון הקשר גדול (8K)"
          description="מאפשר משימות ארוכות יותר אבל צורך יותר זיכרון."
          value={settings.nCtx > 4096}
          onChange={(v) => void updateSettings({ nCtx: v ? 8192 : 4096 })}
        />
      </Section>

      <Text style={[common.dim, { margin: space.lg }]}>
        ההורדה היא הפעם היחידה ש-Jarvis משתמש באינטרנט. אחרי זה המודל רץ על הטלפון בלבד — אפשר לעבור למצב טיסה ולבדוק. זמן התגובה ומהירות
        הטוקנים מוצגים מתחת לכל תשובה של המודל.
      </Text>
    </ScrollView>
  );
}

function safeDownloaded(p: (typeof MODEL_PRESETS)[number]): boolean {
  try {
    return isDownloaded(p);
  } catch {
    return false;
  }
}

function statusText(model: ReturnType<typeof getState>['model']): string {
  switch (model.status) {
    case 'none':
      return 'לא הורד עדיין.';
    case 'downloading':
      return `מוריד… ${Math.round(model.progress * 100)}% (${(model.bytesWritten / 1024 ** 3).toFixed(2)} / ${(model.totalBytes / 1024 ** 3).toFixed(2)}GB)`;
    case 'downloaded':
      return 'הורד. לא טעון בזיכרון.';
    case 'loading':
      return `טוען… ${Math.round(model.progress * 100)}%`;
    case 'ready':
      return `מוכן ✓ ${model.info} · נטען ב-${(model.loadMs / 1000).toFixed(1)} שנ׳`;
    case 'error':
      return model.error;
  }
}

const styles = StyleSheet.create({
  statusCard: { margin: space.md, gap: space.sm },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surfaceHigh, overflow: 'hidden' },
  progressFill: { height: 8, backgroundColor: colors.accent },
  option: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    padding: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: colors.textDim, marginTop: 2 },
  radioOn: { borderColor: colors.accent, backgroundColor: colors.accent },
  input: {
    backgroundColor: colors.surfaceHigh,
    color: colors.text,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    textAlign: 'left',
    writingDirection: 'ltr',
  },
});
