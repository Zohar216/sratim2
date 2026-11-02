import { I18nManager } from 'react-native';

import { runTask, stopCurrentTask } from '../core/agent/agent';
import { isDownloaded } from '../core/llm/modelManager';
import { currentPreset, loadModel, refreshModelStatus } from '../core/llm/service';
import {
  addMessage,
  createConversation,
  deleteAllHistory,
  getMessages,
  listConversations,
  loadSetting,
  saveSetting,
} from '../core/memory/repositories';
import * as device from '../core/platform/device';
import { speak } from '../core/voice/speech';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { getState, setState } from './store';

/** App-level actions used by the screens. Keeps UI components free of business logic. */

let booted = false;

export async function bootstrap(): Promise<void> {
  if (booted) return;
  booted = true;

  // Hebrew UI: force RTL layout (takes effect from the next app start if it was off).
  if (!I18nManager.isRTL) {
    I18nManager.allowRTL(true);
    I18nManager.forceRTL(true);
  }

  const saved = await loadSetting<Partial<Settings>>('settings', {});
  const settings = { ...DEFAULT_SETTINGS, ...saved };
  setState({ settings });
  device.setExtraBlockedPackages(settings.extraBlockedPackages);

  const conversations = await listConversations();
  const conversationId = conversations[0]?.id ?? (await createConversation('שיחה חדשה'));
  setState({ conversationId, messages: await getMessages(conversationId), serviceEnabled: device.isServiceRunning(), ready: true });

  device.onServiceStateChanged((enabled) => setState({ serviceEnabled: enabled }));

  refreshModelStatus();
  try {
    if (settings.autoLoadModel && isDownloaded(currentPreset())) void loadModel();
  } catch {
    // file system unavailable (web) — ignore
  }
}

export function refreshServiceState(): void {
  setState({ serviceEnabled: device.isServiceRunning() });
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const settings = { ...getState().settings, ...patch };
  setState({ settings });
  await saveSetting('settings', settings);
  if (patch.extraBlockedPackages) device.setExtraBlockedPackages(settings.extraBlockedPackages);
}

export async function sendUserMessage(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) return;
  const { conversationId, messages } = getState();
  if (conversationId == null) return;

  const userMsg = await addMessage(conversationId, 'user', trimmed);
  setState((s) => ({ messages: [...s.messages, userMsg] }));

  const history = messages
    .filter((m) => m.role !== 'system')
    .slice(-8)
    .map((m) => ({ role: m.role as 'user' | 'assistant', text: m.text }));

  const outcome = await runTask(trimmed, history);
  const reply = await addMessage(conversationId, 'assistant', outcome.reply, outcome.meta);
  setState((s) => ({ messages: [...s.messages, reply], liveSteps: [] }));

  if (getState().settings.speakReplies) speak(outcome.reply);
}

export function stopTask(): void {
  stopCurrentTask();
  const pending = getState().pendingApproval;
  pending?.resolve(false);
}

export function answerApproval(approved: boolean): void {
  getState().pendingApproval?.resolve(approved);
}

export async function newConversation(): Promise<void> {
  const id = await createConversation('שיחה חדשה');
  setState({ conversationId: id, messages: [] });
}

export async function openConversation(id: number): Promise<void> {
  setState({ conversationId: id, messages: await getMessages(id) });
}

export async function wipeHistory(): Promise<void> {
  await deleteAllHistory();
  await newConversation();
}
