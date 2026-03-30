/**
 * Storyboard types for multi-shot video generation
 */

export type ShotStatus = 'idle' | 'generating' | 'completed' | 'failed';
export type FrameStatus = 'idle' | 'generating' | 'completed' | 'failed';

/**
 * A generated frame or video asset with two URL tiers:
 *   remoteUrl — canonical CDN URL (always set); use this for external API calls
 *   localUrl  — locally cached copy (/api/local-data/...); use this for display if present
 *
 * Display: asset.localUrl ?? asset.remoteUrl
 * API:     asset.remoteUrl  (no fallback needed — always public)
 */
export interface CachedAsset {
  remoteUrl: string;   // CDN URL — source of truth for fal.ai / OpenRouter API calls
  localUrl?: string;   // optional local cache — preferred for display to survive CDN expiry
}

export interface StoryboardShot {
  id: string;
  index: number;
  prompt: string;
  firstFramePrompt: string;
  lastFramePrompt: string;
  firstFrame?: CachedAsset;
  lastFrame?: CachedAsset;
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

export interface ReferenceEntry {
  displayUrl: string;   // local/blob/https — for UI rendering
  apiUrl?: string;      // https:// only — for fal.ai API
}

export interface StoryboardConfig {
  frameModelId: string;
  videoModelId: string;
  duration: number;
  aspectRatio: string;
  referenceImageUrls: ReferenceEntry[];
  withAudio?: boolean;
  shotCount?: number;
}
