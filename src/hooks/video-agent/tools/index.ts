/**
 * Tool registry — maps ToolName → handler, enforced by TypeScript.
 * Adding a tool requires updating TOOL_NAMES in agentToolDefs.ts AND this registry.
 * A missing entry is a compile-time error, not a silent runtime bug.
 */

import { TOOL_NAMES, type ToolName } from '@/edge-logic/agentToolDefs';
import type { ToolCall } from '@/types/video-agent';
import type { ToolContext, ToolHandler } from './shared';

import { handlePlanStory }          from './plan_story';
import { handleGenerateFrames }     from './generate_frames';
import { handleGenerateVideos }     from './generate_videos';
import { handleEditShot }           from './edit_shot';
import { handleResetWorkspace }     from './reset_workspace';
import { handleGenerateImage }      from './generate_image';
import { handleManageReferences }   from './manage_references';
import { handleSuggestNextActions } from './suggest_next_actions';

export type { ToolContext, ToolHandler };

// Record<ToolName, ...> ensures every ToolName has a handler — compile error if one is missing
const TOOL_HANDLERS: Record<ToolName, ToolHandler> = {
  [TOOL_NAMES.PLAN_STORY]:           handlePlanStory,
  [TOOL_NAMES.GENERATE_FRAMES]:      handleGenerateFrames,
  [TOOL_NAMES.GENERATE_VIDEOS]:      handleGenerateVideos,
  [TOOL_NAMES.EDIT_SHOT]:            handleEditShot,
  [TOOL_NAMES.RESET_WORKSPACE]:      handleResetWorkspace,
  [TOOL_NAMES.GENERATE_IMAGE]:       handleGenerateImage,
  [TOOL_NAMES.MANAGE_REFERENCES]:    handleManageReferences,
  [TOOL_NAMES.SUGGEST_NEXT_ACTIONS]: handleSuggestNextActions,
};

export async function executeTool(ctx: ToolContext, toolCall: ToolCall): Promise<string> {
  const name = toolCall.function.name as ToolName;
  const handler = TOOL_HANDLERS[name];
  if (!handler) return JSON.stringify({ success: false, error: `Unknown tool: ${name}` });

  let args: Record<string, any>;
  try { args = JSON.parse(toolCall.function.arguments); }
  catch { return JSON.stringify({ success: false, error: `Invalid tool arguments for ${name}` }); }

  return handler(ctx, args, toolCall.id);
}
