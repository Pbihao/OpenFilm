/**
 * OpenRouter direct client — SSE streaming + non-streaming
 */

import { loadConfig } from '@/config';

export async function openrouterChat(body: Record<string, unknown>): Promise<Response> {
  const config = loadConfig();
  if (!config.openrouterApiKey) throw new Error('OpenRouter API key not configured');

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.openrouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://video-agent.local',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenRouter error ${resp.status}: ${errText.slice(0, 300)}`);
  }

  return resp;
}

export async function openrouterChatJson(body: Record<string, unknown>): Promise<any> {
  const resp = await openrouterChat({ ...body, stream: false });
  return resp.json();
}
