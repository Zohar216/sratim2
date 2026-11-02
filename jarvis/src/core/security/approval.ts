import { AppState } from 'react-native';
import * as Haptics from 'expo-haptics';

import { getState, setState } from '../../state/store';
import { overlayApproval } from '../platform/device';

let nextId = 1;
const TIMEOUT_MS = 90_000;

/**
 * Asks the user to approve an action. If Jarvis is on screen, an in-app sheet is shown;
 * if another app is in front (Jarvis is operating it), a native overlay card is shown instead.
 * No answer within 90s, a closed overlay, or any error = DENIED (fail closed).
 */
export async function requestApproval(title: string, details: string, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});

  if (AppState.currentState !== 'active') {
    try {
      return await withTimeout(overlayApproval(title, details), signal);
    } catch {
      return false;
    }
  }

  return withTimeout(
    new Promise<boolean>((resolve) => {
      const id = nextId++;
      setState({
        pendingApproval: {
          id,
          title,
          details,
          resolve: (approved) => {
            if (getState().pendingApproval?.id === id) setState({ pendingApproval: null });
            resolve(approved);
          },
        },
      });
    }),
    signal,
  ).finally(() => setState({ pendingApproval: null }));
}

function withTimeout(p: Promise<boolean>, signal?: AbortSignal): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), TIMEOUT_MS);
    const onAbort = () => resolve(false);
    signal?.addEventListener('abort', onAbort, { once: true });
    p.then(resolve, () => resolve(false)).finally(() => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    });
  });
}
