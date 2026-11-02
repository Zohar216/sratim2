import { Directory, File, Paths } from 'expo-file-system';

import type { ModelPreset } from './models';

/**
 * Downloads and stores model files in the app's private storage (…/files/models).
 * Download is the only time Jarvis needs the internet; after that everything is offline.
 */
function modelsDir(): Directory {
  const dir = new Directory(Paths.document, 'models');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function modelFile(preset: ModelPreset): File {
  return new File(modelsDir(), preset.fileName);
}

export function isDownloaded(preset: ModelPreset): boolean {
  const f = modelFile(preset);
  // A partially downloaded file never has the final name (see downloadModel), so exists == complete.
  return f.exists && (f.size ?? 0) > 50 * 1024 * 1024;
}

export type DownloadProgress = { fraction: number; bytesWritten: number; totalBytes: number };

export async function downloadModel(
  preset: ModelPreset,
  onProgress: (p: DownloadProgress) => void,
  signal?: AbortSignal,
): Promise<File> {
  const final = modelFile(preset);
  if (isDownloaded(preset)) return final;

  const partial = new File(modelsDir(), `${preset.fileName}.part`);
  if (partial.exists) partial.delete();

  const downloaded = await File.downloadFileAsync(preset.url, partial, {
    idempotent: true,
    signal,
    onProgress: ({ bytesWritten, totalBytes }) => {
      onProgress({ bytesWritten, totalBytes, fraction: totalBytes > 0 ? bytesWritten / totalBytes : 0 });
    },
  });

  if ((downloaded.size ?? 0) < 50 * 1024 * 1024) {
    downloaded.delete();
    throw new Error('הקובץ שהורד קטן מדי — כנראה שהקישור אינו קובץ GGUF תקין.');
  }
  if (final.exists) final.delete();
  downloaded.move(final);
  return final;
}

export function deleteModel(preset: ModelPreset): void {
  const f = modelFile(preset);
  if (f.exists) f.delete();
  const partial = new File(modelsDir(), `${preset.fileName}.part`);
  if (partial.exists) partial.delete();
}

export function freeSpaceGb(): number | null {
  try {
    return Paths.availableDiskSpace / 1024 ** 3;
  } catch {
    return null;
  }
}
