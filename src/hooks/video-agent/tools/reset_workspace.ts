import type { ToolHandler, ToolDefinition } from './shared';
import { replaceAllShots, generateAllFramesInternal, generateAllVideosInternal, toolError, toolSuccess } from './shared';

export const handleResetWorkspace: ToolHandler = async (ctx, args, tcId) => {
  if (ctx.shotsRef.current.length === 0) return toolError('No shots to regenerate');

  ctx.updateToolProgress(tcId, 'Clearing...');
  const resetShots = ctx.shotsRef.current.map(s => ({
    ...s,
    firstFrame: undefined, firstFrameStatus: 'idle' as const,
    lastFrame: undefined, lastFrameStatus: 'idle' as const,
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
    return toolSuccess({ frames: framesData.frames, videos: videosData.videos });
  }

  return toolSuccess({ frames: framesData.frames, include_videos: false });
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'reset_workspace',
      description:
        'Clear ALL generated frames and videos, then regenerate everything from scratch. ' +
        'ONLY use when user says "start over", "redo everything", or is dissatisfied with ALL results. ' +
        'NEVER use this for a single shot — use generate_videos(shot_index=X) or generate_frames(shot_index=X) instead.',
      parameters: {
        type: 'object',
        properties: {
          include_videos: {
            type: 'boolean',
            description: 'Also regenerate videos after frames are done',
          },
        },
      },
    },
  },
  execute: handleResetWorkspace,
  isExpensive: true,
};
