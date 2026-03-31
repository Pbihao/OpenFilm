/**
 * Video Agent — Tool definitions
 *
 * Schemas live in each tool file under src/hooks/video-agent/tools/.
 * This file provides AGENT_TOOLS (re-exported for agentStream) and buildToolsSection().
 *
 * Adding a new tool:
 *   1. Create src/hooks/video-agent/tools/<tool_name>.ts with toolDef
 *   2. Add one import + one entry to TOOL_REGISTRY in tools/index.ts
 */

import { AGENT_TOOLS as _AGENT_TOOLS } from '@/hooks/video-agent/tools';

export { AGENT_TOOLS } from '@/hooks/video-agent/tools';

// ─── Tool name constants — kept for consumers that need string literals ────────

export const TOOL_NAMES = {
  DEVELOP_STORY:        'develop_story',
  PLAN_SHOTS:           'plan_shots',
  GENERATE_FRAMES:      'generate_frames',
  GENERATE_VIDEOS:      'generate_videos',
  RESET_WORKSPACE:      'reset_workspace',
  GENERATE_IMAGE:       'generate_image',
  EDIT_SHOT:            'edit_shot',
  MANAGE_REFERENCES:    'manage_references',
  VIEW_FRAME:           'view_frame',
  SUGGEST_NEXT_ACTIONS: 'suggest_next_actions',
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

// ─── Prompt builder — generates "## Your Tools" section from schemas ──────────

export function buildToolsSection(): string {
  const lines: string[] = ['## Your Tools'];
  let n = 1;
  for (const tool of _AGENT_TOOLS) {
    const { name, description, parameters } = tool.function;
    const props = parameters?.properties ?? {};
    const required: string[] = parameters?.required ?? [];
    const paramLines = Object.entries(props).map(([key, val]: [string, any]) => {
      const req = required.includes(key) ? ' **(required)**' : '';
      const desc = val.description ?? val.enum?.join(' | ') ?? '';
      return `   - \`${key}\`${req}: ${desc}`;
    });
    lines.push(`${n++}. **${name}** — ${description}${paramLines.length ? '\n' + paramLines.join('\n') : ''}`);
  }
  return lines.join('\n');
}
