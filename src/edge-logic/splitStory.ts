/**
 * Split Story — Storyboard designer stage (Stage 2 of story pipeline)
 *
 * Translates a StoryBible into concrete shots with shot_prompt,
 * first_frame_prompt, and last_frame_prompt.
 * developStory.ts produces the StoryBible consumed here.
 */

import { openrouterChatJson } from '@/lib/openrouter';
import { loadConfig } from '@/config';
import type { StoryBible } from '@/types/storyboard';
import { SPLIT_STORY_PROMPT } from '@/prompts/storyPrompts';

export interface SplitResultShot {
  shot_prompt: string;
  first_frame_prompt: string;
  last_frame_prompt: string;
}

export async function splitStory(params: {
  bible: StoryBible;
  aspectRatio: string;
  referenceImageUrls?: string[];
  signal?: AbortSignal;
}): Promise<SplitResultShot[]> {
  const config = loadConfig();
  const count = params.bible.scenes.length;

  const imageInstruction = params.referenceImageUrls?.length
    ? '\n- Reference images are provided. Lock the visual DNA from these images: match character face, clothing, hair, body type, and art style EXACTLY across ALL shots.'
    : '';

  const systemPrompt = SPLIT_STORY_PROMPT(params.bible, params.aspectRatio, imageInstruction);

  const hasImages = (params.referenceImageUrls?.length ?? 0) > 0;
  const sceneList = params.bible.scenes
    .map((s, i) => `Shot ${i + 1}: ${s}`)
    .join('\n');

  let userContent: any;
  if (hasImages) {
    userContent = [
      { type: 'text', text: sceneList },
      ...params.referenceImageUrls!.map(url => ({ type: 'image_url', image_url: { url } })),
    ];
  } else {
    userContent = sceneList;
  }

  const result = await openrouterChatJson({
    model: config.agentModel,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ],
    temperature: 0.7,
    max_tokens: 6000,
  }, params.signal);

  const content = result.choices?.[0]?.message?.content?.trim() || '';
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  if (!Array.isArray(parsed)) throw new Error('Invalid format from AI — expected JSON array');
  const shots: SplitResultShot[] = parsed;

  if (shots.length !== count) {
    throw new Error(`Expected ${count} shots, got ${shots.length}`);
  }

  if (!shots.every(s =>
    typeof s.shot_prompt === 'string' &&
    typeof s.first_frame_prompt === 'string' &&
    typeof s.last_frame_prompt === 'string'
  )) {
    throw new Error('Invalid shot format from AI');
  }

  return shots;
}
