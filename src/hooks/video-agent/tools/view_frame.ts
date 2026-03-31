/**
 * view_frame — Let the agent inspect a generated frame image on demand.
 *
 * Returns image_url (single frame) or image_urls (both frames) so that
 * buildApiMessages can inject them as vision into the next API call.
 * The agent should call this before editing a shot to see the current visual state.
 */

import type { ToolHandler, ToolDefinition } from './shared';
import { toolSuccess, toolError } from './shared';

export const handleViewFrame: ToolHandler = async (ctx, args) => {
  const shotIndex = (args.shot_index ?? 1) - 1;
  const frameType: 'first' | 'last' | 'both' = args.frame_type ?? 'first';

  if (shotIndex < 0 || shotIndex >= ctx.shotsRef.current.length) {
    return toolError(`Shot ${args.shot_index} does not exist (total: ${ctx.shotsRef.current.length})`);
  }

  const shot = ctx.shotsRef.current[shotIndex];
  const firstUrl = shot.firstFrame?.remoteUrl;
  const lastUrl = shot.lastFrame?.remoteUrl;

  if (frameType === 'both') {
    if (!firstUrl && !lastUrl) return toolError(`Shot ${args.shot_index} has no generated frames yet`);
    const urls = [firstUrl, lastUrl].filter(Boolean) as string[];
    return toolSuccess({ shot_index: args.shot_index, frame_type: 'both', image_urls: urls });
  }

  const url = frameType === 'first' ? firstUrl : lastUrl;
  if (!url) return toolError(`Shot ${args.shot_index} has no ${frameType} frame generated yet`);

  return toolSuccess({ shot_index: args.shot_index, frame_type: frameType, image_url: url });
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'view_frame',
      description:
        'Retrieve a generated keyframe image for visual inspection. Call this before editing a shot to see the current visual state, or when checking consistency across shots.',
      parameters: {
        type: 'object',
        properties: {
          shot_index: { type: 'number', description: '1-based shot number' },
          frame_type: {
            type: 'string',
            enum: ['first', 'last', 'both'],
            description: 'Which frame(s) to retrieve. Use "both" to check full shot visual range.',
          },
        },
        required: ['shot_index'],
      },
    },
  },
  execute: handleViewFrame,
};
