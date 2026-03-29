/**
 * Video model capabilities (static — no DB dependency)
 */

export interface VideoModelCapabilities {
  supportedDurations: number[];
  supportsAudio: boolean;
  supportsFirstLastFrame: boolean;
  maxResolution: '720p' | '1080p';
  supportedAspectRatios: string[];
  defaultAspectRatio: string;
  i2vSupportedAspectRatios?: string[];
  i2vDefaultAspectRatio?: string;
}

export const VIDEO_MODEL_CAPABILITIES: Record<string, VideoModelCapabilities> = {
  'fal-ai/veo3.1': {
    supportedDurations: [4, 6, 8],
    supportsAudio: true,
    supportsFirstLastFrame: true,
    maxResolution: '1080p',
    supportedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    i2vSupportedAspectRatios: ['auto', '16:9', '9:16'],
    i2vDefaultAspectRatio: 'auto',
  },
  'fal-ai/veo3.1/fast': {
    supportedDurations: [4, 6, 8],
    supportsAudio: true,
    supportsFirstLastFrame: true,
    maxResolution: '1080p',
    supportedAspectRatios: ['16:9', '9:16'],
    defaultAspectRatio: '16:9',
    i2vSupportedAspectRatios: ['auto', '16:9', '9:16'],
    i2vDefaultAspectRatio: 'auto',
  },
  'fal-ai/kling-video/v2.6/pro': {
    supportedDurations: [5, 10],
    supportsAudio: true,
    supportsFirstLastFrame: true,
    maxResolution: '1080p',
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    defaultAspectRatio: '16:9',
  },
  'fal-ai/kling-video/v3/pro': {
    supportedDurations: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
    supportsAudio: true,
    supportsFirstLastFrame: true,
    maxResolution: '1080p',
    supportedAspectRatios: ['16:9', '9:16', '1:1'],
    defaultAspectRatio: '16:9',
  },
  'fal-ai/bytedance/seedance/v1.5/pro': {
    supportedDurations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportsAudio: true,
    supportsFirstLastFrame: true,
    maxResolution: '1080p',
    supportedAspectRatios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    defaultAspectRatio: 'auto',
    i2vSupportedAspectRatios: ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'],
    i2vDefaultAspectRatio: 'auto',
  },
};

/** All video models that support first+last frame (for storyboard) */
export const STORYBOARD_VIDEO_MODELS = Object.entries(VIDEO_MODEL_CAPABILITIES)
  .filter(([, caps]) => caps.supportsFirstLastFrame)
  .map(([id]) => id);

// ============= Video endpoint + request body config =============

export interface VideoEndpointParams {
  prompt: string;
  aspectRatio: string;
  duration: number;
  withAudio?: boolean;
  imageUrl?: string;
  endFrameUrl?: string;
  isI2V: boolean;
}

export interface VideoEndpointConfig {
  baseEndpoint: string;
  textToVideoPath: string;
  imageToVideoPath: string;
  firstLastFrameToVideoPath?: string;
  /** Model-level fixed parameters (resolution, quality presets, etc.) — merged by caller */
  staticParams?: Record<string, unknown>;
  buildBody: (p: VideoEndpointParams) => Record<string, unknown>;
}

