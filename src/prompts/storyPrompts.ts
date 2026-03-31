/**
 * Story pipeline prompts — two-stage creative development.
 *
 * Stage 1 (creative director): DEVELOP_STORY_PROMPT
 *   Input: raw user description → Output: StoryBible (narrative intent + subject anchors + scene purposes)
 *
 * Stage 2 (storyboard designer): SPLIT_STORY_PROMPT
 *   Input: StoryBible → Output: shot_prompt + first_frame_prompt + last_frame_prompt per shot
 */

import type { StoryBible } from '@/types/storyboard';
import { SHOT_PROMPT_RULES, FRAME_PROMPT_RULES } from './frameRules';

export const DEVELOP_STORY_PROMPT = (shotCount: number, _aspectRatio: string): string =>
  `You are a creative director and cinematographer developing a short video concept.
Your job is to define the narrative and visual identity — NOT to describe how to film it.

Given the concept, output a JSON story bible with exactly these fields:
{
  "narrative": "2-3 sentences: the core premise, visual world (lighting, color palette, mood, art style), and emotional journey start→end. Write as a filmmaker's intent statement.",
  "subjects": "Precise, reusable description of every character/vehicle/key object that appears in the video. Include: appearance, clothing, distinguishing features, key props. Written to be copied verbatim into shot descriptions for visual consistency.",
  "scenes": ["...", ...]
}

scenes rules:
- Exactly ${shotCount} scene strings, one per scene.
- Each scene is ONE sentence: what this scene must accomplish narratively and emotionally.
- Example: "Establish the wasteland world and introduce the robot as a lone survivor" — not "wide shot of robot walking".
- Together the scenes must form a complete arc: establish → develop → climax → resolve.
- Write ALL text in the same language as the input description.
- Return ONLY valid JSON, no other text.`;

export const SPLIT_STORY_PROMPT = (
  bible: StoryBible,
  aspectRatio: string,
  imageInstruction: string,
): string =>
  `You are a storyboard designer. Translate this story bible into ${bible.scenes.length} video shots.

STORY BIBLE:
Narrative: ${bible.narrative}
Subjects: ${bible.subjects}
Scene purposes:
${bible.scenes.map((s, i) => `  Shot ${i + 1}: ${s}`).join('\n')}

For each shot output:
  - "shot_prompt": how to film this scene — camera movement, subject action, motion details (3-5 sentences)
  - "first_frame_prompt": opening static keyframe — camera/framing/environment/lighting/subject starting pose. DO NOT describe character appearance (already defined in Subjects above).
  - "last_frame_prompt": closing static keyframe — SAME camera and environment as first_frame_prompt, subject at the END of the motion. DO NOT describe character appearance.

Output format: JSON array of ${bible.scenes.length} shot objects.

Rules:
- Subject names/references in frame prompts must match the story bible's "subjects" field — but do NOT repeat their appearance description (clothing, features, etc.); instead focus on pose, position, and spatial relationship to the environment
${SHOT_PROMPT_RULES}
- For ${aspectRatio} format, compose shots appropriately${imageInstruction}
${FRAME_PROMPT_RULES}
- Write ALL prompts in the SAME LANGUAGE as the story bible
- Return ONLY a JSON array, no other text`;
