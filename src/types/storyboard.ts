/**
 * Storyboard types for multi-shot video generation
 */

export type ShotStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type FrameStatus = 'idle' | 'generating' | 'completed' | 'failed';

export interface StoryboardShot {
  id: string;
  index: number;
  prompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
  firstFrameUrl?: string;          // display URL (/api/local-data or https://)
  firstFrameRefUrl?: string;       // API URL (https:// only, sent to fal.ai)
  extractedLastFrameUrl?: string;  // display URL (/api/local-data or https://)
  lastFrameRefUrl?: string;        // API URL (https:// only, sent to fal.ai)
  videoUrl?: string;
  thumbnailUrl?: string;
  status: ShotStatus;
  firstFrameStatus: FrameStatus;
  lastFrameStatus: FrameStatus;
  duration?: number;
  error?: string;
  trimStart?: number;
  trimEnd?: number;
}

export interface StoryboardConfig {
  frameModelId: string;
  videoModelId: string;
  duration: number;
  aspectRatio: string;
  referenceImageUrls: string[];
  withAudio?: boolean;
  shotCount?: number;
}
