/**
 * plan_shots — Stage 2 of the story pipeline.
 *
 * Translates the stored StoryBible into concrete shot scripts
 * (shot_prompt, first_frame_prompt, last_frame_prompt).
 * Requires develop_story to have been called first.
 */

import { splitStory } from '@/edge-logic/splitStory';
import { createShot } from '../agentSession';
import type { ToolHandler, ToolDefinition } from './shared';
import { replaceAllShots, resolveGlobalRefUrls, toolError, toolSuccess } from './shared';

export const handlePlanShots: ToolHandler = async (ctx, args, tcId) => {
  if (!ctx.storyBibleRef.current) {
    return toolError('No story bible found. Call develop_story first to establish the creative concept.');
  }

  const bible = ctx.storyBibleRef.current;
  const aspectRatio = ctx.configRef.current.aspectRatio;

  try {
    const signal = ctx.abortControllerRef.current?.signal;
    const referenceImageUrls = await resolveGlobalRefUrls(ctx.configRef.current.referenceImageUrls, signal, ctx.resolvedRefUrlsCache.current);

    ctx.updateToolProgress(tcId, 'Writing shot scripts...');
    const shots = await splitStory({ bible, aspectRatio, referenceImageUrls, signal });

    const newShots = shots.map((s, i) =>
      createShot(i + 1, {
        prompt: s.shot_prompt,
        firstFramePrompt: s.first_frame_prompt,
        lastFramePrompt: s.last_frame_prompt,
      })
    );

    replaceAllShots(ctx, newShots);

    return toolSuccess({
      shot_count: newShots.length,
      shots: newShots.map((s, i) => ({
        index: i + 1,
        prompt: s.prompt,
        firstFramePrompt: s.firstFramePrompt,
        lastFramePrompt: s.lastFramePrompt,
      })),
    });
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'plan_shots',
      description:
        'Translate the approved story bible into detailed shot scripts (shot prompt, first/last frame prompts). Call this after the user has approved the develop_story output.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  execute: handlePlanShots,
  isExpensive: (_args, ctx) => ctx.shotsRef.current.length > 0,
};
