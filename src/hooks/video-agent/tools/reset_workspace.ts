import type { ToolHandler } from './shared';
import { replaceAllShots, generateAllFramesInternal, generateAllVideosInternal } from './shared';

export const handleResetWorkspace: ToolHandler = async (ctx, args, tcId) => {
  if (ctx.shotsRef.current.length === 0) {
    return JSON.stringify({ success: false, error: 'No shots to regenerate' });
  }

  ctx.updateToolProgress(tcId, 'Clearing...');
  const resetShots = ctx.shotsRef.current.map(s => ({
    ...s,
    firstFrameUrl: undefined, firstFrameRefUrl: undefined, firstFrameStatus: 'idle' as const,
    extractedLastFrameUrl: undefined, lastFrameRefUrl: undefined, lastFrameStatus: 'idle' as const,
    videoUrl: undefined, thumbnailUrl: undefined, status: 'idle' as const,
    error: undefined,
  }));
  replaceAllShots(ctx, resetShots);

  const framesResult = await generateAllFramesInternal(ctx, tcId, true, 'both');
  const framesData = JSON.parse(framesResult);

  if (args.include_videos && framesData.success) {
    ctx.updateToolProgress(tcId, 'Generating videos...');
    const videosResult = await generateAllVideosInternal(ctx, tcId, false);
    const videosData = JSON.parse(videosResult);
    return JSON.stringify({ success: true, frames: framesData.frames, videos: videosData.videos });
  }

  return JSON.stringify({ success: true, frames: framesData.frames, include_videos: false });
};
