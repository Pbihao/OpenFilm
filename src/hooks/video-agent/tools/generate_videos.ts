import type { ToolHandler, ToolDefinition } from './shared';
import { generateAllVideosInternal, resolveShotIndex, toolError } from './shared';

export const handleGenerateVideos: ToolHandler = async (ctx, args, tcId) => {
  if (args.shot_index != null) {
    const idx = resolveShotIndex(args.shot_index, ctx.shotsRef.current);
    if (idx === null) return toolError(`Invalid shot_index: ${args.shot_index}`);
    return generateAllVideosInternal(ctx, tcId, false, [idx]);
  }
  return generateAllVideosInternal(ctx, tcId, true);
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'generate_videos',
      description:
        'Generate videos from keyframes. Omit shot_index to generate all shots. ' +
        'Already-generated videos are skipped unless the user explicitly asks to redo them (use reset_workspace instead).',
      parameters: {
        type: 'object',
        properties: {
          shot_index: {
            type: 'number',
            description: 'Shot number (1-based). Omit to generate all shots.',
          },
        },
      },
    },
  },
  execute: handleGenerateVideos,
  isExpensive: true,
};
