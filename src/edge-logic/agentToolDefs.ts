/**
 * Video Agent — Tool definitions
 *
 * Architecture: 8 tools in 3 layers + 1 utility
 *
 * Layer 1 — Story planning:   plan_story
 * Layer 2 — Generation:       generate_frames, generate_videos, reset_workspace, generate_image
 * Layer 3 — Editing & mgmt:   edit_shot, manage_references
 * Utility:                    suggest_next_actions
 *
 * Adding a new tool:
 *   1. Add schema to AGENT_TOOLS below
 *   2. Add name to TOOL_NAMES
 *   3. Create handler in src/hooks/video-agent/tools/<tool_name>.ts
 *   4. Register in src/hooks/video-agent/tools/index.ts
 */

// ─── Tool name registry — single source of truth ──────────────────────────────

export const TOOL_NAMES = {
  PLAN_STORY:           'plan_story',
  GENERATE_FRAMES:      'generate_frames',
  GENERATE_VIDEOS:      'generate_videos',
  RESET_WORKSPACE:      'reset_workspace',
  GENERATE_IMAGE:       'generate_image',
  EDIT_SHOT:            'edit_shot',
  MANAGE_REFERENCES:    'manage_references',
  SUGGEST_NEXT_ACTIONS: 'suggest_next_actions',
} as const;

export type ToolName = typeof TOOL_NAMES[keyof typeof TOOL_NAMES];

// ─── Prompt builder — generates "## Your Tools" section from schemas ──────────

export function buildToolsSection(): string {
  const lines: string[] = ['## Your Tools'];
  let n = 1;
  for (const tool of AGENT_TOOLS) {
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

// ─── Tool schemas ─────────────────────────────────────────────────────────────

export const AGENT_TOOLS = [
  // ─── Layer 1: Story planning ────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'plan_story',
      description:
        "Break the user's story into 1-5 shots, each with a video prompt, first-frame prompt, and last-frame prompt. Call this whenever the user describes a new video idea.",
      parameters: {
        type: 'object',
        properties: {
          story: { type: 'string', description: 'Full story description from the user' },
          shot_count: { type: 'number', description: 'Number of shots (1-5, default 3)' },
          aspect_ratio: { type: 'string', enum: ['16:9', '9:16'], description: 'Video aspect ratio' },
          clear_references: {
            type: 'boolean',
            description: 'Set true when starting a completely new/different project to clear old reference images',
          },
        },
        required: ['story'],
      },
    },
  },

  // ─── Layer 2: Generation ────────────────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'generate_frames',
      description:
        'Generate keyframe images. Omit shot_index to process all shots. ' +
        'Use frame_type to control which frames to generate (default: both). ' +
        'Use frame_type="first" for a quick composition preview before full generation.',
      parameters: {
        type: 'object',
        properties: {
          shot_index: {
            type: 'number',
            description: 'Shot number (1-based). Omit to process all shots.',
          },
          frame_type: {
            type: 'string',
            enum: ['both', 'first', 'last'],
            description: "Which frame(s) to generate. Default: 'both'.",
          },
          force: {
            type: 'boolean',
            description: 'Force regeneration even if frames already exist.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'generate_videos',
      description:
        'Generate videos from keyframes. Omit shot_index to generate all shots. ' +
        'Already-generated videos are skipped unless the user explicitly asks to redo them (use reset_workspace instead).',
      parameters: {
        type: 'object',
        properties: {
          shot_index: {
            type: 'number',
            description: 'Shot number (1-based). Omit to generate all shots.',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'reset_workspace',
      description:
        'Clear ALL generated frames and videos, then regenerate everything from scratch. ' +
        'Use this when the user says "start over", "redo everything", or is dissatisfied with overall results.',
      parameters: {
        type: 'object',
        properties: {
          include_videos: {
            type: 'boolean',
            description: 'Also regenerate videos after frames are done',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
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

  // ─── Layer 3: Editing & management ─────────────────────────────────────────
  {
    type: 'function' as const,
    function: {
      name: 'edit_shot',
      description:
        'Modify a shot\'s prompts. ' +
        'Set regenerate to automatically regenerate frames after editing: ' +
        'true = both frames, "first" = first frame only, "last" = last frame only. ' +
        'When regenerate is set this is an expensive operation requiring confirmation.',
      parameters: {
        type: 'object',
        properties: {
          shot_index: { type: 'number', description: 'Shot number (1-based)' },
          prompt: { type: 'string', description: 'New video description for the shot' },
          first_frame_prompt: { type: 'string', description: 'New first-frame description' },
          last_frame_prompt: { type: 'string', description: 'New last-frame description' },
          regenerate: {
            description:
              'Regenerate frames after editing. true = both, "first" or "last" = specific frame.',
            oneOf: [
              { type: 'boolean' },
              { type: 'string', enum: ['first', 'last'] },
            ],
          },
        },
        required: ['shot_index'],
      },
    },
  },
  {
    type: 'function' as const,
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

  // ─── Utility ────────────────────────────────────────────────────────────────
  {
    type: 'function' as const,
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
];
