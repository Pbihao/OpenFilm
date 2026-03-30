/**
 * Material — a single image asset in the material library.
 *
 * URL semantics:
 *   blob:...         displayUrl only — session-scoped, never persist, never send to API
 *   /api/local-data  displayUrl + persist in localStorage — dev-server local path
 *   https://         displayUrl + persist + send to fal.ai API
 *
 * Two roles:
 *   displayUrl — what the UI renders (any of the three types above)
 *   apiUrl     — what goes to fal.ai (https:// only; undefined until uploaded)
 */
export interface Material {
  id: string;           // stable UUID — used as dedup key
  displayUrl: string;   // blob:, /api/local-data, or https:// — for rendering
  apiUrl?: string;      // https:// only — for fal.ai API calls
  file?: File;          // only present for newly added local files (not restored from storage)
  name: string;
  addedAt: number;
}
