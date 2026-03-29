/**
 * Image upload — upload to fal.ai storage or use data URLs
 */

import { falUploadFile } from './fal';

/**
 * Upload image file to fal.ai temporary storage.
 * Returns a publicly accessible URL.
 */
export async function uploadImage(file: File): Promise<string> {
  return falUploadFile(file);
}

/**
 * Convert data URL to a File object and upload
 */
export async function uploadDataUrl(dataUrl: string, filename = 'image.png'): Promise<string> {
  const resp = await fetch(dataUrl);
  const blob = await resp.blob();
  const file = new File([blob], filename, { type: blob.type });
  return falUploadFile(file);
}
