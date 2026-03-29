/**
 * fal.ai client — queue submission, polling, and file upload.
 *
 * Public API:
 *   falQueue(endpoint, body, options?)  — submit + poll a generation job
 *   falUploadFile(file, persist?)       — upload a file to fal.ai storage
 *
 * Queue flow (per fal.ai docs):
 *   POST  https://queue.fal.run/{endpoint}          → { status_url, response_url, ... }
 *   GET   {status_url}                              → { status: IN_QUEUE | IN_PROGRESS | COMPLETED | FAILED }
 *   GET   {response_url}                            → model result
 *
 * status_url and response_url from the submit response are used directly —
 * no manual URL construction after submit.
 */

import { loadConfig } from '@/config';

const FAL_BASE = 'https://queue.fal.run';

// ─── Internal helpers ──────────────────────────────────────────────────────

function getAuthHeader(): string {
  const { falApiKey } = loadConfig();
  if (!falApiKey) throw new Error('fal.ai API key not configured');
  return `Key ${falApiKey}`;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }, { once: true });
  });
}

interface FalSubmitResponse {
  request_id: string;
  /** Full status poll URL, e.g. https://queue.fal.run/{endpoint}/requests/{id}/status */
  status_url: string;
  /** Full result fetch URL, e.g. https://queue.fal.run/{endpoint}/requests/{id}/response */
  response_url: string;
  cancel_url: string;
  queue_position?: number;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  request_id: string;
  error?: string | null;
}

async function submitJob(endpoint: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<FalSubmitResponse> {
  const resp = await fetch(`${FAL_BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': getAuthHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`fal.ai submit [${endpoint}] ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

async function pollStatus(statusUrl: string, signal?: AbortSignal): Promise<FalStatusResponse> {
  const resp = await fetch(statusUrl, {
    headers: { 'Authorization': getAuthHeader() },
    signal,
  });
  if (!resp.ok) throw new Error(`fal.ai status ${resp.status} (${statusUrl})`);
  return resp.json();
}

async function fetchResult(responseUrl: string, signal?: AbortSignal): Promise<unknown> {
  const resp = await fetch(responseUrl, {
    headers: { 'Authorization': getAuthHeader() },
    signal,
  });
  if (!resp.ok) throw new Error(`fal.ai result ${resp.status} (${responseUrl})`);
  return resp.json();
}

async function runOnce(
  endpoint: string,
  body: Record<string, unknown>,
  signal: AbortSignal | undefined,
  pollIntervalMs: number,
  timeoutMs: number,
): Promise<unknown> {
  // fal.ai returns pre-built status_url and response_url — use them directly
  const { status_url, response_url } = await submitJob(endpoint, body, signal);
  const startTime = Date.now();

  // Transient network errors (ERR_TUNNEL_CONNECTION_FAILED etc.) should retry the poll
  // step in-place, NOT restart the whole job. A fresh submission would discard the
  // already-running job on fal.ai's side and waste credits.
  let pollErrors = 0;
  const MAX_POLL_ERRORS = 4;

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (Date.now() - startTime > timeoutMs) throw new Error(`fal.ai timeout [${endpoint}]`);

    await sleep(pollIntervalMs, signal);
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

    let status: FalStatusResponse;
    try {
      status = await pollStatus(status_url, signal);
      pollErrors = 0; // reset on success
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (++pollErrors >= MAX_POLL_ERRORS) throw err; // give up after too many consecutive failures
      continue; // transient network error — retry poll without resubmitting
    }

    if (status.status === 'COMPLETED') {
      // Always use response_url from the submit response — it has the correct /response suffix.
      // The status poll response also returns a response_url but it is the bare request URL
      // (without /response), which returns 422 when fetched.
      // Retry on transient network errors — the job is done, we just need to retrieve the result.
      let fetchErrors = 0;
      const MAX_FETCH_ERRORS = 3;
      while (true) {
        try {
          return await fetchResult(response_url, signal);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          if (++fetchErrors >= MAX_FETCH_ERRORS) throw err;
          await sleep(2_000, signal);
        }
      }
    }
    if (status.status === 'FAILED') {
      throw new Error(status.error || `fal.ai generation failed [${endpoint}]`);
    }
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

export interface FalQueueOptions {
  signal?: AbortSignal;
  /** Polling interval in ms. Default: 3000 */
  pollIntervalMs?: number;
  /** Per-attempt timeout in ms. Default: 360 000 (6 min) */
  timeoutMs?: number;
  /** Retries on transient failure. Default: 2 (3 total attempts) */
  maxRetries?: number;
}

/**
 * Submit a job to fal.ai queue and poll until completion.
 * The same endpoint is used for submit, status, and result — fal.ai scopes
 * request IDs by the exact endpoint path.
 */
export async function falQueue(
  endpoint: string,
  body: Record<string, unknown>,
  options: FalQueueOptions = {},
): Promise<unknown> {
  const { signal, pollIntervalMs = 3000, timeoutMs = 360_000, maxRetries = 2 } = options;
  let attempt = 0;
  while (true) {
    try {
      return await runOnce(endpoint, body, signal, pollIntervalMs, timeoutMs);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') throw err;
      if (attempt >= maxRetries) throw err;
      attempt++;
      await sleep(2_000 * attempt, signal);
    }
  }
}

/**
 * Upload a file to fal.ai storage and return the URL.
 * @param persist - Keep the file permanently (default: false, expires ~7 days).
 */
export async function falUploadFile(file: File, persist = false): Promise<string> {
  const { falApiKey } = loadConfig();
  if (!falApiKey) throw new Error('fal.ai API key not configured');

  const initHeaders: Record<string, string> = {
    'Authorization': `Key ${falApiKey}`,
    'Content-Type': 'application/json',
  };
  if (persist) {
    initHeaders['X-Fal-Object-Lifecycle-Preference'] = JSON.stringify({ expiration_duration_seconds: null });
  }

  const initResp = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
    method: 'POST',
    headers: initHeaders,
    body: JSON.stringify({ file_name: file.name, content_type: file.type || 'image/png' }),
  });
  if (!initResp.ok) throw new Error('Failed to initiate fal.ai upload');
  const { upload_url, file_url } = await initResp.json();

  const putResp = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': file.type || 'image/png' },
    body: file,
  });
  if (!putResp.ok) throw new Error(`fal.ai upload failed: ${putResp.status}`);

  return file_url as string;
}
