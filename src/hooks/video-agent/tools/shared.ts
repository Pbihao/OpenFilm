/**
 * Shared types and internal helpers for all tool handlers.
 * Import these in every tool file — do NOT import from agentTools.ts.
 */

import type { StoryboardShot, StoryboardConfig, StoryBible } from '@/types/storyboard';
import type { ToolCall } from '@/types/video-agent';
import { generateFrame, buildFrameReferences, type ReferenceImage } from '@/edge-logic/generateFrame';
import { isPublicUrl, assetDisplayUrl } from '@/lib/urlUtils';
import { VIDEO_MODEL_CAPABILITIES, VIDEO_MODEL_ENDPOINTS, resolveVideoEndpoint } from '@/types/video-generation';
import { falQueue, falUploadFile } from '@/lib/fal';
import { prefetchAndCache } from '@/lib/videoBlobCache';
import { writeSessionFile } from '@/lib/localFs';

export type { ToolCall };
export type { ReferenceImage };

// ─── Tool response helpers ─────────────────────────────────────────────────────

export const toolSuccess = (data: Record<string, unknown>): string =>
  JSON.stringify({ success: true, ...data });

export const toolError = (error: string): string =>
  JSON.stringify({ success: false, error });

// ─── Shot index helper ─────────────────────────────────────────────────────────

/**
 * Converts a 1-based user-facing shot_index to a validated 0-based array index.
 * Returns null if out of range — callers should return toolError() immediately.
 */
export function resolveShotIndex(shot_index: number, shots: StoryboardShot[]): number | null {
  const idx = shot_index - 1;
  if (idx < 0 || idx >= shots.length) return null;
  return idx;
}

// ─── Tool context ─────────────────────────────────────────────────────────────

export interface ToolContext {
  shotsRef: React.MutableRefObject<StoryboardShot[]>;
  configRef: React.MutableRefObject<StoryboardConfig>;
  storyBibleRef: React.MutableRefObject<StoryBible | null>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  /** Cache for resolved ref URLs — populated on first use, reused across all frames in a generation run */
  resolvedRefUrlsCache: React.MutableRefObject<Map<string, string>>;
  sessionFolder: string;
  setShots: React.Dispatch<React.SetStateAction<StoryboardShot[]>>;
  setConfig: React.Dispatch<React.SetStateAction<StoryboardConfig>>;
  setStoryBible: React.Dispatch<React.SetStateAction<StoryBible | null>>;
  updateToolProgress: (toolCallId: string, text: string) => void;
}

export type ToolHandler = (ctx: ToolContext, args: Record<string, any>, tcId: string) => Promise<string>;

export interface ToolDefinition {
  schema: {
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters?: Record<string, any>;
    };
  };
  execute: ToolHandler;
  /**
   * Whether this tool requires user confirmation before running.
   * Pass a function for arg-dependent cases (e.g. edit_shot only expensive when regenerate is set).
   */
  isExpensive?: boolean | ((args: Record<string, any>, ctx: ToolContext) => boolean);
}

// ─── Shared state helpers ─────────────────────────────────────────────────────

export function updateShot(ctx: ToolContext, index: number, patch: Partial<StoryboardShot>) {
  ctx.shotsRef.current = ctx.shotsRef.current.map((s, i) =>
    i === index ? { ...s, ...patch } : s
  );
  ctx.setShots(ctx.shotsRef.current);
}

export function replaceAllShots(ctx: ToolContext, shots: StoryboardShot[]) {
  ctx.shotsRef.current = shots;
  ctx.setShots(shots);
}

// ─── Frame generation helpers ─────────────────────────────────────────────────

/**
 * Resolve all global reference entries to public CDN URLs that fal.ai servers can fetch.
 * Refs with an existing apiUrl are used as-is; local-only refs are uploaded via falUploadFile.
 */
export async function resolveGlobalRefUrls(
  refs: StoryboardConfig['referenceImageUrls'],
  signal?: AbortSignal,
  cache?: Map<string, string>,
): Promise<string[]> {
  if (refs.length === 0) return [];
  if (signal?.aborted) return [];

  // For each ref: return cached URL if available, otherwise upload
  const resolved = await Promise.all(refs.map(async ref => {
    if (signal?.aborted) return null;

    // Already a public CDN URL — use directly
    if (isPublicUrl(ref.apiUrl)) {
      cache?.set(ref.displayUrl, ref.apiUrl!);
      return ref.apiUrl!;
    }

    // Check session-scoped cache (avoids re-uploading the same image across frames)
    const cached = cache?.get(ref.displayUrl);
    if (cached) return cached;

    try {
      const blob = await fetch(ref.displayUrl, { signal }).then(r => r.blob());
      const file = new File([blob], 'reference.png', { type: blob.type || 'image/png' });
      const url = await falUploadFile(file);
      cache?.set(ref.displayUrl, url);
      return url;
    } catch {
      return null; // skip refs that fail — don't block frame generation
    }
  }));

  return resolved.filter((url): url is string => url !== null);
}

