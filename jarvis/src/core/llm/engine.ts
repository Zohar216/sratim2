/**
 * Engine-agnostic interface for the on-device LLM. The agent only talks to this interface,
 * so swapping llama.rn for LiteRT-LM (or another runtime) does not affect the rest of the app.
 */
export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export type GenerateOptions = {
  maxTokens?: number;
  temperature?: number;
  /** JSON Schema the output must satisfy (grammar-constrained decoding). */
  jsonSchema?: object;
  onToken?: (partial: string) => void;
  signal?: AbortSignal;
};

export type GenerateResult = {
  text: string;
  latencyMs: number;
  tokensPerSecond: number | null;
  promptTokens: number | null;
  outputTokens: number | null;
};

export type LoadOptions = {
  path: string;
  nCtx: number;
  useGpu: boolean;
  onProgress?: (fraction: number) => void;
};

export interface LlmEngine {
  readonly name: string;
  isLoaded(): boolean;
  load(options: LoadOptions): Promise<{ gpu: boolean; info: string }>;
  generate(messages: ChatMessage[], options?: GenerateOptions): Promise<GenerateResult>;
  stop(): Promise<void>;
  unload(): Promise<void>;
}
