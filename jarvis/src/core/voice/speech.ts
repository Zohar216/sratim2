import * as Speech from 'expo-speech';
import type { ExpoSpeechRecognitionModule as RecognitionModule } from 'expo-speech-recognition';

/**
 * Voice I/O.
 * - Input: Android SpeechRecognizer (he-IL). On-device recognition when the phone supports it,
 *   so audio does not leave the phone. Push-to-talk only — no background listening.
 * - Output: Android TextToSpeech (he-IL).
 */

export type ListenHandlers = {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

let subs: { remove: () => void }[] = [];

/** Lazily loaded so a build without the native module (Expo Go/web) still starts. */
function recognizer(): typeof RecognitionModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require('expo-speech-recognition') as typeof import('expo-speech-recognition')).ExpoSpeechRecognitionModule;
  } catch {
    return null;
  }
}

function cleanup() {
  subs.forEach((s) => s.remove());
  subs = [];
}

export async function startListening(handlers: ListenHandlers, preferOnDevice: boolean): Promise<boolean> {
  const ExpoSpeechRecognitionModule = recognizer();
  if (!ExpoSpeechRecognitionModule) {
    handlers.onError('זיהוי דיבור לא זמין בגרסה הזו.');
    return false;
  }
  const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
  if (!perm.granted) {
    handlers.onError('אין הרשאה למיקרופון.');
    return false;
  }
  cleanup();
  subs.push(
    ExpoSpeechRecognitionModule.addListener('result', (e) => {
      const text = e.results[0]?.transcript ?? '';
      if (e.isFinal) {
        handlers.onFinal(text);
      } else {
        handlers.onPartial(text);
      }
    }),
    ExpoSpeechRecognitionModule.addListener('error', (e) => {
      if (e.error !== 'aborted' && e.error !== 'no-speech') handlers.onError(`שגיאת זיהוי דיבור: ${e.message || e.error}`);
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => {
      cleanup();
      handlers.onEnd();
    }),
  );

  let onDevice = false;
  try {
    onDevice = preferOnDevice && ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
  } catch {
    onDevice = false;
  }

  ExpoSpeechRecognitionModule.start({
    lang: 'he-IL',
    interimResults: true,
    continuous: false,
    addsPunctuation: true,
    requiresOnDeviceRecognition: onDevice,
  });
  return true;
}

export function stopListening(): void {
  try {
    recognizer()?.stop();
  } catch {
    // not started
  }
}

export function abortListening(): void {
  try {
    recognizer()?.abort();
  } catch {
    // not started
  }
  cleanup();
}

export function speak(text: string): void {
  void Speech.stop();
  // Strip emoji/symbols the TTS would read literally.
  const clean = text.replace(/[\u{1F300}-\u{1FAFF}✓✔✅]/gu, '').trim();
  if (clean) Speech.speak(clean, { language: 'he-IL', rate: 1.0 });
}

export function stopSpeaking(): void {
  void Speech.stop();
}
