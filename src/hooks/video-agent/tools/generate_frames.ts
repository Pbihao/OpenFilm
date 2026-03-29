import type { ToolHandler, ToolDefinition } from './shared';
import { generateSingleFrame, generateShotFrames, generateAllFramesInternal } from './shared';

export const handleGenerateFrames: ToolHandler = async (ctx, args, tcId) => {
  const config = ctx.configRef.current;
  const frameType: 'both' | 'first' | 'last' = args.frame_type || 'both';
  const force = !!args.force;

  // Single shot
  if (args.shot_index != null) {
    const idx = args.shot_index - 1;
    if (idx < 0 || idx >= ctx.shotsRef.current.length) {
      return JSON.stringify({ success: false, error: `Invalid shot_index: ${args.shot_index}` });
    }
    ctx.updateToolProgress(tcId, `Shot ${args.shot_index} frames...`);

    if (frameType === 'last') {
      const shot = ctx.shotsRef.current[idx];
      if (!force && shot.extractedLastFrameUrl) {
        return JSON.stringify({ success: true, shot_index: args.shot_index, lastFrameUrl: shot.extractedLastFrameUrl, skipped: true });
      }
      const url = await generateSingleFrame(ctx, idx, 'last', config);
      return JSON.stringify({ success: !!url, shot_index: args.shot_index, lastFrameUrl: url });
    }
    if (frameType === 'first') {
      const shot = ctx.shotsRef.current[idx];
      if (!force && shot.firstFrameUrl) {
        return JSON.stringify({ success: true, shot_index: args.shot_index, firstFrameUrl: shot.firstFrameUrl, skipped: true });
      }
      const url = await generateSingleFrame(ctx, idx, 'first', config);
      return JSON.stringify({ success: !!url, shot_index: args.shot_index, firstFrameUrl: url });
    }
    const result = await generateShotFrames(ctx, idx, config, force);
    return JSON.stringify({ success: true, shot_index: args.shot_index, ...result });
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