export async function generateSingleFrame(
  ctx: ToolContext,
  shotIndex: number,
  frameType: 'first' | 'last',
  config: StoryboardConfig,
): Promise<string | undefined> {
  const shot = ctx.shotsRef.current[shotIndex];
  const statusKey = frameType === 'first' ? 'firstFrameStatus' : 'lastFrameStatus';
  const assetKey = frameType === 'first' ? 'firstFrame' : 'lastFrame';
  const promptKey = frameType === 'first' ? 'firstFramePrompt' : 'lastFramePrompt';

  const signal = ctx.abortControllerRef.current?.signal;
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    updateShot(ctx, shotIndex, { [statusKey]: 'generating', error: undefined });

    const globalRefUrls = await resolveGlobalRefUrls(config.referenceImageUrls, signal, ctx.resolvedRefUrlsCache.current);
    const refs = buildFrameReferences(ctx.shotsRef.current, shotIndex, frameType, globalRefUrls);
    const remoteUrl = await generateFrame({
      prompt: shot[promptKey],
      referenceImages: refs,
      aspectRatio: config.aspectRatio,
      frameModelId: config.frameModelId,
      shotIndex,
      frameType,
      storySummary: ctx.storyBibleRef.current?.narrative,
      shotPrompt: shot.prompt,
    }, signal);

    updateShot(ctx, shotIndex, { [assetKey]: { remoteUrl }, [statusKey]: 'completed' });

    // Save locally for debugging — fire-and-forget, never used for display or API calls
    if (remoteUrl.startsWith('http')) {
      const ext = remoteUrl.includes('.png') ? 'png' : 'jpg';
      const filename = `frames/shot${shotIndex + 1}_${frameType}_frame_${Date.now()}.${ext}`;
      fetch(remoteUrl).then(r => r.blob())
        .then(blob => writeSessionFile(ctx.sessionFolder, filename, blob))
        .catch(() => {});
    }

    return remoteUrl;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`[generateFrame] shot=${shotIndex + 1} type=${frameType} FAILED:`, errMsg);
    updateShot(ctx, shotIndex, { [statusKey]: 'failed', error: errMsg });
    return undefined;
  }
}

export async function generateShotFrames(
  ctx: ToolContext,
  shotIndex: number,
  config: StoryboardConfig,
  forceRegenerate: boolean,
  firstOnly = false,
): Promise<{ firstFrameUrl?: string; lastFrameUrl?: string }> {
  const shot = ctx.shotsRef.current[shotIndex];
  const result: { firstFrameUrl?: string; lastFrameUrl?: string } = {};

  if (forceRegenerate || !shot.firstFrame) {
    result.firstFrameUrl = await generateSingleFrame(ctx, shotIndex, 'first', config);
  } else {
    result.firstFrameUrl = assetDisplayUrl(shot.firstFrame);
  }

  if (!firstOnly) {
    const updatedShot = ctx.shotsRef.current[shotIndex];
    if ((forceRegenerate || !updatedShot.lastFrame) && updatedShot.lastFramePrompt) {
      result.lastFrameUrl = await generateSingleFrame(ctx, shotIndex, 'last', config);
    } else if (updatedShot.lastFrame) {
      result.lastFrameUrl = assetDisplayUrl(updatedShot.lastFrame);
    } else if (!updatedShot.lastFramePrompt) {
      updateShot(ctx, shotIndex, {
        lastFrameStatus: 'failed',
        error: 'Last frame prompt is empty. Please provide a last frame description.',
      });
    }
  }

  return result;
}

export async function generateAllFramesInternal(
  ctx: ToolContext, tcId: string, forceRegenerate = false, frameType: 'both' | 'first' | 'last' = 'both',
): Promise<string> {
  const config = ctx.configRef.current;
  const totalShots = ctx.shotsRef.current.length;
  if (totalShots === 0) return toolError('No shots to generate frames for');

  const frameResults: { shot: number; firstFrameUrl?: string; lastFrameUrl?: string }[] = [];

  for (let i = 0; i < totalShots; i++) {
    if (ctx.abortControllerRef.current?.signal.aborted) break;
    if (frameType === 'last') {
      ctx.updateToolProgress(tcId, `Shot ${i + 1}/${totalShots} last frame...`);
      const currentShot = ctx.shotsRef.current[i];
      if (forceRegenerate || !currentShot.lastFrame) {
        const url = await generateSingleFrame(ctx, i, 'last', config);
        frameResults.push({ shot: i + 1, lastFrameUrl: url });
      } else {
        frameResults.push({ shot: i + 1, lastFrameUrl: assetDisplayUrl(currentShot.lastFrame) });
      }
    } else {
      const label = frameType === 'first' ? 'first frame' : 'frames';
      ctx.updateToolProgress(tcId, `Shot ${i + 1}/${totalShots} ${label}...`);
      const result = await generateShotFrames(ctx, i, config, forceRegenerate, frameType === 'first');
      frameResults.push({ shot: i + 1, ...result });
    }
  }

  return toolSuccess({ total_shots: totalShots, frames: frameResults, frame_type: frameType });
}

