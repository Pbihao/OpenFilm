/**
 * Video Agent — Core orchestration hook (standalone, no Supabase)
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from 'sonner';
import type { StoryboardShot, StoryboardConfig, ShotStatus, FrameStatus } from '@/types/storyboard';
import type { AgentMessage, ToolCall, SuggestedAction } from '@/types/video-agent';
import { EXPENSIVE_TOOLS } from '@/types/video-agent';
import { VIDEO_MODEL_CAPABILITIES, STORYBOARD_VIDEO_MODELS } from '@/types/video-generation';
import { writeSessionFile, makeSessionFolder } from '@/lib/localFs';
import { clearVideoCache } from '@/lib/videoBlobCache';
import { falUploadFile } from '@/lib/fal';
import { loadConfig } from '@/config';

import { DEFAULT_CONFIG, createShot, saveSession, loadSession, clearStoredSession, compactMessages } from './agentSession';
import { streamAgentResponse, trimMessagesForContext } from './agentStream';
import { executeTool, type ToolContext } from './agentTools';

export type { AgentMessage } from '@/types/video-agent';

// Hardcoded frame model list (no DB)
const FRAME_MODELS = [
  { id: 'fal-ai/nano-banana-2', name: 'Nano Banana 2' },
  { id: 'fal-ai/nano-banana-pro', name: 'Nano Banana Pro' },
];

const VIDEO_MODEL_DISPLAY_NAMES: Record<string, string> = {
  'fal-ai/veo3.1':                      'Veo 3.1',
  'fal-ai/veo3.1/fast':                 'Veo 3.1 Fast',
  'fal-ai/kling-video/v2.6/pro':        'Kling v2.6 Pro',
  'fal-ai/kling-video/v3/pro':          'Kling v3 Pro',
  'fal-ai/kling-video/v3/standard':     'Kling v3 Standard',
  'fal-ai/bytedance/seedance/v1.5/pro': 'Seedance v1.5 Pro',
};

const VIDEO_MODELS = STORYBOARD_VIDEO_MODELS.map(id => ({
  id,
  name: VIDEO_MODEL_DISPLAY_NAMES[id] ?? id,
}));

// ============= Tool round processing =============

interface ToolRoundResult {
  toolMessages: AgentMessage[];
  realToolCalls: ToolCall[];
  suggestions?: SuggestedAction[];
}

async function processToolRound(
  toolCalls: ToolCall[],
  assistantMsgId: string,
  toolCtx: ToolContext,
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>,
  pendingResolveRef: React.MutableRefObject<((v: boolean) => void) | null>,
  autoConfirm = false,
): Promise<ToolRoundResult> {
  const suggestCall = toolCalls.find(tc => tc.function.name === 'suggest_next_actions');
  const realToolCalls = toolCalls.filter(tc => tc.function.name !== 'suggest_next_actions');

  let suggestions: SuggestedAction[] | undefined;
  if (suggestCall) {
    try {
      const suggestArgs = JSON.parse(suggestCall.function.arguments);
      suggestions = suggestArgs.suggestions;
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId ? { ...m, suggestedActions: suggestions } : m
      ));
    } catch { /* ignore */ }
  }

  if (realToolCalls.length === 0) return { toolMessages: [], realToolCalls, suggestions };

  // edit_shot is conditionally expensive: only when args.regenerate is set
  const isExpensiveToolCall = (tc: ToolCall): boolean => {
    if (EXPENSIVE_TOOLS.has(tc.function.name)) return true;
    if (tc.function.name === 'edit_shot') {
      try { return !!JSON.parse(tc.function.arguments).regenerate; } catch { return false; }
    }
    return false;
  };
  const immediateCalls = realToolCalls.filter(tc => !isExpensiveToolCall(tc));
  const expensiveCalls = realToolCalls.filter(isExpensiveToolCall);

  const allResults: { tool_call_id: string; content: string }[] = [];
  for (const tc of immediateCalls) {
    allResults.push(await executeToolSafe(tc, assistantMsgId, toolCtx, setMessages));
  }

  if (expensiveCalls.length > 0) {
    let confirmed: boolean;
    if (autoConfirm) {
      confirmed = true;
    } else {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, pendingToolCalls: expensiveCalls, confirmationStatus: 'pending' as const }
          : m
      ));

      // Auto-reject after 120s to prevent permanent deadlock
      confirmed = await new Promise<boolean>(resolve => {
        pendingResolveRef.current = resolve;
        setTimeout(() => {
          if (pendingResolveRef.current === resolve) {
            resolve(false);
            pendingResolveRef.current = null;
          }
        }, 120_000);
      });
    }

    if (!confirmed) {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, confirmationStatus: 'rejected' as const, pendingToolCalls: undefined,
              toolStatus: m.toolStatus?.map(ts =>
                EXPENSIVE_TOOLS.has(ts.name) || ts.name === 'edit_shot' ? { ...ts, status: 'error' as const, result: 'Cancelled' } : ts
              ) }
          : m
      ));
      for (const tc of expensiveCalls) {
        allResults.push({ tool_call_id: tc.id, content: JSON.stringify({ success: false, error: 'User cancelled.' }) });
      }
    } else {
      setMessages(prev => prev.map(m =>
        m.id === assistantMsgId
          ? { ...m, confirmationStatus: 'confirmed' as const, pendingToolCalls: undefined }
          : m
      ));
      for (const tc of expensiveCalls) {
        allResults.push(await executeToolSafe(tc, assistantMsgId, toolCtx, setMessages));
      }
    }
  }

  const toolMessages: AgentMessage[] = allResults.map(tr => ({
    id: crypto.randomUUID(), role: 'tool' as const, content: tr.content, tool_call_id: tr.tool_call_id,
  }));

  return { toolMessages, realToolCalls, suggestions };
}

