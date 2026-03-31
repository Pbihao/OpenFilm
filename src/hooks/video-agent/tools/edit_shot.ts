import type { StoryboardShot } from '@/types/storyboard';
import type { ToolHandler, ToolDefinition } from './shared';
import { updateShot, generateSingleFrame, resolveShotIndex, toolError, toolSuccess } from './shared';

export const handleEditShot: ToolHandler = async (ctx, args) => {
  const idx = resolveShotIndex(args.shot_index || 1, ctx.shotsRef.current);
  if (idx === null) return toolError(`Invalid shot_index: ${args.shot_index}`);

  const patch: Partial<StoryboardShot> = {};
  if (args.prompt !== undefined) {
    patch.prompt = args.prompt;
    patch.status = 'idle';
    patch.videoUrl = undefined;
    patch.thumbnailUrl = undefined;
  }
  if (args.first_frame_prompt !== undefined) {
    patch.firstFramePrompt = args.first_frame_prompt;
    // Do NOT clear firstFrame here — keep the existing image (manually assigned or generated).
    // The frame is only replaced when `regenerate` is explicitly set below.
  }
  if (args.last_frame_prompt !== undefined) {
    patch.lastFramePrompt = args.last_frame_prompt;
    // Same — preserve existing frame until caller explicitly requests regeneration.
  }
  updateShot(ctx, idx, patch);

  // Sync scene intent back to StoryBible so creative context stays aligned with actual shots
  if (args.scene_intent !== undefined && ctx.storyBibleRef.current) {
    const scenes = [...ctx.storyBibleRef.current.scenes];
    scenes[idx] = args.scene_intent;
    ctx.storyBibleRef.current = { ...ctx.storyBibleRef.current, scenes };
    ctx.setStoryBible(ctx.storyBibleRef.current);
  }

  const regenerate = args.regenerate;
  if (!regenerate) return toolSuccess({ shot_index: args.shot_index });

  const config = ctx.configRef.current;
  const frameTypes: Array<'first' | 'last'> =
    regenerate === 'first' ? ['first'] :
    regenerate === 'last'  ? ['last']  :
    ['first', 'last'];

  const results: Record<string, string | undefined> = {};
  for (const frameType of frameTypes) {
    results[`${frameType}FrameUrl`] = await generateSingleFrame(ctx, idx, frameType, config);
  }

  return toolSuccess({ shot_index: args.shot_index, ...results });
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'edit_shot',
      description:
        'Modify a shot\'s prompts. ' +
        'Set regenerate to automatically regenerate frames after editing: ' +
        'true = both frames, "first" = first frame only, "last" = last frame only. ' +
        'When regenerate is set this is an expensive operation requiring confirmation.',
      parameters: {
        type: 'object',
        properties: {
          shot_index: { type: 'number', description: 'Shot number (1-based)' },
          prompt: { type: 'string', description: 'New video description for the shot' },
          first_frame_prompt: { type: 'string', description: 'Static image prompt for the opening keyframe. Focus on: camera angle & framing, environment/location details, lighting & atmosphere, subject starting pose/position in frame. Do NOT re-describe character appearance (defined in story bible). No motion words.' },
          last_frame_prompt: { type: 'string', description: 'Static image prompt for the closing keyframe. SAME camera angle, framing, and environment as first_frame_prompt — only the subject\'s pose/position changes to the completed-action state. Bridges visually to the next shot. Do NOT re-describe character appearance.' },
          scene_intent: {
            type: 'string',
            description: 'Updated one-sentence narrative purpose for this scene — syncs back to the story bible to keep creative context aligned.',
          },
          regenerate: {
            description:
              'Regenerate frames after editing. true = both, "first" or "last" = specific frame.',
            oneOf: [
              { type: 'boolean' },
              { type: 'string', enum: ['first', 'last'] },
            ],
          },
        },
        required: ['shot_index'],
      },
    },
  },
  execute: handleEditShot,
  isExpensive: (args) => !!args.regenerate,
};
