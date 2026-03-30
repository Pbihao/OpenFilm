import type { ToolHandler, ToolDefinition } from './shared';
import { generateSingleFrame, generateShotFrames, generateAllFramesInternal, resolveShotIndex, toolError, toolSuccess } from './shared';
import { assetDisplayUrl } from '@/lib/urlUtils';

export const handleGenerateFrames: ToolHandler = async (ctx, args, tcId) => {
  const config = ctx.configRef.current;
  const frameType: 'both' | 'first' | 'last' = args.frame_type || 'both';
  const force = !!args.force;

  // Single shot
  if (args.shot_index != null) {
    const idx = resolveShotIndex(args.shot_index, ctx.shotsRef.current);
    if (idx === null) return toolError(`Invalid shot_index: ${args.shot_index}`);
    ctx.updateToolProgress(tcId, `Shot ${args.shot_index} frames...`);

    if (frameType === 'last') {
      const shot = ctx.shotsRef.current[idx];
      if (!force && shot.lastFrame) {
        return toolSuccess({ shot_index: args.shot_index, lastFrameUrl: assetDisplayUrl(shot.lastFrame), skipped: true });
      }
      const url = await generateSingleFrame(ctx, idx, 'last', config);
      return url ? toolSuccess({ shot_index: args.shot_index, lastFrameUrl: url }) : toolError('Frame generation failed');
    }
    if (frameType === 'first') {
      const shot = ctx.shotsRef.current[idx];
      if (!force && shot.firstFrame) {
        return toolSuccess({ shot_index: args.shot_index, firstFrameUrl: assetDisplayUrl(shot.firstFrame), skipped: true });
      }
      const url = await generateSingleFrame(ctx, idx, 'first', config);
      return url ? toolSuccess({ shot_index: args.shot_index, firstFrameUrl: url }) : toolError('Frame generation failed');
    }
    const result = await generateShotFrames(ctx, idx, config, force);
    return toolSuccess({ shot_index: args.shot_index, ...result });
  }

  // All shots
  return generateAllFramesInternal(ctx, tcId, force, frameType);
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'generate_frames',
      description:
        'Generate keyframe images. Omit shot_index to process all shots. ' +
        'Use frame_type to control which frames to generate (default: both). ' +
        'Use frame_type="first" for a quick composition preview before full generation.',
      parameters: {
        type: 'object',
        properties: {
          shot_index: {
            type: 'number',
            description: 'Shot number (1-based). Omit to process all shots.',
          },
          frame_type: {
            type: 'string',
            enum: ['both', 'first', 'last'],
            description: "Which frame(s) to generate. Default: 'both'.",
          },
          force: {
            type: 'boolean',
            description: 'Force regeneration even if frames already exist.',
          },
        },
      },
    },
  },
  execute: handleGenerateFrames,
  isExpensive: true,
};
