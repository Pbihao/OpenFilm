import { generateFrame } from '@/edge-logic/generateFrame';
import { writeSessionFile } from '@/lib/localFs';
import type { ToolHandler, ToolDefinition, ReferenceImage } from './shared';
import { toolError, toolSuccess } from './shared';

export const handleGenerateImage: ToolHandler = async (ctx, args) => {
  if (!args.prompt) return toolError('Prompt is required');

  try {
    const signal = ctx.abortControllerRef.current?.signal;
    const refs: ReferenceImage[] = args.reference_image_url
      ? [{ url: args.reference_image_url, role: 'global_reference' }]
      : [];
    const falUrl = await generateFrame({
      prompt: args.prompt,
      referenceImages: refs,
      aspectRatio: ctx.configRef.current.aspectRatio,
      frameModelId: ctx.configRef.current.frameModelId,
      shotIndex: 0,
      frameType: 'first',
      storySummary: '',
      shotPrompt: args.prompt,
    }, signal);
    const filename = `images/chat_${Date.now()}.${falUrl.includes('.png') ? 'png' : 'jpg'}`;
    const blob = await fetch(falUrl, { signal }).then(r => r.blob());
    const localUrl = await writeSessionFile(ctx.sessionFolder, filename, blob);
    return toolSuccess({ image_url: localUrl ?? falUrl });
  } catch (err) {
    return toolError(err instanceof Error ? err.message : String(err));
  }
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate a standalone image in the chat (not tied to any shot). Use this for concept exploration or reference creation.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Text description of the image' },
          reference_image_url: { type: 'string', description: 'Optional reference image URL' },
        },
        required: ['prompt'],
      },
    },
  },
  execute: handleGenerateImage,
  isExpensive: true,
};
