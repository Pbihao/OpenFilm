import type { ToolHandler } from './shared';

export const handleSuggestNextActions: ToolHandler = async (_ctx, args) => {
  return JSON.stringify({ success: true, suggestions: args.suggestions || [] });
};
