import { getState, setState } from '../../state/store';
import type { LlmEngine } from './engine';
import { LlamaRnEngine } from './llamaEngine';
import { customPreset, MODEL_PRESETS, type ModelPreset } from './models';
import { deleteModel, downloadModel, isDownloaded, modelFile } from './modelManager';

/** Owns the single on-device model instance and mirrors its lifecycle into the app store. */

let engine: LlmEngine | null = null;
let downloadAbort: AbortController | null = null;

function createEngine(): LlmEngine | null {
  try {
    return new LlamaRnEngine();
  } catch {
    return null; // llama.rn not compiled in (Expo Go / web)
  }
}

export function getEngine(): LlmEngine | null {
  return engine?.isLoaded() ? engine : null;
}

export function currentPreset(): ModelPreset {
  const { modelId, customModelUrl } = getState().settings;
  if (modelId.startsWith('custom:') && customModelUrl) return customPreset(customModelUrl);
  return MODEL_PRESETS.find((p) => p.id === modelId) ?? MODEL_PRESETS[0];
}

export function refreshModelStatus(): void {
  const s = getState().model.status;
  if (s === 'downloading' || s === 'loading' || s === 'ready') return;
  try {
    setState({ model: isDownloaded(currentPreset()) ? { status: 'downloaded' } : { status: 'none' } });
  } catch {
    setState({ model: { status: 'none' } });
  }
}

export async function startDownload(): Promise<void> {
  const preset = currentPreset();
  downloadAbort?.abort();
  downloadAbort = new AbortController();
  setState({ model: { status: 'downloading', progress: 0, bytesWritten: 0, totalBytes: 0 } });
  try {
    await downloadModel(
      preset,
      (p) => setState({ model: { status: 'downloading', progress: p.fraction, bytesWritten: p.bytesWritten, totalBytes: p.totalBytes } }),
      downloadAbort.signal,
    );
    setState({ model: { status: 'downloaded' } });
  } catch (e) {
    const aborted = downloadAbort?.signal.aborted;
    setState({ model: aborted ? { status: 'none' } : { status: 'error', error: `ההורדה נכשלה: ${errorText(e)}` } });
  } finally {
    downloadAbort = null;
  }
}

export function cancelDownload(): void {
  downloadAbort?.abort();
}

export async function loadModel(): Promise<void> {
  const preset = currentPreset();
  if (!isDownloaded(preset)) {
    setState({ model: { status: 'none' } });
    return;
  }
  engine ??= createEngine();
  if (!engine) {
    setState({ model: { status: 'error', error: 'מנוע ה-AI לא זמין בגרסה הזו (צריך development build ולא Expo Go).' } });
    return;
  }
  const { useGpu, nCtx } = getState().settings;
  const started = Date.now();
  setState({ model: { status: 'loading', progress: 0 } });
  try {
    const { info } = await engine.load({
      path: modelFile(preset).uri,
      nCtx: Math.min(nCtx, preset.nCtx * 2),
      useGpu,
      onProgress: (p) => setState({ model: { status: 'loading', progress: p } }),
    });
    setState({ model: { status: 'ready', info: `${preset.name} · ${info}`, loadMs: Date.now() - started } });
  } catch (e) {
    setState({ model: { status: 'error', error: `טעינת המודל נכשלה: ${errorText(e)}` } });
  }
}

export async function unloadModel(): Promise<void> {
  await engine?.unload();
  setState({ model: { status: 'none' } });
  refreshModelStatus();
}

export async function removeModel(): Promise<void> {
  await engine?.unload();
  deleteModel(currentPreset());
  setState({ model: { status: 'none' } });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
