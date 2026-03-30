/**
 * URL utilities — centralizes the "is this URL usable by external services?" logic.
 *
 * Three URL categories exist in this app:
 *   blob:             — temporary object URL, browser-local only
 *   /api/local-data/  — served by local dev server, not reachable by fal.ai/OpenRouter
 *   https://          — public CDN (fal.ai, etc.), reachable by all external APIs
 *
 * Only https:// URLs can be sent to fal.ai or OpenRouter. All checks go through
 * isPublicUrl() so that changing this rule only requires editing one place.
 */

import type { ReferenceEntry, CachedAsset } from '@/types/storyboard';

/** True if the URL can be fetched by external services (fal.ai, OpenRouter, etc.) */
export function isPublicUrl(url: string | undefined): url is string {
  return typeof url === 'string' && url.startsWith('https://');
}

/**
 * Returns the display URL for a CachedAsset: local cache if available, otherwise remote CDN.
 */
export function assetDisplayUrl(asset: CachedAsset | undefined): string | undefined {
  return asset ? (asset.localUrl ?? asset.remoteUrl) : undefined;
}

/**
 * Creates a CachedAsset from a CDN URL (no local cache yet).
 * Use this when assigning an image that came directly from an external source.
 */
export function makeRefAsset(remoteUrl: string): CachedAsset {
  return { remoteUrl };
}

/**
 * Builds a ReferenceEntry from a display URL (always set) and optional explicit API URL.
 * If apiUrl is omitted, it is inferred from displayUrl — set only when displayUrl is public.
 */
export function makeRefEntry(displayUrl: string, apiUrl?: string): ReferenceEntry {
  return {
    displayUrl,
    apiUrl: apiUrl !== undefined ? apiUrl : (isPublicUrl(displayUrl) ? displayUrl : undefined),
  };
}
