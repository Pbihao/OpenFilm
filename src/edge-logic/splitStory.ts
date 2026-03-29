/**
 * Split Story — Direct OpenRouter call (ported from Edge Function)
 */

import { openrouterChatJson } from '@/lib/openrouter';
import { loadConfig } from '@/config';

export interface SplitResultShot {
  shot_prompt: string;
  first_frame_prompt: string;
  last_frame_prompt: string;
}

export interface SplitResult {
  shots: SplitResultShot[];
  storySummary: string;
}

export async function splitStory(params: {
  description: string;
  shotCount: number;
  aspectRatio: string;
  referenceImageUrls?: string[];
}): Promise<SplitResult> {
  const config = loadConfig();
  const count = Math.min(Math.max(params.shotCount || 3, 2), 10);
  const aspect_ratio = params.aspectRatio || '16:9';

  const imageInstruction = params.referenceImageUrls?.length
    ? '\n- Reference images are provided. Lock the visual DNA from these images: match character face, clothing, hair, body type, and art style EXACTLY across ALL shots.'
    : '';

  const systemPrompt = `You are a professional video storyboard designer. Given a story description, split it into exactly ${count} sequential video shots for a ${aspect_ratio} format video.

Output a JSON object with two fields:
1. "story_summary": string — 1-2 sentences summarizing the overall visual style, color palette, and narrative arc.
2. "shots": array — An array of ${count} shot objects, each with:
  - "shot_prompt": string — Detailed video generation prompt (3-5 sentences).
  - "first_frame_prompt": string — Detailed image generation prompt for the first frame.
  - "last_frame_prompt": string — Detailed image generation prompt for the last frame.

Rules:
- Write ALL prompts in the SAME LANGUAGE as the input description
- Each shot_prompt MUST be 3-5 detailed sentences
- The FIRST shot MUST NEVER use a close-up
- Vary shot types across shots
- Follow a narrative arc
- Maintain consistent character descriptions
- For ${aspect_ratio} format, compose shots appropriately${imageInstruction}
- Return ONLY a JSON object, no other text`;

  const hasImages = (params.referenceImageUrls?.length ?? 0) > 0;
  let userContent: any;
  if (hasImages) {
    userContent = [
      { type: 'text', text: params.description },
      ...params.referenceImageUrls!.map(url => ({ type: 'image_url', image_url: { url } })),
    ];
  } else {
    userContent = params.description;
  }

  const result = await openrouterChatJson({
    model: config.agentModel || 'google/gemini-3.1-pro-preview',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 6000,
  });

  const content = result.choices?.[0]?.message?.content?.trim() || '';
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  let shots: SplitResultShot[];
  let storySummary = '';

  if (Array.isArray(parsed)) {
    shots = parsed;
  } else if (parsed.shots && Array.isArray(parsed.shots)) {
    shots = parsed.shots;
    storySummary = typeof parsed.story_summary === 'string' ? parsed.story_summary : '';
  } else {
    throw new Error('Invalid format from AI');
  }

  if (!shots.every(s => typeof s.shot_prompt === 'string' && typeof s.first_frame_prompt === 'string' && typeof s.last_frame_prompt === 'string')) {
    throw new Error('Invalid shot format from AI');
  }

  return { shots, storySummary };
}