// ─── Video generation helpers ─────────────────────────────────────────────────

export async function generateVideoForShot(
  ctx: ToolContext,
  shotIndex: number,
  config: StoryboardConfig,
): Promise<{ videoUrl?: string; error?: string }> {
  const shot = ctx.shotsRef.current[shotIndex];
  if (!shot.prompt.trim()) return { error: 'Empty prompt' };

  const modelId = config.videoModelId;
  const caps = VIDEO_MODEL_CAPABILITIES[modelId];
  if (!caps) return { error: `Unsupported video model: ${modelId}` };

  const duration = shot.duration ?? config.duration;
  const validDuration = caps.supportedDurations.includes(duration) ? duration : caps.supportedDurations[0];

  // remoteUrl is always the CDN URL — safe to pass directly to fal.ai
  const firstFrameApiUrl = shot.firstFrame?.remoteUrl;
  const lastFrameApiUrl = shot.lastFrame?.remoteUrl;
  const hasFirstFrame = isPublicUrl(firstFrameApiUrl);
  const hasLastFrame = isPublicUrl(lastFrameApiUrl) && caps.supportsFirstLastFrame;

  const endpoint = resolveVideoEndpoint(modelId, hasFirstFrame, hasLastFrame);
  if (!endpoint) return { error: `No endpoint config for model: ${modelId}` };

  const endpointConfig = VIDEO_MODEL_ENDPOINTS[modelId];
  const body = endpointConfig
    ? {
        ...(endpointConfig.staticParams ?? {}),
        ...endpointConfig.buildBody({
          prompt: shot.prompt.trim(),
          aspectRatio: config.aspectRatio,
          duration: validDuration,
          withAudio: config.withAudio && caps.supportsAudio,
          imageUrl: hasFirstFrame ? firstFrameApiUrl : undefined,
          endFrameUrl: hasLastFrame ? lastFrameApiUrl : undefined,
          isI2V: hasFirstFrame,
        }),
      }
    : { prompt: shot.prompt.trim(), duration: validDuration, aspect_ratio: config.aspectRatio };

  updateShot(ctx, shotIndex, { status: 'generating', error: undefined, videoUrl: undefined });

  try {
    const signal = ctx.abortControllerRef.current?.signal;
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const result = await falQueue(endpoint, body, { signal }) as any;

    const videoUrl = result?.video?.url || result?.output?.video?.url;
    if (!videoUrl) throw new Error('No video URL returned');

    updateShot(ctx, shotIndex, { status: 'completed', videoUrl, error: undefined });
    prefetchAndCache(videoUrl).catch(err => console.warn('[cache] video prefetch failed:', err));
    // Background: save blob to local FS as backup
    const videoFilename = `videos/shot${shotIndex + 1}_video_${Date.now()}.mp4`;
    fetch(videoUrl).then(r => r.blob()).then(blob => writeSessionFile(ctx.sessionFolder, videoFilename, blob)).catch(err => console.warn('[localFs] video save failed:', err));
    return { videoUrl };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const errMsg = err instanceof Error ? err.message : String(err);
    updateShot(ctx, shotIndex, { status: 'failed', error: errMsg });
    return { error: errMsg };
  }
}

export async function generateAllVideosInternal(
  ctx: ToolContext, tcId: string, skipExisting: boolean, shotIndices?: number[],
): Promise<string> {
  const currentShots = ctx.shotsRef.current;
  if (currentShots.length === 0) return toolError('No shots');

  const indices = shotIndices ?? currentShots.map((_, i) => i);
  let completed = 0;
  let failed = 0;
  const videoResults: { shot: number; videoUrl?: string; error?: string }[] = [];

  for (const i of indices) {
    if (ctx.abortControllerRef.current?.signal.aborted) break;
    const shot = ctx.shotsRef.current[i];
    if (shot.videoUrl && skipExisting) {
      completed++;
      videoResults.push({ shot: i + 1, videoUrl: shot.videoUrl });
      continue;
    }
    ctx.updateToolProgress(tcId, `Video ${completed + failed + 1}/${indices.length}...`);
    const result = await generateVideoForShot(ctx, i, ctx.configRef.current);
    if (result.videoUrl) { completed++; videoResults.push({ shot: i + 1, videoUrl: result.videoUrl }); }
    else { failed++; videoResults.push({ shot: i + 1, error: result.error }); }
  }

  return toolSuccess({ completed, failed, total: indices.length, videos: videoResults });
}
