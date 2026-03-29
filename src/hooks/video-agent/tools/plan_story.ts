import { splitStory } from '@/edge-logic/splitStory';
import { createShot } from '../agentSession';
import type { ToolHandler, ToolDefinition } from './shared';
import { replaceAllShots } from './shared';

export const handlePlanStory: ToolHandler = async (ctx, args) => {
  const shotCount = Math.min(Math.max(args.shot_count || ctx.configRef.current.shotCount || 3, 1), 5);
  const aspectRatio = args.aspect_ratio || ctx.configRef.current.aspectRatio;

  if (args.clear_references) {
    ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: [] };
    ctx.setConfig(ctx.configRef.current);
  }

  try {
    const result = await splitStory({
      description: args.story,
      shotCount,
      aspectRatio,
      referenceImageUrls: ctx.configRef.current.referenceImageUrls,
    });

    const newShots = result.shots.map((s, i) =>
      createShot(i + 1, {
        prompt: s.shot_prompt,
        firstFramePrompt: s.first_frame_prompt,
        lastFramePrompt: s.last_frame_prompt,
      })
    );

    replaceAllShots(ctx, newShots);
    ctx.storySummaryRef.current = result.storySummary;
    ctx.setStorySummary(result.storySummary);
    if (aspectRatio !== ctx.configRef.current.aspectRatio) {
      ctx.configRef.current = { ...ctx.configRef.current, aspectRatio };
      ctx.setConfig(ctx.configRef.current);
    }

    return JSON.stringify({
      success: true,
      shot_count: newShots.length,
      shots: newShots.map((s, i) => ({
        index: i + 1, prompt: s.prompt,
        firstFramePrompt: s.firstFramePrompt, lastFramePrompt: s.lastFramePrompt,
      })),
    });
  } catch (err) {
    return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'plan_story',
      description:
        "Break the user's story into 1-5 shots, each with a video prompt, first-frame prompt, and last-frame prompt. Call this whenever the user describes a new video idea.",
      parameters: {
        type: 'object',
        properties: {
          story: { type: 'string', description: 'Full story description from the user' },
          shot_count: { type: 'number', description: 'Number of shots (1-5, default 3)' },
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
  execute: handlePlanStory,
};
