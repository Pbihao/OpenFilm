import type { StoryboardShot } from '@/types/storyboard';
import type { ToolHandler, ToolDefinition } from './shared';
import { updateShot, generateSingleFrame } from './shared';

export const handleEditShot: ToolHandler = async (ctx, args) => {
  const idx = (args.shot_index || 1) - 1;
  if (idx < 0 || idx >= ctx.shotsRef.current.length) {
    return JSON.stringify({ success: false, error: `Invalid shot_index: ${args.shot_index}` });
  }

  const patch: Partial<StoryboardShot> = {};
  if (args.prompt !== undefined) {
    patch.prompt = args.prompt;
    patch.status = 'idle';
    patch.videoUrl = undefined;
    patch.thumbnailUrl = undefined;
  }
  if (args.first_frame_prompt !== undefined) {
    patch.firstFramePrompt = args.first_frame_prompt;
    patch.firstFrameUrl = undefined;
    patch.firstFrameRefUrl = undefined;
    patch.firstFrameStatus = 'idle';
  }
  if (args.last_frame_prompt !== undefined) {
    patch.lastFramePrompt = args.last_frame_prompt;
    patch.extractedLastFrameUrl = undefined;
    patch.lastFrameRefUrl = undefined;
    patch.lastFrameStatus = 'idle';
  }
  updateShot(ctx, idx, patch);

  const regenerate = args.regenerate;
  if (!regenerate) return JSON.stringify({ success: true, shot_index: args.shot_index });

  const config = ctx.configRef.current;
  const frameTypes: Array<'first' | 'last'> =
    regenerate === 'first' ? ['first'] :
    regenerate === 'last'  ? ['last']  :
    ['first', 'last'];

  const results: Record<string, string | undefined> = {};
  for (const frameType of frameTypes) {
    results[`${frameType}FrameUrl`] = await generateSingleFrame(ctx, idx, frameType, config);
  }

  return JSON.stringify({ success: true, shot_index: args.shot_index, ...results });
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
          first_frame_prompt: { type: 'string', description: 'New first-frame description' },
          last_frame_prompt: { type: 'string', description: 'New last-frame description' },
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
