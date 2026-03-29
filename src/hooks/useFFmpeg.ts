import { useState, useCallback, useRef } from 'react';
import { FFmpeg } from '@ffmpeg/ffmpeg';

/** Clip descriptor for trim & concat */
export interface ClipInput {
  url: string;
  start: number;
  end: number;
  totalDuration?: number;
  keepAudio?: boolean;
  blob?: Blob;
}

/** Progress info */
export interface FFmpegProgress {
  phase: 'loading' | 'downloading' | 'trimming' | 'concatenating' | 'done';
  percent: number;
  detail?: string;
}

let ffmpegInstance: FFmpeg | null = null;
let loadPromise: Promise<void> | null = null;

const CDN = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.6/dist/esm';

/** Fetch a file and create a blob URL, reporting progress along the way. */
async function fetchToBlobURL(
  url: string,
  mimeType: string,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const total = Number(res.headers.get('content-length') || 0);
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.length;
    onProgress?.(loaded, total);
  }
  return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: mimeType }));
}

function fmtBytes(n: number) {
  return n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${(n / 1024).toFixed(0)} KB`;
}

export function terminateFFmpeg() {
  if (ffmpegInstance) {
    try { ffmpegInstance.terminate(); } catch {}
    ffmpegInstance = null;
    loadPromise = null;
  }
}

function needsReencode(clip: ClipInput): boolean {
  if (clip.start > 0.05) return true;
  if (clip.totalDuration != null && clip.end < clip.totalDuration - 0.05) return true;
  return false;
}

async function fetchVideo(url: string, blob?: Blob): Promise<Uint8Array> {
  if (blob) return new Uint8Array(await blob.arrayBuffer());
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download video: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function useFFmpeg() {
  const [loaded, setLoaded] = useState(!!ffmpegInstance?.loaded);
  const [loading, setLoading] = useState(loadPromise != null && !ffmpegInstance?.loaded);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<FFmpegProgress | null>(null);
  const abortRef = useRef(false);

  const getFFmpeg = useCallback(() => {
    if (!ffmpegInstance) ffmpegInstance = new FFmpeg();
    return ffmpegInstance;
  }, []);

  const preload = useCallback(async () => {
    const ffmpeg = getFFmpeg();
    if (ffmpeg.loaded) { setLoaded(true); return; }
    if (loadPromise) {
      setLoading(true);
      try { await loadPromise; setLoaded(true); } finally { setLoading(false); }
      return;
    }

    setLoading(true);
    setLoadError(null);
    setProgress({ phase: 'loading', percent: 5, detail: '准备中...' });

    loadPromise = (async () => {
      // Step 1: fetch core JS (small, ~110 KB)
      const coreURL = await fetchToBlobURL(`${CDN}/ffmpeg-core.js`, 'text/javascript');

      // Step 2: fetch WASM with progress (large, ~31 MB)
      const wasmURL = await fetchToBlobURL(
        `${CDN}/ffmpeg-core.wasm`,
        'application/wasm',
        (loaded, total) => {
          const pct = total > 0 ? Math.round((loaded / total) * 50) + 10 : 20;
          const detail = total > 0
            ? `下载中 ${fmtBytes(loaded)} / ${fmtBytes(total)} (${Math.round(loaded / total * 100)}%)`
            : `下载中 ${fmtBytes(loaded)}...`;
          setProgress({ phase: 'loading', percent: pct, detail });
        },
      );

      // Step 3: compile & init
      setProgress({ phase: 'loading', percent: 80, detail: '初始化中...' });
      await ffmpeg.load({ coreURL, wasmURL });
    })().then(() => {
      setLoaded(true); setLoading(false); setProgress(null);
    }).catch((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[useFFmpeg] Load failed:', err);
      setLoadError(msg);
      ffmpegInstance = null;
      loadPromise = null;
      setLoading(false);
      setProgress(null);
      throw err;
    });

    await loadPromise;
  }, [getFFmpeg]);

  const trimSingle = useCallback(async (clip: ClipInput): Promise<Blob> => {
    const ffmpeg = getFFmpeg();
    if (!ffmpeg.loaded) await preload();

    const inputName = 'single_input.mp4';
    const outputName = 'single_output.mp4';

    try {
      setProgress({ phase: 'downloading', percent: 10, detail: '下载视频...' });
      const data = await fetchVideo(clip.url, clip.blob);
      await ffmpeg.writeFile(inputName, data);

      const audioArgs = clip.keepAudio ? ['-c:a', 'aac'] : ['-an'];
      if (needsReencode(clip)) {
        setProgress({ phase: 'trimming', percent: 40, detail: '裁剪中...' });
        const duration = clip.end - clip.start;
        await ffmpeg.exec([
          '-ss', clip.start.toFixed(3), '-i', inputName, '-t', duration.toFixed(3),
          '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23',
          ...audioArgs, '-avoid_negative_ts', 'make_zero', '-y', outputName,
        ]);
      } else {
        setProgress({ phase: 'trimming', percent: 40, detail: '复制中...' });
        const copyAudioArgs = clip.keepAudio ? [] : ['-an'];
        await ffmpeg.exec(['-i', inputName, '-c', 'copy', ...copyAudioArgs, '-y', outputName]);
      }

      await ffmpeg.deleteFile(inputName);
      const result = await ffmpeg.readFile(outputName);
      await ffmpeg.deleteFile(outputName);
      setProgress({ phase: 'done', percent: 100 });
      return new Blob([new Uint8Array(result as Uint8Array)], { type: 'video/mp4' });
    } catch (err) {
      console.error('[useFFmpeg] trimSingle failed:', err);
      terminateFFmpeg(); setProgress(null);
      throw err;
    }
  }, [getFFmpeg, preload]);

  const trimAndConcat = useCallback(async (clips: ClipInput[]): Promise<Blob> => {
    abortRef.current = false;
    const ffmpeg = getFFmpeg();
    if (!ffmpeg.loaded) await preload();

    try {
      const trimmedFiles: string[] = [];

      for (let i = 0; i < clips.length; i++) {
        if (abortRef.current) throw new Error('Aborted');
        const clip = clips[i];
        const inputName = `input_${i}.mp4`;
        const outputName = `trimmed_${i}.mp4`;

        setProgress({ phase: 'downloading', percent: Math.round((i / clips.length) * 30), detail: `下载镜头 ${i + 1}/${clips.length}` });
        const data = await fetchVideo(clip.url, clip.blob);
        await ffmpeg.writeFile(inputName, data);

        const reencode = needsReencode(clip);
        setProgress({ phase: 'trimming', percent: 30 + Math.round((i / clips.length) * 40), detail: reencode ? `裁剪镜头 ${i + 1}/${clips.length}` : `复制镜头 ${i + 1}/${clips.length}` });

        const audioArgs = clip.keepAudio ? ['-c:a', 'aac'] : ['-an'];
        if (reencode) {
          const duration = clip.end - clip.start;
          await ffmpeg.exec(['-ss', clip.start.toFixed(3), '-i', inputName, '-t', duration.toFixed(3), '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', ...audioArgs, '-avoid_negative_ts', 'make_zero', '-y', outputName]);
        } else {
          const copyAudioArgs = clip.keepAudio ? [] : ['-an'];
          await ffmpeg.exec(['-i', inputName, '-c', 'copy', ...copyAudioArgs, '-y', outputName]);
        }

        await ffmpeg.deleteFile(inputName);
        trimmedFiles.push(outputName);
      }

      if (abortRef.current) throw new Error('Aborted');

      setProgress({ phase: 'concatenating', percent: 75, detail: '正在拼接...' });

      if (trimmedFiles.length === 1) {
        const data = await ffmpeg.readFile(trimmedFiles[0]);
        await ffmpeg.deleteFile(trimmedFiles[0]);
        setProgress({ phase: 'done', percent: 100 });
        return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
      }

      const concatList = trimmedFiles.map(f => `file '${f}'`).join('\n');
      await ffmpeg.writeFile('concat.txt', concatList);
      await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'concat.txt', '-c', 'copy', '-y', 'output.mp4']);

      for (const f of trimmedFiles) await ffmpeg.deleteFile(f);
      await ffmpeg.deleteFile('concat.txt');

      const data = await ffmpeg.readFile('output.mp4');
      await ffmpeg.deleteFile('output.mp4');
      setProgress({ phase: 'done', percent: 100 });
      return new Blob([new Uint8Array(data as Uint8Array)], { type: 'video/mp4' });
    } catch (err) {
      if ((err as Error).message !== 'Aborted') {
        console.error('[useFFmpeg] trimAndConcat failed:', err);
        terminateFFmpeg();
      }
      setProgress(null);
      throw err;
    }
  }, [getFFmpeg, preload]);

  const abort = useCallback(() => { abortRef.current = true; }, []);

  return { loaded, loading, loadError, progress, preload, trimAndConcat, trimSingle, abort };
}
