/**
 * Shared types and internal helpers for all tool handlers.
 * Import these in every tool file — do NOT import from agentTools.ts.
 */

import type { StoryboardShot, StoryboardConfig } from '@/types/storyboard';
import type { ToolCall } from '@/types/video-agent';
import { generateFrame, buildFrameReferences, type ReferenceImage } from '@/edge-logic/generateFrame';
import { VIDEO_MODEL_CAPABILITIES, VIDEO_MODEL_ENDPOINTS, resolveVideoEndpoint } from '@/types/video-generation';
import { falQueue } from '@/lib/fal';
import { prefetchAndCache } from '@/lib/videoBlobCache';
import { writeSessionFile } from '@/lib/localFs';

export type { ToolCall };
export type { ReferenceImage };

// ─── Tool context ─────────────────────────────────────────────────────────────

export interface ToolContext {
  shotsRef: React.MutableRefObject<StoryboardShot[]>;
  configRef: React.MutableRefObject<StoryboardConfig>;
  storySummaryRef: React.MutableRefObject<string>;
  abortControllerRef: React.MutableRefObject<AbortController | null>;
  currentUploadedUrls: string[];
  sessionFolder: string;
  setShots: React.Dispatch<React.SetStateAction<StoryboardShot[]>>;
  setConfig: React.Dispatch<React.SetStateAction<StoryboardConfig>>;
  setStorySummary: React.Dispatch<React.SetStateAction<string>>;
  updateToolProgress: (toolCallId: string, text: string) => void;
}

export type ToolHandler = (ctx: ToolContext, args: Record<string, any>, tcId: string) => Promise<string>;

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

export async function generateSingleFrame(
  ctx: ToolContext,
  shotIndex: number,
  frameType: 'first' | 'last',
  config: StoryboardConfig,
): Promise<string | undefined> {
  const shot = ctx.shotsRef.current[shotIndex];
  const statusKey = frameType === 'first' ? 'firstFrameStatus' : 'lastFrameStatus';
  const urlKey = frameType === 'first' ? 'firstFrameUrl' : 'extractedLastFrameUrl';
  const refUrlKey = frameType === 'first' ? 'firstFrameRefUrl' : 'lastFrameRefUrl';
  const promptKey = frameType === 'first' ? 'firstFramePrompt' : 'lastFramePrompt';

  const signal = ctx.abortControllerRef.current?.signal;
  try {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    updateShot(ctx, shotIndex, { [statusKey]: 'generating', error: undefined });

    const refs = buildFrameReferences(ctx.shotsRef.current, shotIndex, frameType, config.referenceImageUrls);
    const url = await generateFrame({
      prompt: shot[promptKey],
      referenceImages: refs,
      aspectRatio: config.aspectRatio,
      frameModelId: config.frameModelId,
      shotIndex,
      frameType,
      storySummary: ctx.storySummaryRef.current,
      shotPrompt: shot.prompt,
    }, signal);

    // Persist locally so FAL CDN expiry doesn't break display
    let displayUrl = url;
    if (url.startsWith('http')) {
      try {
        const blob = await fetch(url, { signal }).then(r => r.blob());
        const ext = url.includes('.png') ? 'png' : 'jpg';
        const filename = `frames/shot${shotIndex + 1}_${frameType}_frame_${Date.now()}.${ext}`;
        const localUrl = await writeSessionFile(ctx.sessionFolder, filename, blob);
        if (localUrl) {
          displayUrl = localUrl;
        }
        // No local server: keep the original fal.ai CDN URL.
        // data: URLs must NOT be used here — fal.ai rejects them as image_urls/imageUrl
        // in subsequent edit/video requests, causing 422s across the whole shot chain.
      } catch { /* keep FAL URL on fetch failure */ }
    }
    // Store: display URL (local or CDN) for UI, original CDN URL for fal.ai API references
    updateShot(ctx, shotIndex, { [urlKey]: displayUrl, [refUrlKey]: url, [statusKey]: 'completed' });
    return displayUrl;
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

  if (forceRegenerate || !shot.firstFrameUrl) {
    result.firstFrameUrl = await generateSingleFrame(ctx, shotIndex, 'first', config);
  } else {
    result.firstFrameUrl = shot.firstFrameUrl;
  }

  if (!firstOnly) {
    const updatedShot = ctx.shotsRef.current[shotIndex];
    if ((forceRegenerate || !updatedShot.extractedLastFrameUrl) && updatedShot.lastFramePrompt) {
      result.lastFrameUrl = await generateSingleFrame(ctx, shotIndex, 'last', config);
    } else if (updatedShot.extractedLastFrameUrl) {
      result.lastFrameUrl = updatedShot.extractedLastFrameUrl;
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
  if (totalShots === 0) return JSON.stringify({ success: false, error: 'No shots to generate frames for' });

  const frameResults: { shot: number; firstFrameUrl?: string; lastFrameUrl?: string }[] = [];

  for (let i = 0; i < totalShots; i++) {
    if (ctx.abortControllerRef.current?.signal.aborted) break;
    if (frameType === 'last') {
      ctx.updateToolProgress(tcId, `Shot ${i + 1}/${totalShots} last frame...`);
      const currentShot = ctx.shotsRef.current[i];
      if (forceRegenerate || !currentShot.extractedLastFrameUrl) {
        const url = await generateSingleFrame(ctx, i, 'last', config);
        frameResults.push({ shot: i + 1, lastFrameUrl: url });
      } else {
        frameResults.push({ shot: i + 1, lastFrameUrl: currentShot.extractedLastFrameUrl });
      }
    } else {
      const label = frameType === 'first' ? 'first frame' : 'frames';
      ctx.updateToolProgress(tcId, `Shot ${i + 1}/${totalShots} ${label}...`);
      const result = await generateShotFrames(ctx, i, config, forceRegenerate, frameType === 'first');
      frameResults.push({ shot: i + 1, ...result });
    }
  }

  return JSON.stringify({ success: true, total_shots: totalShots, frames: frameResults, frame_type: frameType });
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

  // Prefer the CDN ref URL — display URLs may be localhost paths fal.ai can't reach
  const firstFrameApiUrl = shot.firstFrameRefUrl ?? shot.firstFrameUrl;
  const lastFrameApiUrl = shot.lastFrameRefUrl ?? shot.extractedLastFrameUrl;
  const hasFirstFrame = !!firstFrameApiUrl && !firstFrameApiUrl.startsWith('data:');
  const hasLastFrame = !!lastFrameApiUrl && !lastFrameApiUrl.startsWith('data:') && caps.supportsFirstLastFrame;

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
    prefetchAndCache(videoUrl).catch(() => {});
    // Background: save blob to local FS as backup
    const videoFilename = `videos/shot${shotIndex + 1}_video_${Date.now()}.mp4`;
    fetch(videoUrl).then(r => r.blob()).then(blob => writeSessionFile(ctx.sessionFolder, videoFilename, blob)).catch(() => {});
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
  if (currentShots.length === 0) return JSON.stringify({ success: false, error: 'No shots' });

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

  return JSON.stringify({ success: true, completed, failed, total: indices.length, videos: videoResults });
}
