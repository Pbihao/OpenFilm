/**
 * Shared frame-writing rules — single source of truth.
 *
 * Imported by:
 *   - src/edge-logic/systemPrompt.ts  (agent Prompt Writing Rules section)
 *   - src/edge-logic/splitStory.ts    (story-planning LLM call)
 *
 * Edit here; changes propagate to both automatically.
 */

export const SHOT_PROMPT_RULES = `\
- Each shot_prompt MUST be 3-5 detailed sentences describing camera movement, subject action, motion choreography, lighting changes, and pacing
- The FIRST shot MUST use a wide, establishing, or medium shot — never close-up or extreme close-up
- Vary shot types and camera movements across shots — adjacent shots MUST use different combinations
- Character/subject appearance is defined in the story bible — reference subjects by name in shot_prompt, do NOT re-describe their appearance
- Follow a narrative arc: establish → develop → climax → resolve
- NEVER include brand names, trademarks, logos, or copyrighted character names`;

export const FRAME_PROMPT_RULES = `\
- Frame prompts describe STATIC IMAGES. Shot prompts describe MOTION. Keep these strictly distinct.
- Frame prompts must cover all elements in balanced proportion: camera angle & framing, subject pose/position (and key appearance only if directly relevant to this shot), environment & location details, lighting & atmosphere. Do not over-weight any single element — a prompt dominated by character appearance at the expense of camera/environment/lighting will produce off-target results.
- first_frame_prompt structure: [render style] + [camera angle, shot framing] + [subject name + starting pose/position only] + [environment: location, key background elements, textures] + [lighting: direction, quality, color temperature] + [mood/atmosphere]. No motion words.
- last_frame_prompt structure: SAME camera angle, framing, and environment as first_frame_prompt (it is the same shot, just at the end) — only the subject's pose/position changes to the completed-action state. Bridges visually to the next shot's first_frame_prompt.`;
