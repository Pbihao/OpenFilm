/**
 * Tool registry — single source of truth for all agent tools.
 *
 * Adding a new tool:
 *   1. Create src/hooks/video-agent/tools/<tool_name>.ts
 *      — export `toolDef: ToolDefinition` with schema, execute, and optional isExpensive
 *   2. Import it here and add to TOOL_REGISTRY
 *   That's it. No other files need to change.
 */

import type { ToolCall } from '@/types/video-agent';
import type { ToolContext, ToolDefinition } from './shared';
import { toolError } from './shared';

import { toolDef as developStory }       from './develop_story';
import { toolDef as planShots }          from './plan_shots';
import { toolDef as generateFrames }     from './generate_frames';
import { toolDef as generateVideos }     from './generate_videos';
import { toolDef as editShot }           from './edit_shot';
import { toolDef as resetWorkspace }     from './reset_workspace';
import { toolDef as generateImage }      from './generate_image';
import { toolDef as manageReferences }   from './manage_references';
import { toolDef as suggestNextActions } from './suggest_next_actions';
import { toolDef as viewFrame }          from './view_frame';

export type { ToolContext, ToolDefinition };
export type { ToolHandler } from './shared';

// ─── Registry ─────────────────────────────────────────────────────────────────

export const TOOL_REGISTRY: ToolDefinition[] = [
  developStory,
  planShots,
  generateFrames,
  generateVideos,
  editShot,
  resetWorkspace,
  generateImage,
  manageReferences,
  viewFrame,
  suggestNextActions,
];

// ─── Derived: API schemas (passed to the LLM) ─────────────────────────────────

export const AGENT_TOOLS = TOOL_REGISTRY.map(t => t.schema);

// ─── Derived: O(1) lookup maps (built once at module load) ───────────────────

const handlerMap = new Map(TOOL_REGISTRY.map(t => [t.schema.function.name, t.execute]));

// Static expensive tools (always require confirmation)
const alwaysExpensiveNames = new Set(
  TOOL_REGISTRY.filter(t => t.isExpensive === true).map(t => t.schema.function.name)
);
// Arg+context-dependent expensive tools (function predicate)
const conditionalExpensiveDefs = new Map(
  TOOL_REGISTRY
    .filter((t): t is ToolDefinition & { isExpensive: (args: Record<string, any>, ctx: ToolContext) => boolean } =>
      typeof t.isExpensive === 'function'
    )
    .map(t => [t.schema.function.name, t.isExpensive])
);

export async function executeTool(ctx: ToolContext, toolCall: ToolCall): Promise<string> {
  const name = toolCall.function.name;
  const handler = handlerMap.get(name);
  if (!handler) return toolError(`Unknown tool: ${name}`);

  let args: Record<string, any>;
  try { args = JSON.parse(toolCall.function.arguments); }
  catch { return toolError(`Invalid tool arguments for ${name}`); }

  return handler(ctx, args, toolCall.id);
}

// ─── Expensive-tool check — O(1) via pre-built maps ──────────────────────────

export function isExpensiveTool(toolCall: ToolCall, ctx: ToolContext): boolean {
  const name = toolCall.function.name;
  if (alwaysExpensiveNames.has(name)) return true;
  const predicate = conditionalExpensiveDefs.get(name);
  if (!predicate) return false;
  try { return predicate(JSON.parse(toolCall.function.arguments), ctx); } catch { return false; }
}