async function executeToolSafe(
  tc: ToolCall, assistantMsgId: string, toolCtx: ToolContext,
  setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>,
): Promise<{ tool_call_id: string; content: string }> {
  try {
    const toolResult = await executeTool(toolCtx, tc);
    setMessages(prev => prev.map(m =>
      m.id === assistantMsgId
        ? { ...m, toolStatus: m.toolStatus?.map(ts => ts.id === tc.id ? { ...ts, status: 'done' as const, result: toolResult } : ts) }
        : m
    ));
    try {
      const parsed = JSON.parse(toolResult);
      if (parsed.image_url) {
        setMessages(prev => prev.map(m =>
          m.id === assistantMsgId ? { ...m, imageUrls: [...(m.imageUrls || []), parsed.image_url] } : m
        ));
      }
    } catch { /* not JSON */ }
    return { tool_call_id: tc.id, content: toolResult };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    const errMsg = err instanceof Error ? err.message : String(err);
    setMessages(prev => prev.map(m =>
      m.id === assistantMsgId
        ? { ...m, toolStatus: m.toolStatus?.map(ts => ts.id === tc.id ? { ...ts, status: 'error' as const, result: errMsg } : ts) }
        : m
    ));
    return { tool_call_id: tc.id, content: JSON.stringify({ success: false, error: errMsg }) };
  }
}

// ============= Main hook =============

