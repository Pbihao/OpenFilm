/**
 * Agent Chat Panel — Right side chat
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { Send, Bot, ImagePlus, X, Sparkles, Lightbulb, Video } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';

import type { AgentMessage } from '@/types/video-agent';
import type { ReferenceEntry } from '@/types/storyboard';
import { UserMessageBubble } from '@/components/video-agent/UserMessageBubble';
import { AssistantMessageBubble } from '@/components/video-agent/AssistantMessageBubble';
import { PillButton } from '@/components/ui/pill-button';

interface AgentChatPanelProps {
  messages: AgentMessage[];
  isProcessing: boolean;
  enableThinking: boolean;
  prefillText?: string;
  onPrefillHandled?: () => void;
  onToggleThinking: (v: boolean) => void;
  onSendMessage: (content: string, enableThinking?: boolean, images?: File[]) => void;
  onCancel?: () => void;
  onConfirmTools?: () => void;
  onRejectTools?: () => void;
  references: ReferenceEntry[];
  onAddReference: (entry: ReferenceEntry) => void;
  /** Files injected from the material library drawer */
  externalPendingFiles?: File[];
  onExternalFilesConsumed?: () => void;
  /** Called when the user wants to save a chat image to the material library */
  onAddToLibrary?: (url: string) => void;
}

export function AgentChatPanel({
  messages, isProcessing, enableThinking, prefillText,
  onToggleThinking, onSendMessage, onCancel, onPrefillHandled, onConfirmTools, onRejectTools,
  references, onAddReference,
  externalPendingFiles, onExternalFilesConsumed,
  onAddToLibrary,
}: AgentChatPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState('');
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const lastAssistantIndex = useMemo(() => {
    if (isProcessing) return -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return i;
    }
    return -1;
  }, [messages, isProcessing]);

  useEffect(() => {
    if (prefillText) { setInput(prefillText); onPrefillHandled?.(); }
  }, [prefillText, onPrefillHandled]);

  // Absorb externally injected files (from material library)
  useEffect(() => {
    if (externalPendingFiles && externalPendingFiles.length > 0) {
      setPendingImages(prev => [...prev, ...externalPendingFiles].slice(0, 5));
      onExternalFilesConsumed?.();
    }
  }, [externalPendingFiles]); // eslint-disable-line react-hooks/exhaustive-deps

  const messagesLen = messages.length;
  const lastMsgStreaming = messages[messages.length - 1]?.isStreaming;
  const lastMsgContentLen = messages[messages.length - 1]?.content?.length ?? 0;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: lastMsgStreaming ? 'instant' : 'smooth' });
  }, [messagesLen, lastMsgStreaming, lastMsgContentLen]);

  const handleSend = () => {
    if ((!input.trim() && pendingImages.length === 0) || isProcessing) return;
    onSendMessage(input.trim(), enableThinking, pendingImages.length > 0 ? pendingImages : undefined);
    setInput('');
    setPendingImages([]);
    setPreviewUrls([]);
  };

  useEffect(() => {
    const urls = pendingImages.map(f => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [pendingImages]);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) setPendingImages(prev => [...prev, ...files].slice(0, 5));
    e.target.value = '';
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="px-4 py-4 space-y-5">
          {messages.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Bot className="h-8 w-8 mx-auto mb-3 opacity-20" />
              <p className="text-sm">{t('videoAgent.chatWelcome')}</p>
              <div className="flex flex-wrap justify-center gap-2 mt-4 px-4">
                {([
                  { key: 'quickAction1', icon: Sparkles },
                  { key: 'quickAction2', icon: Lightbulb },
                  { key: 'quickAction3', icon: Video },
                ] as const).map(({ key, icon: Icon }) => (
                  <PillButton key={key} onClick={() => setInput(t(`videoAgent.${key}`))}>
                    <Icon className="h-3.5 w-3.5 mr-1.5 inline-block" />
                    {t(`videoAgent.${key}`)}
                  </PillButton>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg, msgIndex) => {
            if (msg.role === 'tool') return null;
            if (msg.role === 'user') return <UserMessageBubble key={msg.id} message={msg} references={references} onAddReference={onAddReference} />;
            return (
              <div key={msg.id}>
                <AssistantMessageBubble
                  message={msg}
                  isLastAssistant={msgIndex === lastAssistantIndex}
                  onSendMessage={(content) => onSendMessage(content, enableThinking)}
                  onConfirmTools={onConfirmTools}
                  onRejectTools={onRejectTools}
                  onAddToLibrary={onAddToLibrary}
                />
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>
      <div className="px-3 py-3 border-t border-border space-y-2">
        <div className="flex items-center gap-2 px-1">
          <label className="text-xs text-muted-foreground select-none cursor-pointer" htmlFor="thinking-toggle">
            {t('videoAgent.thinkingProcess')}
          </label>
          <Switch id="thinking-toggle" checked={enableThinking} onCheckedChange={onToggleThinking} className="scale-75 origin-left" />
        </div>
        {pendingImages.length > 0 && (
          <div className="flex flex-wrap gap-2 px-1">
            {previewUrls.map((url, i) => (
              <div key={i} className="relative group">
                <img src={url} alt="" className="h-14 w-14 rounded-lg object-cover border border-border" />
                <button
                  onClick={() => setPendingImages(prev => prev.filter((_, idx) => idx !== i))}
                  className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageSelect} />
        <div className="flex items-end gap-2">
          <Button variant="ghost" size="icon" className="h-[42px] w-[42px] shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => imageInputRef.current?.click()} disabled={isProcessing}>
            <ImagePlus className="h-4.5 w-4.5" />
          </Button>
          <Textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); handleSend(); } }}
            placeholder={t('videoAgent.chatPlaceholder')} className="!min-h-[42px] max-h-[96px] !px-3 !py-2.5 text-xs !rounded-xl resize-none flex-1"
            rows={1} disabled={isProcessing} />
          {isProcessing && onCancel ? (
            <Button size="icon" variant="destructive" className="h-[42px] w-[42px] rounded-xl flex-shrink-0" onClick={onCancel}>
              <span className="h-3.5 w-3.5 rounded-sm bg-destructive-foreground" />
            </Button>
          ) : (
            <Button size="icon" className="h-[42px] w-[42px] rounded-xl flex-shrink-0" onClick={handleSend}
              disabled={(!input.trim() && pendingImages.length === 0) || isProcessing}>
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
