import { DEFAULT_MODEL_ID } from '../core/llm/models';

export type Settings = {
  /** Ask before tier-2 actions (typing, alarms, composing). Tier 3 always asks. */
  confirmTier2: boolean;
  /** Allow clicks/typing/scrolling in other apps through the accessibility service. */
  allowUiAutomation: boolean;
  /** Read replies aloud. */
  speakReplies: boolean;
  /** Send the recognised speech immediately when the user stops talking. */
  voiceAutoSend: boolean;
  /** Prefer on-device speech recognition (offline) when the phone supports it. */
  voiceOnDevice: boolean;
  /** Selected model (preset id or "custom:<file>"). */
  modelId: string;
  customModelUrl: string;
  /** Load the model automatically when the app starts. */
  autoLoadModel: boolean;
  useGpu: boolean;
  nCtx: number;
  /** Max planner steps for one task (UI tasks may need several). */
  maxSteps: number;
  /** Extra package names the user blocked (in addition to the built-in list). */
  extraBlockedPackages: string[];
};

export const DEFAULT_SETTINGS: Settings = {
  confirmTier2: false,
  allowUiAutomation: true,
  speakReplies: true,
  voiceAutoSend: true,
  voiceOnDevice: true,
  modelId: DEFAULT_MODEL_ID,
  customModelUrl: '',
  autoLoadModel: true,
  useGpu: true,
  nCtx: 4096,
  maxSteps: 12,
  extraBlockedPackages: [],
};
