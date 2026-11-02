import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { abortListening, startListening, stopListening, stopSpeaking } from '../core/voice/speech';
import { sendUserMessage, stopTask } from '../state/controller';
import { getState, setState, useAppState } from '../state/store';
import { colors, radius, space } from './theme';

/** Text input + push-to-talk mic + send. While a task runs, the send button becomes STOP. */
export function Composer() {
  const [text, setText] = useState('');
  const running = useAppState((s) => s.running);
  const listening = useAppState((s) => s.listening);
  const partial = useAppState((s) => s.partialTranscript);
  const finalRef = useRef('');

  const send = (value: string) => {
    const v = value.trim();
    if (!v || getState().running) return;
    setText('');
    void sendUserMessage(v);
  };

  const toggleMic = async () => {
    if (listening) {
      stopListening();
      return;
    }
    stopSpeaking();
    finalRef.current = '';
    setState({ listening: true, partialTranscript: '' });
    const started = await startListening(
      {
        onPartial: (t) => setState({ partialTranscript: t }),
        onFinal: (t) => {
          finalRef.current = t;
          setState({ partialTranscript: t });
        },
        onEnd: () => {
          const heard = finalRef.current || getState().partialTranscript;
          setState({ listening: false, partialTranscript: '' });
          if (!heard) return;
          if (getState().settings.voiceAutoSend) send(heard);
          else setText(heard);
        },
        onError: (message) => {
          setState({ listening: false, partialTranscript: '' });
          setText(message);
        },
      },
      getState().settings.voiceOnDevice,
    );
    if (!started) setState({ listening: false });
  };

  return (
    <View style={styles.container}>
      <Pressable
        onPress={toggleMic}
        onLongPress={() => {
          abortListening();
          setState({ listening: false, partialTranscript: '' });
        }}
        style={[styles.iconButton, listening && { backgroundColor: colors.danger }]}
        accessibilityLabel={listening ? 'הפסק להקשיב' : 'דבר'}
      >
        <Ionicons name={listening ? 'mic' : 'mic-outline'} size={22} color="#fff" />
      </Pressable>
      <TextInput
        style={styles.input}
        value={listening ? partial : text}
        onChangeText={setText}
        placeholder={listening ? 'מקשיב…' : 'מה לעשות?'}
        placeholderTextColor={colors.textFaint}
        multiline
        editable={!listening}
        onSubmitEditing={() => send(text)}
        submitBehavior="submit"
        returnKeyType="send"
        textAlign="right"
      />
      {running ? (
        <Pressable onPress={stopTask} style={[styles.iconButton, { backgroundColor: colors.danger }]} accessibilityLabel="עצור">
          <Ionicons name="stop" size={20} color="#fff" />
        </Pressable>
      ) : (
        <Pressable
          onPress={() => send(text)}
          disabled={!text.trim()}
          style={[styles.iconButton, { backgroundColor: text.trim() ? colors.accent : colors.surfaceHigh }]}
          accessibilityLabel="שלח"
        >
          <Ionicons name="arrow-up" size={20} color="#fff" />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 130,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 16,
    paddingHorizontal: space.lg,
    paddingTop: 11,
    paddingBottom: 11,
    writingDirection: 'rtl',
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceHigh,
  },
});
