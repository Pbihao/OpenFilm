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
  firstFrameUrl?: string;
  firstFrameRefUrl?: string;       // original CDN URL — always accessible to fal.ai (used as reference)
  extractedLastFrameUrl?: string;
  lastFrameRefUrl?: string;        // original CDN URL for last frame
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
