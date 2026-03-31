/**
 * Generate Frame — Direct fal.ai or OpenRouter call
 *
 * Prompt construction is in src/prompts/framePrompts.ts.
 * This file owns: reference-image ordering logic, model routing, mutex serialization.
 */

import { falQueue } from '@/lib/fal';
import { openrouterChatJson } from '@/lib/openrouter';
import { AsyncMutex } from '@/lib/asyncMutex';
import type { StoryboardShot } from '@/types/storyboard';
import { buildPromptWithContext, buildStandalonePrompt } from '@/prompts/framePrompts';

export type { ReferenceImage } from '@/prompts/framePrompts';
import type { ReferenceImage } from '@/prompts/framePrompts';

const frameMutex = new AsyncMutex();

export function buildFrameReferences(
  shots: StoryboardShot[],
  shotIndex: number,
  frameType: 'first' | 'last',
  globalRefUrls: string[],
): ReferenceImage[] {
  const refs: ReferenceImage[] = [];
  const prev = shotIndex > 0 ? shots[shotIndex - 1] : null;
  const MAX_REFS = 3;

  const shot = shots[shotIndex];

  if (frameType === 'last') {
    // Slot 1 (fixed): current shot's first frame — fal.ai edit uses this as the visual base
    if (shot.firstFrame) refs.push({ url: shot.firstFrame.remoteUrl, role: 'current_first_frame' });

    // Remaining slots: global refs, then prev_last for cross-shot continuity
    for (const url of globalRefUrls) {
      if (refs.length >= MAX_REFS) break;
      refs.push({ url, role: 'global_reference' });
    }
    if (refs.length < MAX_REFS && prev?.lastFrame) {
      refs.push({ url: prev.lastFrame.remoteUrl, role: 'previous_last_frame' });
    }
  } else {
    // Slot 1 (fixed): previous shot's last frame — most direct visual bridge between shots
    if (prev?.lastFrame) {
      refs.push({ url: prev.lastFrame.remoteUrl, role: 'previous_last_frame' });
    }

    // Remaining slots: global refs, then prev_first as fallback
    for (const url of globalRefUrls) {
      if (refs.length >= MAX_REFS) break;
      refs.push({ url, role: 'global_reference' });
    }
    if (refs.length < MAX_REFS && prev?.firstFrame) {
      refs.push({ url: prev.firstFrame.remoteUrl, role: 'previous_first_frame' });
    }
  }

  return refs;
}

// fal.ai model configs
const FAL_FRAME_MODELS: Record<string, { endpoint: string; editEndpoint: string }> = {
  'fal-ai/nano-banana-2': {
    endpoint: 'fal-ai/nano-banana-2',
    editEndpoint: 'fal-ai/nano-banana-2/edit',
  },
  'fal-ai/nano-banana-pro': {
    endpoint: 'fal-ai/nano-banana-pro',
    editEndpoint: 'fal-ai/nano-banana-pro/edit',
  },
};

export interface GenerateFrameParams {
  prompt: string;
  referenceImages: ReferenceImage[];
  aspectRatio: string;
  frameModelId: string;
  shotIndex: number;
  frameType: 'first' | 'last';
  storySummary?: string;
  shotPrompt?: string;
}

export interface StandaloneImageParams {
  prompt: string;
  referenceImages: ReferenceImage[];
  aspectRatio: string;
  frameModelId: string;
}

async function callModel(
  prompt: string,
  refUrls: string[],
  aspectRatio: string,
  frameModelId: string,
  signal?: AbortSignal,
): Promise<string> {
  const isEditing = refUrls.length > 0;
  const falConfig = FAL_FRAME_MODELS[frameModelId];

  if (falConfig) {
    const endpoint = isEditing ? falConfig.editEndpoint : falConfig.endpoint;
    const body: Record<string, unknown> = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution: '2K',
      num_images: 1,
      ...(isEditing && { image_urls: refUrls }),
    };
    const result = await falQueue(endpoint, body, { signal }) as any;
    const imageUrl = result?.images?.[0]?.url || result?.output?.images?.[0]?.url;
    if (!imageUrl) throw new Error('No image returned from fal.ai');
    return imageUrl;
  }

  // OpenRouter path (e.g., Gemini image models)
  const userContent: any[] = [{ type: 'text', text: prompt }];
  for (const url of refUrls) userContent.push({ type: 'image_url', image_url: { url } });
  const result = await openrouterChatJson({
    model: frameModelId,
    messages: [{ role: 'user', content: userContent }],
    modalities: ['image', 'text'],
  });
  const parts = result.choices?.[0]?.message?.content;
  if (Array.isArray(parts)) {
    for (const p of parts) {
      if (p.type === 'image_url' && p.image_url?.url) return p.image_url.url;
      if (p.type === 'image' && p.source?.data)
        return `data:${p.source.media_type || 'image/png'};base64,${p.source.data}`;
    }
  }
  throw new Error('No image returned from model');
}

/**
 * Call the image model directly — no serialization.
 * Use for standalone images (chat, concept exploration).
 * Use generateFrame() instead for shot keyframes, which must be serialized.
 */
export async function callImageModel(
  params: GenerateFrameParams,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const fullPrompt = buildPromptWithContext(
    params.prompt, params.referenceImages, params.aspectRatio,
    params.shotIndex, params.frameType, params.storySummary, params.shotPrompt,
  );
  return callModel(fullPrompt, params.referenceImages.map(r => r.url), params.aspectRatio, params.frameModelId, signal);
}

/**
 * Call the image model for standalone (non-storyboard) images — no mutex, no storyboard framing.
 * Use for chat concept images, one-off generations, etc.
 */
export async function callStandaloneImageModel(
  params: StandaloneImageParams,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const fullPrompt = buildStandalonePrompt(params.prompt, params.referenceImages, params.aspectRatio);
  return callModel(fullPrompt, params.referenceImages.map(r => r.url), params.aspectRatio, params.frameModelId, signal);
}

/**
 * Generate a shot keyframe — serialized via mutex to maintain visual continuity
 * across sequential shots (shot N's last frame feeds shot N+1's first frame).
 * Respects AbortSignal: if cancelled while queued, skips immediately.
 */
export async function generateFrame(
  params: GenerateFrameParams,
  signal?: AbortSignal,
): Promise<string> {
  return frameMutex.runExclusive(() => callImageModel(params, signal), signal);
}
