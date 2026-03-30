import type { ToolHandler, ToolDefinition } from './shared';
import { updateShot, resolveShotIndex, toolError, toolSuccess } from './shared';
import { makeRefEntry, makeRefAsset } from '@/lib/urlUtils';

export const handleManageReferences: ToolHandler = async (ctx, args) => {
  const { action, image_url, index, shot_index, frame_type } = args;

  switch (action) {
    case 'add': {
      if (!image_url) return toolError('image_url required for add');
      try { new URL(image_url, location.href); } catch { return toolError('Invalid image_url'); }
      const refs = ctx.configRef.current.referenceImageUrls;
      if (refs.some(r => r.displayUrl === image_url)) return toolSuccess({ message: 'Already registered', total: refs.length });
      if (refs.length >= 3) return toolError('Maximum 3 reference images. Remove one first.');
      const updated = [...refs, makeRefEntry(image_url)];
      ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: updated };
      ctx.setConfig(ctx.configRef.current);
      return toolSuccess({ total: updated.length });
    }
    case 'remove': {
      const refs = ctx.configRef.current.referenceImageUrls;
      const i = Number(index);
      if (!i || i < 1 || i > refs.length) return toolError('Invalid index');
      const updated = refs.filter((_, j) => j !== i - 1);
      ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: updated };
      ctx.setConfig(ctx.configRef.current);
      return toolSuccess({ remaining: updated.length });
    }
    case 'clear': {
      ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: [] };
      ctx.setConfig(ctx.configRef.current);
      return toolSuccess({ remaining: 0 });
    }
    case 'assign': {
      if (!image_url) return toolError('image_url required for assign');
      const idx = resolveShotIndex(shot_index || 1, ctx.shotsRef.current);
      if (idx === null) return toolError('Invalid shot_index');
      if (!frame_type || !['first', 'last'].includes(frame_type)) return toolError('frame_type must be "first" or "last"');
      const assetKey = frame_type === 'first' ? 'firstFrame' : 'lastFrame';
      const statusKey = frame_type === 'first' ? 'firstFrameStatus' : 'lastFrameStatus';
      updateShot(ctx, idx, { [assetKey]: makeRefAsset(image_url), [statusKey]: 'completed' });
      return toolSuccess({ shot_index, frame_type });
    }
    default:
      return toolError(`Unknown action: ${action}`);
  }
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'manage_references',
      description:
        'Manage global reference images or assign an image directly to a shot frame. ' +
        'Actions: "add" (register URL as reference), "remove" (by 1-based index), ' +
        '"clear" (remove all), "assign" (set image as a shot\'s first or last frame).',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['add', 'remove', 'clear', 'assign'],
            description: 'Action to perform',
          },
          image_url: { type: 'string', description: 'Image URL (required for add/assign)' },
          index: { type: 'number', description: '1-based index of reference to remove' },
          shot_index: { type: 'number', description: 'Shot number for assign action (1-based)' },
          frame_type: {
            type: 'string',
            enum: ['first', 'last'],
            description: 'Which frame to assign the image to',
          },
        },
        required: ['action'],
      },
    },
  },
  execute: handleManageReferences,
};
