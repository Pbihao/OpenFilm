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
const COMPACT_KEEP = 60;
const MAX_MESSAGES = 80;

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

export function compactMessages(
  messages: AgentMessage[],
  maxKeep = MAX_MESSAGES,
): { messages: AgentMessage[]; summary: string | null } {
  if (messages.length <= maxKeep) return { messages, summary: null };

  const toDiscard = messages.slice(0, messages.length - COMPACT_KEEP);
  const kept = messages.slice(-COMPACT_KEEP);

  const keyPoints: string[] = [];
  for (const m of toDiscard) {
    if (m.role === 'user' && m.content) keyPoints.push(`User: ${m.content.slice(0, 100)}`);
    if (m.role === 'assistant' && m.content && !m.isLoading) keyPoints.push(`Assistant: ${m.content.slice(0, 150)}`);
    if (m.role === 'assistant' && m.tool_calls) {
      const toolNames = m.tool_calls.map(tc => tc.function.name).join(', ');
      keyPoints.push(`Tools: ${toolNames}`);
    }
    if (m.role === 'tool' && m.content) {
      try {
        const parsed = JSON.parse(m.content);
        keyPoints.push(`Result: ${parsed.success ? 'OK' : 'FAIL'}${parsed.error ? ` (${parsed.error.slice(0, 80)})` : ''}`);
      } catch { /* skip */ }
    }
  }

  const summary = keyPoints.length > 0 ? keyPoints.slice(-15).join('\n') : null;
  return { messages: kept, summary };
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
