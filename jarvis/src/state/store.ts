import { useSyncExternalStore } from 'react';

import type { StoredMessage } from '../core/memory/repositories';
import { DEFAULT_SETTINGS, type Settings } from './settings';

/** A step of the currently running task, shown live in the chat. */
export type LiveStep = { id: number; label: string; status: 'running' | 'ok' | 'failed' | 'skipped'; message?: string };

export type PendingApproval = { id: number; title: string; details: string; resolve: (approved: boolean) => void };

export type ModelState =
  | { status: 'none' }
  | { status: 'downloading'; progress: number; bytesWritten: number; totalBytes: number }
  | { status: 'downloaded' }
  | { status: 'loading'; progress: number }
  | { status: 'ready'; info: string; loadMs: number }
  | { status: 'error'; error: string };

export type AppState = {
  ready: boolean;
  conversationId: number | null;
  messages: StoredMessage[];
  running: boolean;
  liveSteps: LiveStep[];
  /** Partial model output while generating (for the typing indicator). */
  thinking: string;
  pendingApproval: PendingApproval | null;
  model: ModelState;
  settings: Settings;
  serviceEnabled: boolean;
  listening: boolean;
  partialTranscript: string;
};

const initial: AppState = {
  ready: false,
  conversationId: null,
  messages: [],
  running: false,
  liveSteps: [],
  thinking: '',
  pendingApproval: null,
  model: { status: 'none' },
  settings: DEFAULT_SETTINGS,
  serviceEnabled: false,
  listening: false,
  partialTranscript: '',
};

let state: AppState = initial;
const listeners = new Set<() => void>();

export function getState(): AppState {
  return state;
}

export function setState(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)): void {
  const next = typeof patch === 'function' ? patch(state) : patch;
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Subscribe a component to a slice of the store. Keep selectors returning stable references. */
export function useAppState<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(initial));
}
