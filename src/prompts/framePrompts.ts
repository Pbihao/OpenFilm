/**
 * Frame prompt builders — construct the text prompts sent to image models.
 *
 * Separated from generateFrame.ts so prompt logic can be read, edited, and
 * tested independently from the HTTP/API calling code.
 */

export interface ReferenceImage {
  url: string;
  role: 'global_reference' | 'previous_first_frame' | 'previous_last_frame' | 'current_first_frame';
}

const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th'];

function roleDescription(role: ReferenceImage['role'], shotIndex: number): string {
  const shotNum = shotIndex + 1;
  switch (role) {
    case 'global_reference':      return 'the global reference image';
    case 'current_first_frame':   return `the first frame of the current shot (Shot ${shotNum})`;
    case 'previous_first_frame':  return `the first frame of the previous shot (Shot ${shotNum - 1})`;
    case 'previous_last_frame':   return `the last frame of the previous shot (Shot ${shotNum - 1})`;
    default:                      return 'a reference image';
  }
}

/**
 * Builds the full prompt for a storyboard keyframe (first or last frame of a shot).
 * Includes shot context, reference image descriptions, and last-frame constraints.
 */
export function buildPromptWithContext(
  basePrompt: string,
  refs: ReferenceImage[],
  aspectRatio: string,
  shotIndex: number,
  frameType: 'first' | 'last',
  storySummary?: string,
  shotPrompt?: string,
): string {
  const shotNum = shotIndex + 1;
  let prompt = `You are a professional storyboard keyframe designer. You are designing keyframes for a ${aspectRatio} video storyboard.\nYou are now generating the ${frameType} frame for Shot ${shotNum}.\n`;

  if (storySummary) prompt += `\nStory overview: ${storySummary}\n`;

  if (refs.length > 0) {
    prompt += `\nYou are provided with ${refs.length} reference image(s):\n`;
    refs.forEach((ref, i) => {
      prompt += `- The ${ORDINALS[i] || `${i + 1}th`} image is ${roleDescription(ref.role, shotNum - 1)}.\n`;
    });
  }

  if (frameType === 'last' && shotPrompt) {
    prompt += `\nVideo action for this shot:\n${shotPrompt}\n`;
    prompt += `
CRITICAL CONSTRAINTS FOR LAST FRAME:
This frame captures the END STATE after the camera movement and all actions described in the shot prompt have fully completed.

1. SUBJECT STATE CHANGES (MANDATORY):
   - Every subject (character, vehicle, object, creature) MUST be shown in a completely different state compared to the first frame.
   - Characters: different pose, shifted weight, turned head/body, changed expression, moved to a new position.
   - Vehicles/objects: relocated, rotated, in a new configuration.
   - If the shot describes an action (walking, running, turning, reaching), show the RESULT of that completed action, NOT the action in progress.

2. CAMERA & COMPOSITION:
   - Apply the full camera movement described in the shot prompt. If the shot says "pan left", the last frame should show the scene from the panned-left perspective.
   - Framing, angle, and field of view must reflect the END position of any described camera move.
   - Background elements should shift consistently with the camera movement.

3. NARRATIVE PROGRESSION:
   - This frame is the visual conclusion of the shot. It must feel like a distinct moment in time from the first frame.
   - Lighting, shadows, and atmospheric conditions may shift to reflect elapsed time or mood progression.
   - Do NOT simply re-describe the first frame with minor tweaks. The last frame must be unmistakably different.
`;
  }

  prompt += `\nThe following is the scene description for this frame:\n${basePrompt}`;
  prompt += `\n\nCRITICAL: Output a clean photographic or cinematic image only. Do NOT add any text, captions, titles, labels, shot numbers, watermarks, or overlaid annotations of any kind to the image.`;
  return prompt;
}

/**
 * Builds a minimal prompt for standalone (non-storyboard) image generation.
 * No shot context, no frame-type constraints — just the user's request.
 */
export function buildStandalonePrompt(
  prompt: string,
  referenceImages: ReferenceImage[],
  aspectRatio: string,
): string {
  let p = `Generate a ${aspectRatio} image.\n\n${prompt}`;
  if (referenceImages.length > 0) {
    p += `\n\nYou are provided with ${referenceImages.length} reference image(s):\n`;
    referenceImages.forEach((_, i) => {
      p += `- Image ${i + 1} is a reference image.\n`;
    });
  }
  return p;
}
