/**
 * In-memory video blob cache — avoids redundant downloads during export and playback.
 *
 * getBlobUrl() is the primary entry point: fetches once, returns a persistent
 * blob URL reused by the hover player, the dialog, and the trim thumbnail generator.
 * Because blob URLs have no origin, there are no CORS cache-split issues.
 */
const cache = new Map<string, Blob>();
const blobUrlMap = new Map<string, string>(); // cdnUrl → persistent blob URL

export function getVideoBlob(url: string): Blob | undefined {
  return cache.get(url);
}

export function setVideoBlob(url: string, blob: Blob): void {
  cache.set(url, blob);
}

export async function prefetchAndCache(url: string): Promise<void> {
  if (cache.has(url)) return;
  try {
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    cache.set(url, blob);
  } catch {}
}

/**
 * Returns a persistent blob URL for the given CDN URL.
 * Downloads once, caches the blob and the resulting blob URL.
 * Falls back to the original URL on fetch failure.
 */
export async function getBlobUrl(url: string): Promise<string> {
  if (blobUrlMap.has(url)) return blobUrlMap.get(url)!;
  await prefetchAndCache(url);
  const blob = cache.get(url);
  if (!blob) return url; // fallback
  const blobUrl = URL.createObjectURL(blob);
  blobUrlMap.set(url, blobUrl);
  return blobUrl;
}

export function clearVideoCache(): void {
  for (const blobUrl of blobUrlMap.values()) URL.revokeObjectURL(blobUrl);
  blobUrlMap.clear();
  cache.clear();
}
