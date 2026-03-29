/**
 * Generate Frame — Direct fal.ai or OpenRouter call (ported from Edge Function)
 */

import { falQueue } from '@/lib/fal';
import { openrouterChatJson } from '@/lib/openrouter';
import { AsyncMutex } from '@/lib/asyncMutex';
import type { StoryboardShot } from '@/types/storyboard';

const frameMutex = new AsyncMutex();

export interface ReferenceImage {
  url: string;
  role: 'global_reference' | 'previous_first_frame' | 'previous_last_frame' | 'current_first_frame';
}

export function buildFrameReferences(
  shots: StoryboardShot[],
  shotIndex: number,
  frameType: 'first' | 'last',
  globalRefs: string[],
): ReferenceImage[] {
  const refs: ReferenceImage[] = [];
  const prev = shotIndex > 0 ? shots[shotIndex - 1] : null;
  const MAX_REFS = 3;

  // Always prefer the *Ref URL (original fal.ai CDN URL) over the display URL.
  // Display URLs may be localhost paths (/api/local-data?...) that fal.ai servers can't reach.
  const shot = shots[shotIndex];

  if (frameType === 'last') {
    // Slot 1 (fixed): current shot's first frame — fal.ai edit uses this as the visual base
    const firstUrl = shot.firstFrameRefUrl ?? shot.firstFrameUrl;
    if (firstUrl) refs.push({ url: firstUrl, role: 'current_first_frame' });

    // Remaining slots: global refs, then prev_last for cross-shot continuity
    for (const url of globalRefs) {
      if (refs.length >= MAX_REFS) break;
      refs.push({ url, role: 'global_reference' });
    }
    if (refs.length < MAX_REFS && prev) {
      const prevLastUrl = prev.lastFrameRefUrl ?? prev.extractedLastFrameUrl;
      if (prevLastUrl) refs.push({ url: prevLastUrl, role: 'previous_last_frame' });
    }
  } else {
    // Slot 1 (fixed): previous shot's last frame — most direct visual bridge between shots
    if (prev) {
      const prevLastUrl = prev.lastFrameRefUrl ?? prev.extractedLastFrameUrl;
      if (prevLastUrl) refs.push({ url: prevLastUrl, role: 'previous_last_frame' });
    }

    // Remaining slots: global refs, then prev_first as fallback
    for (const url of globalRefs) {
      if (refs.length >= MAX_REFS) break;
      refs.push({ url, role: 'global_reference' });
    }
    if (refs.length < MAX_REFS && prev) {
      const prevFirstUrl = prev.firstFrameRefUrl ?? prev.firstFrameUrl;
      if (prevFirstUrl) refs.push({ url: prevFirstUrl, role: 'previous_first_frame' });
    }
  }

  return refs;
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

function roleDescription(role: ReferenceImage['role'], shotIndex: number): string {
  const shotNum = shotIndex + 1;
  switch (role) {
    case 'global_reference': return 'the global reference image';
    case 'current_first_frame': return `the first frame of the current shot (Shot ${shotNum})`;
    case 'previous_first_frame': return `the first frame of the previous shot (Shot ${shotNum - 1})`;
    case 'previous_last_frame': return `the last frame of the previous shot (Shot ${shotNum - 1})`;
    default: return 'a reference image';
  }
}

function buildPromptWithContext(
  basePrompt: string, refs: ReferenceImage[], aspectRatio: string,
  shotIndex: number, frameType: 'first' | 'last',
  storySummary?: string, shotPrompt?: string,
): string {
  const shotNum = shotIndex + 1;
  let prompt = `You are a professional storyboard keyframe designer. You are designing keyframes for a ${aspectRatio} video storyboard.\nYou are now generating the ${frameType} frame for Shot ${shotNum}.\n`;

  if (storySummary) prompt += `\nStory overview: ${storySummary}\n`;

  if (refs.length > 0) {
    prompt += `\nYou are provided with ${refs.length} reference image(s):\n`;
    // Describe in the same order as refs array (= same order as image_urls in the API request)
    refs.forEach((ref, i) => {
      prompt += `- The ${ORDINALS[i] || `${i + 1}th`} image is ${roleDescription(ref.role, shotNum - 1)}.\n`;
    });
  }

  if (frameType === 'last' && shotPrompt) {
    prompt += `\nVideo action for this shot:\n${shotPrompt}\n`;
    prompt += `
CRITICAL CONSTRAINTS FOR LAST FRAME:
This frame captures the END STATE after the camera movement and all actions described in the shot prompt have fully completed.

1. SUBJECT STATE CHANGES (MANDATORY):
   - Every subject (character, vehicle, object, creature) MUST be shown in a completely different state compared to the first frame.
   - Characters: different pose, shifted weight, turned head/body, changed expression, moved to a new position.
   - Vehicles/objects: relocated, rotated, in a new configuration.
   - If the shot describes an action (walking, running, turning, reaching), show the RESULT of that completed action, NOT the action in progress.

2. CAMERA & COMPOSITION:
   - Apply the full camera movement described in the shot prompt. If the shot says "pan left", the last frame should show the scene from the panned-left perspective.
   - Framing, angle, and field of view must reflect the END position of any described camera move.
   - Background elements should shift consistently with the camera movement.

3. NARRATIVE PROGRESSION:
   - This frame is the visual conclusion of the shot. It must feel like a distinct moment in time from the first frame.
   - Lighting, shadows, and atmospheric conditions may shift to reflect elapsed time or mood progression.
   - Do NOT simply re-describe the first frame with minor tweaks. The last frame must be unmistakably different.
`;
  }

  prompt += `\nThe following is the scene description for this frame:\n${basePrompt}`;
  return prompt;
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

export async function generateFrame(
  params: GenerateFrameParams,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  return frameMutex.runExclusive(async () => {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    const refUrls = params.referenceImages.map(r => r.url);
    const isEditing = refUrls.length > 0;

    // Build prompt once — both backends use the same context-enriched prompt
    const fullPrompt = buildPromptWithContext(
      params.prompt, params.referenceImages, params.aspectRatio,
      params.shotIndex, params.frameType, params.storySummary, params.shotPrompt,
    );

    const falConfig = FAL_FRAME_MODELS[params.frameModelId];

    if (falConfig) {
      // fal.ai path
      const endpoint = isEditing ? falConfig.editEndpoint : falConfig.endpoint;

      const body: Record<string, unknown> = {
        prompt: fullPrompt,
        aspect_ratio: params.aspectRatio, // "16:9" or "9:16"
        resolution: '2K',                 // default "1K" is too soft; "2K" gives cleaner output
        num_images: 1,
      };

      if (isEditing) body.image_urls = refUrls;

      const result = await falQueue(endpoint, body, { signal }) as any;

      const imageUrl = result?.images?.[0]?.url || result?.output?.images?.[0]?.url;
      if (!imageUrl) throw new Error('No image returned from fal.ai');
      return imageUrl;
    } else {
      // OpenRouter path (e.g., Gemini image models)
      const userContent: any[] = [{ type: 'text', text: fullPrompt }];
      for (const ref of params.referenceImages) {
        userContent.push({ type: 'image_url', image_url: { url: ref.url } });
      }

      const result = await openrouterChatJson({
        model: params.frameModelId,
        messages: [{ role: 'user', content: userContent }],
        modalities: ['image', 'text'],
      });

      // Extract image from response — check both image_url and inline_data formats in one pass
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
  });
}
