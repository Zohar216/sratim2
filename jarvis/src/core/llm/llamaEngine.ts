import type { LlamaContext } from 'llama.rn';

import type { ChatMessage, GenerateOptions, GenerateResult, LlmEngine, LoadOptions } from './engine';

/** llama.cpp via llama.rn. Runs fully offline; GPU (OpenCL/Adreno) when available, else CPU. */
export class LlamaRnEngine implements LlmEngine {
  readonly name = 'llama.cpp (llama.rn)';
  private ctx: LlamaContext | null = null;

  isLoaded(): boolean {
    return this.ctx != null;
  }

  async load({ path, nCtx, useGpu, onProgress }: LoadOptions): Promise<{ gpu: boolean; info: string }> {
    await this.unload();
    const model = path.replace(/^file:\/\//, '');
    const progress = (p: number) => onProgress?.(p / 100);
    const base = { model, n_ctx: nCtx, n_batch: 512, use_mlock: false, use_mmap: true } as const;
    // Lazy import: a missing native module (Expo Go/web) must not crash the whole app.
    const { initLlama } = await import('llama.rn');
    try {
      this.ctx = await initLlama({ ...base, n_gpu_layers: useGpu ? 99 : 0 }, progress);
    } catch (e) {
      if (!useGpu) throw e;
      // Some GPU drivers reject certain models — fall back to CPU instead of failing.
      this.ctx = await initLlama({ ...base, n_gpu_layers: 0 }, progress);
    }
    const ctx = this.ctx;
    return { gpu: ctx.gpu, info: ctx.gpu ? 'GPU' : `CPU${ctx.reasonNoGPU ? ` (${ctx.reasonNoGPU})` : ''}` };
  }

  async generate(messages: ChatMessage[], options: GenerateOptions = {}): Promise<GenerateResult> {
    const ctx = this.ctx;
    if (!ctx) throw new Error('המודל לא טעון');
    const started = Date.now();

    const onAbort = () => {
      void ctx.stopCompletion();
    };
    options.signal?.addEventListener('abort', onAbort);
    try {
      const result = await ctx.completion(
        {
          messages,
          n_predict: options.maxTokens ?? 384,
          temperature: options.temperature ?? 0.2,
          top_p: 0.9,
          response_format: options.jsonSchema
            ? { type: 'json_schema', json_schema: { strict: true, schema: options.jsonSchema } }
            : undefined,
        },
        options.onToken ? (data) => options.onToken?.(data.accumulated_text ?? data.token) : undefined,
      );
      if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      return {
        text: (result.content || result.text || '').trim(),
        latencyMs: Date.now() - started,
        tokensPerSecond: result.timings?.predicted_per_second ?? null,
        promptTokens: result.timings?.prompt_n ?? null,
        outputTokens: result.timings?.predicted_n ?? null,
      };
    } finally {
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  async stop(): Promise<void> {
    await this.ctx?.stopCompletion();
  }

  async unload(): Promise<void> {
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) await ctx.release();
  }
}