export function useVideoAgent() {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [shots, setShots] = useState<StoryboardShot[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [config, setConfig] = useState<StoryboardConfig>(DEFAULT_CONFIG);
  const [storySummary, setStorySummary] = useState('');
  const [conversationSummary, setConversationSummary] = useState<string | null>(null);

  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const [sessionFolder, setSessionFolder] = useState(() => makeSessionFolder());
  const shotsRef = useRef<StoryboardShot[]>([]);
  shotsRef.current = shots;
  const configRef = useRef<StoryboardConfig>(config);
  configRef.current = config;
  const storySummaryRef = useRef('');
  storySummaryRef.current = storySummary;
  const messagesRef = useRef<AgentMessage[]>([]);
  messagesRef.current = messages;
  const abortControllerRef = useRef<AbortController | null>(null);
  const pendingResolveRef = useRef<((v: boolean) => void) | null>(null);

  // Restore session on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved) {
      const cleanMessages = saved.messages
        .filter(m => !m.isLoading && !m.isStreaming)
        .map(m => ({ ...m, isStreaming: false, isLoading: false, pendingToolCalls: undefined, confirmationStatus: undefined }));
      const cleanShots = saved.shots.map(s => ({
        ...s,
        status: (s.status === 'generating' ? 'idle' : s.status) as ShotStatus,
        firstFrameStatus: (s.firstFrameStatus === 'generating' ? 'idle' : s.firstFrameStatus) as FrameStatus,
        lastFrameStatus: (s.lastFrameStatus === 'generating' ? 'idle' : s.lastFrameStatus) as FrameStatus,
      }));
      setMessages(cleanMessages);
      setShots(cleanShots);
      setConfig(saved.config);
      setStorySummary(saved.storySummary);
      setConversationSummary(saved.conversationSummary || null);
      sessionIdRef.current = saved.id;
      if (saved.sessionFolder) setSessionFolder(saved.sessionFolder);
    }
  }, []);

  // Instant-save whenever shots gain new frame/video URLs (fires even during isProcessing)
  const shotsUrlsKey = shots
    .map(s => [s.firstFrameUrl, s.extractedLastFrameUrl, s.videoUrl].filter(Boolean).join(','))
    .join('|');
  useEffect(() => {
    const hasGeneratedContent = shots.some(s => s.firstFrameUrl || s.videoUrl);
    if (!hasGeneratedContent) return;
    const cleanMessages = messagesRef.current.filter(m => !m.isLoading && !m.isStreaming);
    const sessionData = {
      id: sessionIdRef.current, sessionFolder,
      messages: cleanMessages, shots, config, storySummary,
      conversationSummary: conversationSummary || undefined, savedAt: Date.now(),
    };
    saveSession(sessionData);
    void writeSessionFile(sessionFolder, 'session.json', JSON.stringify(sessionData, null, 2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotsUrlsKey]);

  // Compact + Persist — only when fully idle to avoid saving mid-generation state
  useEffect(() => {
    if (messages.length === 0 && shots.length === 0) return;
    if (isProcessing) return;
    if (messages.some(m => m.isStreaming || m.isLoading)) return;

    const { messages: compacted, summary: newSummary } = compactMessages(messages);
    if (newSummary) {
      const merged = conversationSummary ? `${conversationSummary}\n---\n${newSummary}` : newSummary;
      const trimmedSummary = merged.length > 3000 ? merged.slice(-3000) : merged;
      setConversationSummary(trimmedSummary);
      setMessages(compacted);
      return;
    }

    const sessionData = {
      id: sessionIdRef.current, sessionFolder, messages, shots, config, storySummary,
      conversationSummary: conversationSummary || undefined, savedAt: Date.now(),
    };
    saveSession(sessionData);
    void writeSessionFile(sessionFolder, 'session.json', JSON.stringify(sessionData, null, 2));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length, shots, config, storySummary, conversationSummary, isProcessing, sessionFolder]);

  const clearSession = useCallback(() => {
    clearStoredSession();
    clearVideoCache();
    setMessages([]);
    setShots([]);
    setConfig(DEFAULT_CONFIG);
    setStorySummary('');
    setConversationSummary(null);
    sessionIdRef.current = crypto.randomUUID();
    setSessionFolder(makeSessionFolder());
  }, []);

  const cancelGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    pendingResolveRef.current?.(false);
    pendingResolveRef.current = null;
    setIsProcessing(false);
    setShots(prev => prev.map(s => ({
      ...s,
      ...(s.status === 'generating' ? { status: 'idle' as ShotStatus } : {}),
      ...(s.firstFrameStatus === 'generating' ? { firstFrameStatus: 'idle' as const } : {}),
      ...(s.lastFrameStatus === 'generating' ? { lastFrameStatus: 'idle' as const } : {}),
    })));
    setMessages(prev => prev.map(m =>
      (m.isLoading || m.isStreaming)
        ? { ...m, content: m.content || 'Cancelled.', isLoading: false, isStreaming: false }
        : m
    ));
  }, []);

  const updateToolProgress = useCallback((toolCallId: string, progressText: string) => {
    setMessages(prev => prev.map(m => {
      if (!m.toolStatus) return m;
      return { ...m, toolStatus: m.toolStatus.map(ts =>
        ts.id === toolCallId ? { ...ts, result: progressText } : ts
      )};
    }));
  }, []);

  const currentUploadedUrlsRef = useRef<string[]>([]);
  const toolCtxRef = useRef<ToolContext>(null!);
  toolCtxRef.current = {
    shotsRef, configRef, storySummaryRef, abortControllerRef,
    currentUploadedUrls: currentUploadedUrlsRef.current,
    sessionFolder,
    setShots, setConfig, setStorySummary, updateToolProgress,
  };

  const conversationSummaryRef = useRef<string | null>(null);
  conversationSummaryRef.current = conversationSummary;

  const buildShotsContext = useCallback(() => {
    return shotsRef.current.map(s => ({
      prompt: s.prompt, firstFramePrompt: s.firstFramePrompt, lastFramePrompt: s.lastFramePrompt,
      firstFrameUrl: s.firstFrameUrl, lastFrameUrl: s.extractedLastFrameUrl, videoUrl: s.videoUrl, status: s.status,
    }));
  }, []);

  const estimateReservedTokens = useCallback(() => {
    const SYSTEM_PROMPT_TOKENS = 2000;
    const shotsJson = JSON.stringify(buildShotsContext());
    let shotTokens = 0;
    for (let i = 0; i < shotsJson.length; i++) {
      shotTokens += shotsJson.charCodeAt(i) > 0x2E7F ? 1.5 : 0.25;
    }
    return SYSTEM_PROMPT_TOKENS + Math.ceil(shotTokens);
  }, [buildShotsContext]);

  const buildApiMessages = useCallback((extraMessages: AgentMessage[]) => {
    const raw = extraMessages
      .filter(m => !m.isLoading && !m.isStreaming)
      .map(m => {
        if (m.role === 'tool') return { role: 'tool' as const, content: m.content, tool_call_id: m.tool_call_id };
        if (m.role === 'user' && m.imageUrls && m.imageUrls.length > 0) {
          const parts: Record<string, unknown>[] = [];
          let textContent = m.content || '';
          textContent += `\n\n[System: Image URLs in this message: ${m.imageUrls.join(', ')}. Use manage_references(action="add") if these should be reference images for generation.]`;
          parts.push({ type: 'text', text: textContent });
          for (const url of m.imageUrls) parts.push({ type: 'image_url', image_url: { url } });
          const base: Record<string, unknown> = { role: m.role, content: parts };
          if (m.tool_calls) base.tool_calls = m.tool_calls;
          return base;
        }
        const base: Record<string, unknown> = { role: m.role, content: m.content || null };
        if (m.tool_calls) base.tool_calls = m.tool_calls;
        return base;
      });
    const trimmed = trimMessagesForContext(raw, estimateReservedTokens());
    if (conversationSummaryRef.current) {
      trimmed.unshift({ role: 'system', content: `[Previous conversation summary]\n${conversationSummaryRef.current}` });
    }
    return trimmed;
  }, [estimateReservedTokens]);

  const streamAgentTurn = useCallback(async (
    apiMessages: Record<string, unknown>[], streamingMsgId: string,
    enableThinking?: boolean, signal?: AbortSignal,
  ) => {
    return streamAgentResponse(
      { messages: apiMessages, shots_context: buildShotsContext(), user_config: { shot_count: configRef.current.shotCount || 3, aspect_ratio: configRef.current.aspectRatio || '16:9' }, enable_thinking: !!enableThinking },
      (delta) => { setMessages(prev => prev.map(m => m.id === streamingMsgId ? { ...m, content: (m.content || '') + delta, isLoading: false, isStreaming: true } : m)); },
      (thinkDelta) => { setMessages(prev => prev.map(m => m.id === streamingMsgId ? { ...m, thinking: (m.thinking || '') + thinkDelta, isLoading: false, isStreaming: true } : m)); },
      !!enableThinking, signal,
    );
  }, [buildShotsContext]);

  function resizeToDataUrl(file: File, maxSize = 1024, quality = 0.75): Promise<string> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(objectUrl);
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = objectUrl;
    });
  }

  function uploadDataUrlToFal(dataUrl: string, filename: string, persist: boolean): Promise<string> {
    return fetch(dataUrl)
      .then(r => r.blob())
      .then(blob => {
        const file = new File([blob], filename, { type: 'image/jpeg' });
        return falUploadFile(file, persist);
      });
  }

  const sendMessage = useCallback(async (content: string, enableThinking?: boolean, images?: File[], autoConfirm?: boolean) => {
    if (!content.trim() && (!images || images.length === 0)) return;
    // If autoConfirm (button-triggered), force-cancel any stuck previous operation
    if (isProcessing) {
      if (autoConfirm) {
        abortControllerRef.current?.abort();
        pendingResolveRef.current?.(false);
        pendingResolveRef.current = null;
      } else {
        return;
      }
    }

    abortControllerRef.current = new AbortController();
    currentUploadedUrlsRef.current = [];

    // Step 1: generate local previews immediately (fast, no network)
    const previewUrls: string[] = [];
    if (images && images.length > 0) {
      for (const file of images) {
        try { previewUrls.push(await resizeToDataUrl(file)); } catch { /* skip */ }
      }
    }

    // Step 2: show message right away with previews
    const userMsgId = crypto.randomUUID();
    const userMsg: AgentMessage = {
      id: userMsgId, role: 'user', content: content.trim(),
      imageUrls: previewUrls.length > 0 ? previewUrls : undefined,
      isUploadingImages: previewUrls.length > 0,
    };
    const streamingMsgId = crypto.randomUUID();
    const streamingMsg: AgentMessage = { id: streamingMsgId, role: 'assistant', content: '', isLoading: true };

    setMessages(prev => [...prev, userMsg, streamingMsg]);
    setIsProcessing(true);

    // Step 3: upload to fal in background, then replace preview URLs with fal URLs
    let falUrls: string[] = previewUrls;
    if (previewUrls.length > 0) {
      const persist = loadConfig().persistFalUploads ?? false;
      const results = await Promise.allSettled(
        previewUrls.map((dataUrl, i) =>
          uploadDataUrlToFal(dataUrl, `image-${i}.jpg`, persist)
        )
      );
      falUrls = results.map((r, i) => r.status === 'fulfilled' ? r.value : previewUrls[i]);
      currentUploadedUrlsRef.current = falUrls;
      setMessages(prev => prev.map(m =>
        m.id === userMsgId ? { ...m, imageUrls: falUrls, isUploadingImages: false } : m
      ));
    }

    // Step 4: build API messages with fal URLs (not data URLs)
    const userMsgForApi: AgentMessage = { ...userMsg, imageUrls: falUrls.length > 0 ? falUrls : undefined, isUploadingImages: false };

    let activeMsgId = streamingMsgId;

    try {
      let currentApiMessages = buildApiMessages([...messagesRef.current, userMsgForApi]);
      let currentMsgId = streamingMsgId;
      const MAX_TOOL_ROUNDS = 5;

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        let result: Awaited<ReturnType<typeof streamAgentTurn>>;
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            result = await streamAgentTurn(currentApiMessages, currentMsgId, enableThinking, abortControllerRef.current?.signal);
            break;
          } catch (retryErr: any) {
            const isRetryable = attempt === 0 && (
              (!retryErr?.status && /failed to fetch|timeout|network/i.test(retryErr?.message || ''))
              || (retryErr?.status >= 500)
            );
            if (isRetryable) {
              setMessages(prev => prev.map(m =>
                m.id === currentMsgId ? { ...m, content: '', thinking: '', isLoading: true, isStreaming: false } : m
              ));
              await new Promise(r => setTimeout(r, 2000));
              continue;
            }
            throw retryErr;
          }
        }
        result = result!;

        setMessages(prev => prev.map(m =>
          m.id === currentMsgId ? {
            ...m, content: result.content, thinking: result.thinking || undefined,
            isStreaming: false, isLoading: false, tool_calls: result.tool_calls,
            toolStatus: result.tool_calls?.filter(tc => tc.function.name !== 'suggest_next_actions')
              .map(tc => ({ id: tc.id, name: tc.function.name, status: 'running' as const })),
          } : m
        ));

        if (!result.content && !result.thinking && (!result.tool_calls || result.tool_calls.length === 0)) {
          setMessages(prev => prev.map(m =>
            m.id === currentMsgId ? { ...m, content: '⚠️ AI returned no content. Please retry.', isLoading: false, isStreaming: false } : m
          ));
          break;
        }

        if (!result.tool_calls || result.tool_calls.length === 0) break;

        const { toolMessages, realToolCalls } = await processToolRound(
          result.tool_calls, currentMsgId, toolCtxRef.current, setMessages, pendingResolveRef, autoConfirm,
        );

        if (realToolCalls.length === 0) break;

        const nextMsgId = crypto.randomUUID();
        setMessages(prev => [
          ...prev, ...toolMessages,
          { id: nextMsgId, role: 'assistant' as const, content: '', isLoading: true },
        ]);

        currentApiMessages = trimMessagesForContext([
          ...currentApiMessages,
          { role: 'assistant' as const, content: result.content || null, tool_calls: realToolCalls },
          ...toolMessages
            .filter(tm => realToolCalls.some(tc => tc.id === tm.tool_call_id))
            .map(tm => ({ role: 'tool' as const, content: tm.content, tool_call_id: tm.tool_call_id })),
        ]);
        currentMsgId = nextMsgId;
        activeMsgId = nextMsgId;
      }

      // Propagate suggestions to the final assistant message.
      // Priority: same-round > earlier-round > workflow-state fallback
      setMessages(prev => {
        const assistantMsgs = prev.filter(m => m.role === 'assistant');
        const last = assistantMsgs[assistantMsgs.length - 1];
        if (!last || last.suggestedActions?.length) return prev;

        // Try to copy from any earlier assistant message
        const withSuggestions = [...assistantMsgs].reverse().find(m => m.suggestedActions?.length);
        if (withSuggestions?.suggestedActions) {
          return prev.map(m =>
            m.id === last.id ? { ...m, suggestedActions: withSuggestions.suggestedActions } : m
          );
        }

        // Fallback: derive minimal buttons from current workflow state
        const shots = shotsRef.current;
        let fallback: SuggestedAction[] = [];
        if (shots.length > 0) {
          const hasFrames = shots.some(s => s.firstFrameUrl);
          const hasVideos = shots.some(s => s.videoUrl);
          if (!hasFrames) {
            fallback = [
              { label: '开始生成关键帧', message: '确认生成关键帧' },
              { label: '修改分镜内容', message: '我想修改分镜内容' },
            ];
          } else if (!hasVideos) {
            fallback = [
              { label: '生成视频', message: '开始生成视频' },
              { label: '查看关键帧', message: '展示当前关键帧' },
            ];
          } else {
            fallback = [
              { label: '重新编辑', message: '我想修改某个镜头' },
              { label: '重新生成视频', message: '重新生成所有视频' },
            ];
          }
        }
        if (fallback.length > 0) {
          return prev.map(m =>
            m.id === last.id ? { ...m, suggestedActions: fallback } : m
          );
        }
        return prev;
      });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages(prev => prev.map(m =>
          m.id === activeMsgId ? { ...m, content: '', isLoading: false, isStreaming: false } : m
        ).filter(m => !(m.id === activeMsgId && !m.content)));
      } else {
        const errorMsg = err instanceof Error ? err.message : 'Unknown error';
        setMessages(prev => prev.map(m =>
          m.id === activeMsgId ? { ...m, content: `❌ ${errorMsg}`, isLoading: false, isStreaming: false } : m
        ));
        toast.error(errorMsg);
      }
    } finally {
      setIsProcessing(false);
    }
  }, [isProcessing, buildApiMessages, streamAgentTurn]);

  const updateConfig = useCallback((patch: Partial<StoryboardConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
  }, []);

  const updateShot = useCallback((shotId: string, patch: Partial<StoryboardShot>) => {
    shotsRef.current = shotsRef.current.map(s => s.id === shotId ? { ...s, ...patch } : s);
    setShots([...shotsRef.current]);
  }, []);

  const confirmPendingTools = useCallback(() => {
    pendingResolveRef.current?.(true);
    pendingResolveRef.current = null;
  }, []);

  const rejectPendingTools = useCallback(() => {
    pendingResolveRef.current?.(false);
    pendingResolveRef.current = null;
  }, []);

  const frameModelOptions = useMemo(() => FRAME_MODELS.map(m => ({ id: m.id, label: m.name })), []);
  const videoModelOptions = useMemo(() => VIDEO_MODELS.map(m => ({ id: m.id, label: m.name })), []);

  const addReference = useCallback((url: string) => {
    const current = configRef.current.referenceImageUrls;
    if (current.includes(url) || current.length >= 3) return;
    const updated = [...current, url];
    configRef.current = { ...configRef.current, referenceImageUrls: updated };
    setConfig(configRef.current);
  }, []);

  const removeReference = useCallback((url: string) => {
    const updated = configRef.current.referenceImageUrls.filter(u => u !== url);
    configRef.current = { ...configRef.current, referenceImageUrls: updated };
    setConfig(configRef.current);
  }, []);

  return {
    messages, shots, isProcessing, config, storySummary,
    sendMessage, setConfig, setShots, clearSession, cancelGeneration, updateConfig,
    updateShot, frameModelOptions, videoModelOptions,
    confirmPendingTools, rejectPendingTools,
    addReference, removeReference,
  };
}