export const VIDEO_MODEL_ENDPOINTS: Record<string, VideoEndpointConfig> = {
  'fal-ai/veo3.1': {
    baseEndpoint: 'fal-ai/veo3.1',
    textToVideoPath: '',
    imageToVideoPath: 'image-to-video',
    firstLastFrameToVideoPath: 'first-last-frame-to-video',
    // auto_fix omitted here — docs default is true for t2v/i2v but false for first-last-frame
    staticParams: { resolution: '1080p', safety_tolerance: '6' },
    buildBody: (p) => ({
      prompt: p.prompt,
      duration: `${p.duration}s`,
      aspect_ratio: p.aspectRatio || '16:9',
      generate_audio: p.withAudio ?? false,
      ...(p.endFrameUrl
        ? { first_frame_url: p.imageUrl, last_frame_url: p.endFrameUrl }
        : { auto_fix: true, ...(p.imageUrl ? { image_url: p.imageUrl } : {}) }),
    }),
  },
  'fal-ai/veo3.1/fast': {
    baseEndpoint: 'fal-ai/veo3.1/fast',
    textToVideoPath: '',
    imageToVideoPath: 'image-to-video',
    firstLastFrameToVideoPath: 'first-last-frame-to-video',
    staticParams: { resolution: '1080p', safety_tolerance: '6' },
    buildBody: (p) => ({
      prompt: p.prompt,
      duration: `${p.duration}s`,
      generate_audio: p.withAudio ?? false,
      ...(p.aspectRatio && { aspect_ratio: p.aspectRatio }),
      ...(p.endFrameUrl
        ? { first_frame_url: p.imageUrl, last_frame_url: p.endFrameUrl }
        : { auto_fix: true, ...(p.imageUrl ? { image_url: p.imageUrl } : {}) }),
    }),
  },
  'fal-ai/kling-video/v2.6/pro': {
    baseEndpoint: 'fal-ai/kling-video/v2.6/pro',
    textToVideoPath: 'text-to-video',
    imageToVideoPath: 'image-to-video',
    buildBody: (p) => ({
      prompt: p.prompt,
      duration: `${p.duration}`,
      generate_audio: p.withAudio ?? false,
      ...(!p.isI2V && { aspect_ratio: p.aspectRatio }),
      ...(p.imageUrl && { start_image_url: p.imageUrl }),
      ...(p.endFrameUrl && { end_image_url: p.endFrameUrl }),
    }),
  },
  'fal-ai/kling-video/v3/pro': {
    baseEndpoint: 'fal-ai/kling-video/v3/pro',
    textToVideoPath: 'text-to-video',
    imageToVideoPath: 'image-to-video',
    staticParams: { negative_prompt: 'blur, distort, and low quality', cfg_scale: 0.5 },
    buildBody: (p) => ({
      prompt: p.prompt,
      duration: `${p.duration}`,
      generate_audio: p.withAudio ?? true,
      ...(!p.isI2V && { aspect_ratio: p.aspectRatio || '16:9' }),
      ...(p.imageUrl && { start_image_url: p.imageUrl }),
      ...(p.endFrameUrl && { end_image_url: p.endFrameUrl }),
    }),
  },
  'fal-ai/kling-video/v3/standard': {
    baseEndpoint: 'fal-ai/kling-video/v3/standard',
    textToVideoPath: 'text-to-video',
    imageToVideoPath: 'image-to-video',
    staticParams: { negative_prompt: 'blur, distort, and low quality', cfg_scale: 0.5 },
    buildBody: (p) => ({
      prompt: p.prompt,
      duration: `${p.duration}`,
      generate_audio: p.withAudio ?? true,
      ...(!p.isI2V && { aspect_ratio: p.aspectRatio || '16:9' }),
      ...(p.imageUrl && { start_image_url: p.imageUrl }),
      ...(p.endFrameUrl && { end_image_url: p.endFrameUrl }),
    }),
  },
  'fal-ai/bytedance/seedance/v1.5/pro': {
    baseEndpoint: 'fal-ai/bytedance/seedance/v1.5/pro',
    textToVideoPath: 'text-to-video',
    imageToVideoPath: 'image-to-video',
    staticParams: { resolution: '720p' },
    buildBody: (p) => ({
      prompt: p.prompt,
      duration: `${p.duration}`,
      ...(p.aspectRatio && p.aspectRatio !== 'auto' && { aspect_ratio: p.aspectRatio }),
      generate_audio: p.withAudio ?? true,
      ...(p.imageUrl && { image_url: p.imageUrl }),
      ...(p.endFrameUrl && { end_image_url: p.endFrameUrl }),
    }),
  },
};

/**
 * Resolve the fal.ai endpoint for a video model based on available frames.
 * Returns the full endpoint path used for both submit and poll.
 * Returns null if the model is not configured.
 */
export function resolveVideoEndpoint(
  modelId: string,
  hasFirstFrame: boolean,
  hasLastFrame: boolean,
): string | null {
  const config = VIDEO_MODEL_ENDPOINTS[modelId];
  if (!config) return null;

  let modePath: string;
  if (hasFirstFrame && hasLastFrame && config.firstLastFrameToVideoPath) {
    modePath = config.firstLastFrameToVideoPath;
  } else if (hasFirstFrame) {
    modePath = config.imageToVideoPath;
  } else {
    modePath = config.textToVideoPath;
  }

  return modePath ? `${config.baseEndpoint}/${modePath}` : config.baseEndpoint;
}
