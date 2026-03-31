/**
 * develop_story — Stage 1 of the story pipeline.
 *
 * Calls the creative director LLM to produce a StoryBible:
 * narrative intent, subject anchors, and per-scene purposes.
 * The agent presents this to the user for approval before plan_shots runs.
 */

import { developStory } from '@/edge-logic/developStory';
import type { ToolHandler, ToolDefinition } from './shared';
import { resolveGlobalRefUrls, toolError, toolSuccess } from './shared';

export const handleDevelopStory: ToolHandler = async (ctx, args, tcId) => {
  const shotCount = Math.min(Math.max(args.shot_count || ctx.configRef.current.shotCount || 3, 2), 10);
  const aspectRatio = args.aspect_ratio || ctx.configRef.current.aspectRatio;

  if (args.clear_references) {
    ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: [] };
    ctx.setConfig(ctx.configRef.current);
  }

  // Persist shot count + aspect ratio so plan_shots can read them without args
  if (shotCount !== ctx.configRef.current.shotCount || aspectRatio !== ctx.configRef.current.aspectRatio) {
    ctx.configRef.current = { ...ctx.configRef.current, shotCount, aspectRatio };
    ctx.setConfig(ctx.configRef.current);
  }

  try {
    const signal = ctx.abortControllerRef.current?.signal;
    const referenceImageUrls = await resolveGlobalRefUrls(ctx.configRef.current.referenceImageUrls, signal, ctx.resolvedRefUrlsCache.current);

    ctx.updateToolProgress(tcId, 'Developing creative concept...');
    const bible = await developStory({ description: args.story, shotCount, aspectRatio, referenceImageUrls, signal });

    ctx.storyBibleRef.current = bible;
    ctx.setStoryBible(bible);

    return toolSuccess({
      narrative: bible.narrative,
      subjects: bible.subjects,
      scenes: bible.scenes,
      shot_count: shotCount,
      aspect_ratio: aspectRatio,
    });
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'develop_story',
      description:
        "Develop the creative concept for a video: narrative intent, visual world, character/subject descriptions, and per-scene purposes. Call this first when the user describes a video idea. Present the result to the user for approval before calling plan_shots.",
      parameters: {
        type: 'object',
        properties: {
          story: { type: 'string', description: 'Full story description from the user' },
          shot_count: { type: 'number', description: 'Number of shots (2-10, default 3)' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], description: 'Video aspect ratio' },
          clear_references: {
            type: 'boolean',
            description: 'Set true when starting a completely new/different project to clear old reference images',
          },
        },
        required: ['story'],
      },
    },
  },
  execute: handleDevelopStory,
};
