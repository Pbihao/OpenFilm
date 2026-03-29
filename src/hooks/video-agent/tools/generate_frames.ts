import type { ToolHandler } from './shared';
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
      const url = await generateSingleFrame(ctx, idx, 'last', config);
      return JSON.stringify({ success: !!url, shot_index: args.shot_index, lastFrameUrl: url });
    }
    if (frameType === 'first') {
      const url = await generateSingleFrame(ctx, idx, 'first', config);
      return JSON.stringify({ success: !!url, shot_index: args.shot_index, firstFrameUrl: url });
    }
    const result = await generateShotFrames(ctx, idx, config, force);
    return JSON.stringify({ success: true, shot_index: args.shot_index, ...result });
  }

  // All shots
  return generateAllFramesInternal(ctx, tcId, force, frameType);
};
