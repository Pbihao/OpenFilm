import type { ToolHandler, ToolDefinition } from './shared';
import { toolSuccess } from './shared';

export const handleSuggestNextActions: ToolHandler = async (_ctx, args) => {
  return toolSuccess({ suggestions: args.suggestions || [] });
};

export const toolDef: ToolDefinition = {
  schema: {
    type: 'function',
    function: {
      name: 'suggest_next_actions',
      description: 'Suggest 2-3 contextual next actions. MUST be called at the end of every response.',
      parameters: {
        type: 'object',
        properties: {
          suggestions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string', description: 'Short button label (2-5 words)' },
                message: { type: 'string', description: 'Natural-language instruction' },
              },
              required: ['label', 'message'],
            },
          },
        },
        required: ['suggestions'],
      },
    },
  },
  execute: handleSuggestNextActions,
};
