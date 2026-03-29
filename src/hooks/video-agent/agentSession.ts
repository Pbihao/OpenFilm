/**
 * Video Agent — Session persistence (localStorage)
 */

import type { AgentMessage } from '@/types/video-agent';
import type { StoryboardShot, StoryboardConfig } from '@/types/storyboard';

export const DEFAULT_CONFIG: StoryboardConfig = {
  frameModelId: 'fal-ai/nano-banana-2',
  videoModelId: 'fal-ai/veo3.1',
  duration: 4,
  aspectRatio: '16:9',
  referenceImageUrls: [],
  withAudio: false,
  shotCount: 3,
};

export function createShot(index: number, overrides: Partial<StoryboardShot> = {}): StoryboardShot {
  return {
    id: crypto.randomUUID(),
    index,
    prompt: '',
    firstFramePrompt: '',
    lastFramePrompt: '',
    status: 'idle',
    firstFrameStatus: 'idle',
    lastFrameStatus: 'idle',
    ...overrides,
  };
}

const STORAGE_KEY = 'video-agent-session';

// ─── Context compression ───────────────────────────────────────────────────────

const KEEP_RECENT = 10; // always preserve last N messages intact

/**
 * Splits messages into the recent window (kept as-is) and the older segment
 * that should be compressed into a summary.
 */
export function splitMessagesForCompaction(messages: AgentMessage[]): {
  toKeep: AgentMessage[];
  toSummarize: AgentMessage[];
} {
  if (messages.length <= KEEP_RECENT) return { toKeep: messages, toSummarize: [] };
  return {
    toSummarize: messages.slice(0, -KEEP_RECENT),
    toKeep: messages.slice(-KEEP_RECENT),
  };
}

/**
 * Builds a heuristic summary from messages without an LLM call.
 * Used as an immediate fallback before the async LLM summary arrives.
 */
export function buildHeuristicSummary(messages: AgentMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    if (m.role === 'user' && m.content)
      lines.push(`User: ${m.content.slice(0, 200)}`);
    else if (m.role === 'assistant' && m.content && !m.isLoading)
      lines.push(`Assistant: ${m.content.slice(0, 300)}`);
    // tool messages are noise — skip them
  }
  return lines.slice(-20).join('\n').slice(0, 3000);
}

/**
 * Calls the LLM to produce a concise narrative summary of the given messages.
 * Should be called in the background — falls back to heuristic if it fails.
 */
export async function summarizeWithLLM(
  messages: AgentMessage[],
  apiKey: string,
  model: string,
): Promise<string> {
  const transcript = messages
    .filter(m => (m.role === 'user' && m.content) || (m.role === 'assistant' && m.content))
    .map(m => {
      if (m.role === 'user') return `User: ${m.content}`;
      const toolNames = m.tool_calls?.map(tc => tc.function.name).join(', ');
      return `Assistant: ${m.content}${toolNames ? ` [tools used: ${toolNames}]` : ''}`;
    })
    .join('\n');

  if (!transcript.trim()) return '';

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{
        role: 'user',
        content: `You are summarizing a video creation session for an AI agent to use as context. Write 3-6 concise sentences preserving: the story concept, visual style, shot descriptions, and any user corrections or preferences. Omit tool execution details.\n\nConversation:\n${transcript}`,
      }],
      max_tokens: 600,
      stream: false,
    }),
  });
  if (!resp.ok) throw new Error(`Summarization API error ${resp.status}`);
  const data = await resp.json();
  return data.choices?.[0]?.message?.content?.trim() ?? '';
}

export interface PersistedSession {
  id: string;
  sessionFolder: string;
  messages: AgentMessage[];
  shots: StoryboardShot[];
  config: StoryboardConfig;
  storySummary: string;
  conversationSummary?: string;
  savedAt: number;
}

/** @deprecated Use splitMessagesForCompaction + buildHeuristicSummary directly */
export function compactMessages(
  messages: AgentMessage[],
): { messages: AgentMessage[]; summary: string | null } {
  const { toKeep, toSummarize } = splitMessagesForCompaction(messages);
  if (toSummarize.length === 0) return { messages, summary: null };
  const summary = buildHeuristicSummary(toSummarize);
  return { messages: toKeep, summary: summary || null };
}

export function saveSession(session: PersistedSession) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch { /* quota exceeded */ }
}

export function loadSession(): PersistedSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as PersistedSession;
    session.config = { ...DEFAULT_CONFIG, ...session.config };
    return session;
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  localStorage.removeItem(STORAGE_KEY);
}
