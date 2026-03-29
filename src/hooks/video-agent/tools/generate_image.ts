import { generateFrame } from '@/edge-logic/generateFrame';
import { writeSessionFile } from '@/lib/localFs';
import type { ToolHandler, ReferenceImage } from './shared';

export const handleGenerateImage: ToolHandler = async (ctx, args) => {
  if (!args.prompt) return JSON.stringify({ success: false, error: 'Prompt is required' });

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
    return JSON.stringify({ success: true, image_url: localUrl ?? falUrl });
  } catch (err) {
    return JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
};
