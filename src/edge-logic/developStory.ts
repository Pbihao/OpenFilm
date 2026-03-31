/**
 * Develop Story — Creative director stage (Stage 1 of story pipeline)
 *
 * Transforms a raw user description into a StoryBible:
 * narrative intent, subject anchors, and per-scene purposes.
 * splitStory.ts consumes the StoryBible in Stage 2.
 */

import { openrouterChatJson } from '@/lib/openrouter';
import { loadConfig } from '@/config';
import type { StoryBible } from '@/types/storyboard';
import { DEVELOP_STORY_PROMPT } from '@/prompts/storyPrompts';

export async function developStory(params: {
  description: string;
  shotCount: number;
  aspectRatio: string;
  referenceImageUrls?: string[];
  signal?: AbortSignal;
}): Promise<StoryBible> {
  const config = loadConfig();
  const count = Math.min(Math.max(params.shotCount || 3, 2), 10);

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
    model: config.agentModel,
    messages: [
      { role: 'system', content: DEVELOP_STORY_PROMPT(count, params.aspectRatio) },
      { role: 'user', content: userContent },
    ],
    temperature: 0.8,
    max_tokens: 2000,
  }, params.signal);

  const content = result.choices?.[0]?.message?.content?.trim() || '';
  const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed = JSON.parse(jsonStr);

  if (
    typeof parsed.narrative !== 'string' ||
    typeof parsed.subjects !== 'string' ||
    !Array.isArray(parsed.scenes) ||
    parsed.scenes.length !== count ||
    !parsed.scenes.every((s: unknown) => typeof s === 'string')
  ) {
    throw new Error('Invalid story bible format from AI');
  }

  return {
    narrative: parsed.narrative,
    subjects: parsed.subjects,
    scenes: parsed.scenes,
  };
}
