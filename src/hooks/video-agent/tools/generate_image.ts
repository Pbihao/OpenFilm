import { callStandaloneImageModel } from '@/edge-logic/generateFrame';
import { writeSessionFile } from '@/lib/localFs';
import type { ToolHandler, ToolDefinition, ReferenceImage } from './shared';
import { toolError, toolSuccess, resolveGlobalRefUrls } from './shared';

export const handleGenerateImage: ToolHandler = async (ctx, args, tcId) => {
  if (!args.prompt) return toolError('Prompt is required');

  try {
    const signal = ctx.abortControllerRef.current?.signal;
    ctx.updateToolProgress(tcId, 'Generating...');

    const globalRefUrls = await resolveGlobalRefUrls(ctx.configRef.current.referenceImageUrls, signal, ctx.resolvedRefUrlsCache.current);
    const userRefUrls: string[] = Array.isArray(args.reference_image_urls) ? args.reference_image_urls : [];
    const allRefUrls = [...globalRefUrls, ...userRefUrls];
    const refs: ReferenceImage[] = allRefUrls.map(url => ({ url, role: 'global_reference' }));

    const url = await callStandaloneImageModel({
      prompt: args.prompt,
      referenceImages: refs,
      aspectRatio: ctx.configRef.current.aspectRatio,
      frameModelId: ctx.configRef.current.frameModelId,
    }, signal);

    // Save locally for debugging (fire-and-forget — never blocks or affects the result)
    const ext = url.includes('.png') ? 'png' : 'jpg';
    fetch(url).then(r => r.blob())
      .then(blob => writeSessionFile(ctx.sessionFolder, `images/chat_${Date.now()}.${ext}`, blob))
      .catch(() => {});

    return toolSuccess({ image_url: url });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
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
          reference_image_urls: {
            type: 'array',
            items: { type: 'string' },
            description: 'Optional list of reference image URLs. Global session references are always included automatically.',
          },
        },
        required: ['prompt'],
      },
    },
  },
  execute: handleGenerateImage,
  isExpensive: true,
};
