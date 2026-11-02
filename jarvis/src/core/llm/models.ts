/**
 * Model catalogue. All models are GGUF files run fully on-device by llama.cpp (llama.rn).
 * Sizes are approximate. Any other GGUF can be used via "custom URL" in the model screen.
 *
 * Why GGUF/llama.cpp and not LiteRT-LM? See README → "Architecture decisions". In short:
 * llama.rn has an Expo config plugin, a stable React Native API and — most importantly for an
 * agent — grammar/JSON-schema constrained decoding, which guarantees the model can only emit
 * valid action JSON. The engine sits behind the `LlmEngine` interface, so a LiteRT-LM native
 * module can be added later without touching the agent.
 */
export type ModelPreset = {
  id: string;
  name: string;
  description: string;
  url: string;
  fileName: string;
  sizeGb: number;
  /** Recommended context window. */
  nCtx: number;
};

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: 'gemma-3-4b-q4',
    name: 'Gemma 3 4B (מומלץ)',
    description: 'איזון טוב בין איכות עברית למהירות. מתאים ל-S25.',
    url: 'https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-4b-it-Q4_K_M.gguf',
    sizeGb: 2.5,
    nCtx: 4096,
  },
  {
    id: 'qwen3-4b-2507-q4',
    name: 'Qwen3 4B Instruct 2507',
    description: 'חזק מאוד בתכנון פעולות ו-JSON. עברית סבירה.',
    url: 'https://huggingface.co/unsloth/Qwen3-4B-Instruct-2507-GGUF/resolve/main/Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    fileName: 'Qwen3-4B-Instruct-2507-Q4_K_M.gguf',
    sizeGb: 2.5,
    nCtx: 4096,
  },
  {
    id: 'gemma-3-1b-q4',
    name: 'Gemma 3 1B (מהיר)',
    description: 'קטן ומהיר מאוד, אבל פחות מדויק במשימות מורכבות.',
    url: 'https://huggingface.co/unsloth/gemma-3-1b-it-GGUF/resolve/main/gemma-3-1b-it-Q4_K_M.gguf',
    fileName: 'gemma-3-1b-it-Q4_K_M.gguf',
    sizeGb: 0.8,
    nCtx: 4096,
  },
];

export const DEFAULT_MODEL_ID = MODEL_PRESETS[0].id;

export function customPreset(url: string): ModelPreset {
  const fileName = decodeURIComponent(url.split('?')[0].split('/').pop() || 'custom.gguf');
  return {
    id: `custom:${fileName}`,
    name: fileName,
    description: 'מודל מותאם אישית',
    url,
    fileName: fileName.endsWith('.gguf') ? fileName : `${fileName}.gguf`,
    sizeGb: 0,
    nCtx: 4096,
  };
}
