import type { ToolHandler } from './shared';
import { generateAllVideosInternal } from './shared';

export const handleGenerateVideos: ToolHandler = async (ctx, args, tcId) => {
  if (args.shot_index != null) {
    const idx = args.shot_index - 1;
    if (idx < 0 || idx >= ctx.shotsRef.current.length) {
      return JSON.stringify({ success: false, error: `Invalid shot_index: ${args.shot_index}` });
    }
    return generateAllVideosInternal(ctx, tcId, false, [idx]);
  }
  return generateAllVideosInternal(ctx, tcId, true);
};
