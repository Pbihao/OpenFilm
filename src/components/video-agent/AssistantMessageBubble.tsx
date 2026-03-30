/**
 * AssistantMessageBubble — Assistant message display in agent chat
 */
import { useState } from 'react';
import { Sparkles, ChevronRight, Wrench, CheckCircle2, XCircle, ChevronDown, Check, X, Download, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownContent } from '@/components/MarkdownContent';
import { Chip } from '@/components/ui/chip';
import type { AgentMessage, ToolCall } from '@/types/video-agent';

const TOOL_LABEL_KEYS: Record<string, string> = {
  plan_story:           'videoAgent.toolPlanStory',
  generate_frames:      'videoAgent.toolGenerateFrames',
  generate_videos:      'videoAgent.toolGenerateVideos',
  edit_shot:            'videoAgent.toolEditShot',
  reset_workspace:      'videoAgent.toolResetWorkspace',
  generate_image:       'videoAgent.toolGenerateImage',
  manage_references:    'videoAgent.toolManageReferences',
};

function BouncingDots() {
  return (
    <div className="flex items-center gap-1 py-2 px-1">
      {[0, 1, 2].map(i => (
        <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: '0.8s' }} />
      ))}
    </div>
  );
}

function ThinkingBlock({ content }: { content: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors mb-1">
        <Sparkles className="h-3 w-3" />
        <span className="italic">{t('videoAgent.thinkingProcess')}</span>
        <ChevronRight className={cn("h-3 w-3 transition-transform", open && "rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="text-xs text-muted-foreground/60 italic leading-relaxed pl-4 border-l border-border/30 mb-2 max-h-[200px] overflow-y-auto">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolStatusBlock({ toolStatus }: { toolStatus: NonNullable<AgentMessage['toolStatus']> }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const allDone = toolStatus.every(ts => ts.status === 'done');
  const hasError = toolStatus.some(ts => ts.status === 'error');
  const runningCount = toolStatus.filter(ts => ts.status === 'running').length;

  const label = hasError
    ? t('videoAgent.executedOpsError', { count: toolStatus.length })
    : allDone
      ? t('videoAgent.executedOps', { count: toolStatus.length })
      : t('videoAgent.executingOps', { running: runningCount, total: toolStatus.length });

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mt-2">
        <Wrench className="h-3 w-3" />
        <span>{label}</span>
        <ChevronDown className={cn("h-3 w-3 transition-transform", !open && "-rotate-90")} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1.5 space-y-1 pl-4 border-l border-border/40">
          {toolStatus.map((ts, i) => (
            <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {ts.status === 'running' && <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />}
              {ts.status === 'done' && <CheckCircle2 className="h-3 w-3 text-primary" />}
              {ts.status === 'error' && <XCircle className="h-3 w-3 text-destructive" />}
              <span>{TOOL_LABEL_KEYS[ts.name] ? t(TOOL_LABEL_KEYS[ts.name]) : ts.name}</span>
              {ts.status === 'running' && ts.result && (
                <span className="text-muted-foreground/60 ml-1">{ts.result}</span>
              )}
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ToolConfirmationCard({
  pendingToolCalls, confirmationStatus, onConfirm, onReject,
}: {
  pendingToolCalls: ToolCall[];
  confirmationStatus?: string;
  onConfirm?: () => void;
  onReject?: () => void;
}) {
  const { t } = useTranslation();
  const isPending = confirmationStatus === 'pending';

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <span>{t('videoAgent.confirmGeneration')}</span>
      </div>
      <div className="space-y-1 pl-5">
        {pendingToolCalls.map((tc, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Wrench className="h-3 w-3" />
            <span>{TOOL_LABEL_KEYS[tc.function.name] ? t(TOOL_LABEL_KEYS[tc.function.name]) : tc.function.name}</span>
          </div>
        ))}
      </div>
      {isPending ? (
        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" variant="default" className="h-7 text-xs gap-1" onClick={onConfirm}>
            <Check className="h-3 w-3" />{t('videoAgent.confirmButton')}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={onReject}>
            <X className="h-3 w-3" />{t('videoAgent.cancelButton')}
          </Button>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground/70 pt-1 italic">
          {confirmationStatus === 'confirmed' ? '✅ ' + t('videoAgent.confirmButton') : '❌ ' + t('videoAgent.userCancelled')}
        </div>
      )}
    </div>
  );
}

function downloadImage(url: string, filename: string) {
  fetch(url)
    .then(res => res.blob())
    .then(blob => {
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(blobUrl);
    })
    .catch(() => { window.open(url, '_blank'); });
}

interface AssistantMessageBubbleProps {
  message: AgentMessage;
  isLastAssistant: boolean;
  onSendMessage: (content: string) => void;
  onConfirmTools?: () => void;
  onRejectTools?: () => void;
  onAddToLibrary?: (url: string) => void;
}

export function AssistantMessageBubble({ message, isLastAssistant, onSendMessage, onConfirmTools, onRejectTools, onAddToLibrary }: AssistantMessageBubbleProps) {
  if (message.isLoading) return <BouncingDots />;

  return (
    <div className="min-w-0">
      {message.thinking && <ThinkingBlock content={message.thinking} />}
      {message.isStreaming && !message.content && <BouncingDots />}
      {message.content && (
        <MarkdownContent content={message.content} isStreaming={message.isStreaming} className="text-sm" />
      )}
      {message.imageUrls && message.imageUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {message.imageUrls.map((url, i) => (
            <div key={i} className="relative group/img">
              <img src={url} alt="" className="max-w-[200px] rounded-lg border border-border object-cover" />
              <div className="absolute bottom-1.5 right-1.5 flex gap-1 opacity-0 group-hover/img:opacity-100 transition-opacity">
                <button
                  onClick={() => downloadImage(url, `generated-${i + 1}.png`)}
                  title="下载"
                  className="h-6 w-6 rounded bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Download className="h-3 w-3" />
                </button>
                {onAddToLibrary && (
                  <button
                    onClick={() => onAddToLibrary(url)}
                    title="添加到素材库"
                    className="h-6 w-6 rounded bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center text-muted-foreground hover:text-primary transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {message.toolStatus && message.toolStatus.length > 0 && <ToolStatusBlock toolStatus={message.toolStatus} />}
      {message.pendingToolCalls && message.pendingToolCalls.length > 0 && (
        <ToolConfirmationCard
          pendingToolCalls={message.pendingToolCalls}
          confirmationStatus={message.confirmationStatus}
          onConfirm={onConfirmTools}
          onReject={onRejectTools}
        />
      )}
      {isLastAssistant && message.suggestedActions && message.suggestedActions.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {message.suggestedActions.map((action, i) => (
            <Chip key={i} size="sm" onClick={() => onSendMessage(action.message)} className="cursor-pointer">
              {action.label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
