import type { ToolHandler, ToolDefinition } from './shared';
import { updateShot } from './shared';

export const handleManageReferences: ToolHandler = async (ctx, args) => {
  const { action, image_url, index, shot_index, frame_type } = args;

  switch (action) {
    case 'add': {
      if (!image_url) return JSON.stringify({ success: false, error: 'image_url required for add' });
      try { new URL(image_url); } catch { return JSON.stringify({ success: false, error: 'Invalid image_url' }); }
      const refs = ctx.configRef.current.referenceImageUrls;
      if (refs.includes(image_url)) return JSON.stringify({ success: true, message: 'Already registered', total: refs.length });
      if (refs.length >= 3) return JSON.stringify({ success: false, error: 'Maximum 3 reference images. Remove one first.' });
      const updated = [...refs, image_url];
      ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: updated };
      ctx.setConfig(ctx.configRef.current);
      return JSON.stringify({ success: true, total: updated.length });
    }
    case 'remove': {
      const refs = ctx.configRef.current.referenceImageUrls;
      const i = Number(index);
      if (!i || i < 1 || i > refs.length) return JSON.stringify({ success: false, error: 'Invalid index' });
      const updated = refs.filter((_, j) => j !== i - 1);
      ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: updated };
      ctx.setConfig(ctx.configRef.current);
      return JSON.stringify({ success: true, remaining: updated.length });
    }
    case 'clear': {
      ctx.configRef.current = { ...ctx.configRef.current, referenceImageUrls: [] };
      ctx.setConfig(ctx.configRef.current);
      return JSON.stringify({ success: true, remaining: 0 });
    }
    case 'assign': {
      if (!image_url) return JSON.stringify({ success: false, error: 'image_url required for assign' });
      const idx = (shot_index || 1) - 1;
      if (idx < 0 || idx >= ctx.shotsRef.current.length) return JSON.stringify({ success: false, error: 'Invalid shot_index' });
      if (!frame_type || !['first', 'last'].includes(frame_type)) return JSON.stringify({ success: false, error: 'frame_type must be "first" or "last"' });
      const urlKey = frame_type === 'first' ? 'firstFrameUrl' : 'extractedLastFrameUrl';
      const refUrlKey = frame_type === 'first' ? 'firstFrameRefUrl' : 'lastFrameRefUrl';
      const statusKey = frame_type === 'first' ? 'firstFrameStatus' : 'lastFrameStatus';
      updateShot(ctx, idx, { [urlKey]: image_url, [refUrlKey]: image_url, [statusKey]: 'completed' });
      return JSON.stringify({ success: true, shot_index, frame_type });
    }
    default:
      return JSON.stringify({ success: false, error: `Unknown action: ${action}` });
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
