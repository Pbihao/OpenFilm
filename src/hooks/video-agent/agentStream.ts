/**
 * Video Agent — SSE streaming via OpenRouter direct + context window management
 */

import { loadConfig } from '@/config';
import { SYSTEM_PROMPT } from '@/edge-logic/systemPrompt';
import { AGENT_TOOLS } from '@/edge-logic/agentToolDefs';
import type { ToolCall, StreamResult } from '@/types/video-agent';
import type { StoryBible } from '@/types/storyboard';

// ============= Context Window Management =============

const MAX_CONTEXT_TOKENS = 20000;

function estimateTokens(text: string): number {
  // ~4 chars per token is the standard GPT approximation
  return Math.ceil(text.length / 4);
}

export function trimMessagesForContext(msgs: Record<string, unknown>[], reservedTokens = 0): Record<string, unknown>[] {
  if (msgs.length === 0) return msgs;

  const budget = MAX_CONTEXT_TOKENS - reservedTokens;
  let totalTokens = 0;
  const result: Record<string, unknown>[] = [];

  for (let i = msgs.length - 1; i >= 0; i--) {
    const msg = msgs[i];
    let content: string;
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      content = (msg.content as Record<string, unknown>[])
        .filter((p) => p.type === 'text')
        .map((p) => String(p.text || ''))
        .join(' ');
    } else {
      content = JSON.stringify(msg.content || '');
    }
    const tokens = estimateTokens(content);
    if (totalTokens + tokens > budget && result.length > 0) break;
    totalTokens += tokens;
    result.unshift(msg);
  }

  // Ensure tool_call/tool_result pairing integrity
  const toolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const m of result) {
    if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
      for (const tc of m.tool_calls as { id: string }[]) toolCallIds.add(tc.id);
    }
    if (m.role === 'tool' && typeof m.tool_call_id === 'string') toolResultIds.add(m.tool_call_id);
  }

  return result
    .filter(m => m.role !== 'tool' || toolCallIds.has(m.tool_call_id as string))
    .map(m => {
      if (m.role === 'assistant' && Array.isArray(m.tool_calls)) {
        const validCalls = (m.tool_calls as { id: string }[]).filter(tc => toolResultIds.has(tc.id));
        if (validCalls.length === 0) {
          const { tool_calls, ...rest } = m;
          return rest;
        }
        if (validCalls.length !== (m.tool_calls as unknown[]).length) {
          return { ...m, tool_calls: validCalls };
        }
      }
      return m;
    });
}

// ============= SSE Streaming (Direct OpenRouter) =============

export async function streamAgentResponse(
  body: {
    messages: Record<string, unknown>[];
    shots_context: unknown;
    story_bible?: StoryBible | null;
    user_config: { shot_count: number; aspect_ratio: string };
    enable_thinking?: boolean;
  },
  onDelta: (text: string) => void,
  onThinking: (text: string) => void,
  enableThinking: boolean,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const config = loadConfig();
  if (!config.openrouterApiKey) throw new Error('OpenRouter API key not configured. Go to Settings.');

  // Build system message text
  let systemText = SYSTEM_PROMPT;

  if (body.story_bible) {
    systemText += `\n\n## Story Bible\nNarrative: ${body.story_bible.narrative}\nSubjects: ${body.story_bible.subjects}`;
  }

  const shots = (body.shots_context as any[]) ?? [];
  if (shots.length > 0) {
    // Strip internal URL fields not needed in the JSON context
    const shotsForJson = shots.map(({ firstFrameRemoteUrl: _a, lastFrameRemoteUrl: _b, ...rest }: any) => rest);
    systemText += `\n\n## Current Storyboard\n\`\`\`json\n${JSON.stringify(shotsForJson, null, 2)}\n\`\`\``;
  }

  systemText += `\n\nUser config: shot_count=${body.user_config.shot_count}, aspect_ratio=${body.user_config.aspect_ratio}`;

  const apiMessages = [
    { role: 'system', content: systemText },
    ...body.messages,
  ];

  const apiBody: Record<string, unknown> = {
    model: config.agentModel,
    messages: apiMessages,
    tools: AGENT_TOOLS,
    stream: true,
    max_tokens: 4096,
  };

  if (enableThinking) {
    apiBody.reasoning = { effort: 'medium' };
  }

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://video-agent.local',
    },
    body: JSON.stringify(apiBody),
    signal,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  const reader = resp.body?.getReader();
  if (!reader) throw new Error('No response stream');

  const decoder = new TextDecoder();
  let buffer = '';
  let content = '';
  let thinking = '';
  let toolCalls: ToolCall[] | undefined;

  // Track incremental tool call assembly
  const toolCallMap = new Map<number, { id: string; type: 'function'; function: { name: string; arguments: string } }>();

  const STREAM_TIMEOUT_MS = 60_000;

  // Single timeout for the whole stream — avoids creating a new Promise per chunk
  let streamFinished = false;
  const timeoutId = setTimeout(() => {
    if (!streamFinished) reader.cancel(new Error('AI response timeout, please retry'));
  }, STREAM_TIMEOUT_MS);
  if (signal) signal.addEventListener('abort', () => clearTimeout(timeoutId), { once: true });

  try {
    while (true) {
      if (signal?.aborted) break;

      const chunk = await reader.read();
      if (chunk.done) break;

      buffer += decoder.decode(chunk.value, { stream: true });

      let newlineIdx: number;
      let gotDone = false;
      while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line.startsWith('data: ')) continue;

        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') { gotDone = true; break; }

        try {
          const parsed = JSON.parse(jsonStr);

          const reasoningDelta = parsed.choices?.[0]?.delta?.reasoning;
          if (enableThinking && reasoningDelta) {
            thinking += reasoningDelta;
            onThinking(reasoningDelta);
          }

          const contentDelta = parsed.choices?.[0]?.delta?.content;
          if (contentDelta) {
            content += contentDelta;
            onDelta(contentDelta);
          }

          // Assemble tool calls incrementally from deltas
          const tcDelta = parsed.choices?.[0]?.delta?.tool_calls;
          if (Array.isArray(tcDelta)) {
            for (const tc of tcDelta) {
              const idx = tc.index ?? 0;
              if (!toolCallMap.has(idx)) {
                toolCallMap.set(idx, {
                  id: tc.id || `tc_${idx}`,
                  type: 'function',
                  function: { name: tc.function?.name || '', arguments: '' },
                });
              }
              const entry = toolCallMap.get(idx)!;
              if (tc.id) entry.id = tc.id;
              if (tc.function?.name) entry.function.name = tc.function.name;
              if (tc.function?.arguments) entry.function.arguments += tc.function.arguments;
            }
          }
        } catch {
          continue;
        }
      }
      if (gotDone) break;
    }
  } finally {
    streamFinished = true;
    clearTimeout(timeoutId);
  }

  // Convert assembled tool calls — filter out entries that were never fully assembled (aborted mid-stream)
  if (toolCallMap.size > 0) {
    toolCalls = Array.from(toolCallMap.values()).filter(tc => {
      if (!tc.function.name) return false;
      try { JSON.parse(tc.function.arguments || '{}'); return true; } catch { return false; }
    });
    if (toolCalls.length === 0) toolCalls = undefined;
  }

  return { content, thinking, tool_calls: toolCalls };
}
