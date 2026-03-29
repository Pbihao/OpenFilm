/**
 * Video Agent — Main page (standalone)
 */
import { useState, useCallback, useEffect, useMemo, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useVideoAgent } from '@/hooks/video-agent/useVideoAgent';
import { WorkshopPanel } from '@/components/video-agent/WorkshopPanel';
import { WorkshopToolbar } from '@/components/video-agent/WorkshopToolbar';
import { AgentChatPanel } from '@/components/video-agent/AgentChatPanel';
import { createShot } from '@/hooks/video-agent/agentSession';
import { isConfigured } from '@/config';
import { useNavigate } from 'react-router-dom';

const StoryboardExport = lazy(() =>
  import('@/components/storyboard/StoryboardExport').then(m => ({ default: m.StoryboardExport }))
);

export default function VideoAgentPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  useEffect(() => {
    if (!isConfigured()) navigate('/settings');
  }, [navigate]);

  const {
    messages, shots, isProcessing, config, sendMessage, clearSession,
    cancelGeneration, updateConfig, updateShot, setShots,
    frameModelOptions, videoModelOptions, confirmPendingTools, rejectPendingTools,
    addReference, removeReference,
  } = useVideoAgent();

  const [enableThinking, setEnableThinking] = useState(false);
  const [prefillText, setPrefillText] = useState<string>();
  const [view, setView] = useState<'workshop' | 'export'>('workshop');

  const handleFillPrompt = useCallback((text: string) => setPrefillText(text), []);
  const handlePrefillHandled = useCallback(() => setPrefillText(undefined), []);

  // Direct send from buttons — autoConfirm=true to skip confirmation dialogs
  const handleDirectSend = useCallback((text: string) => {
    sendMessage(text, false, undefined, true);
  }, [sendMessage]);

  const handleAddShot = useCallback(() => {
    const newShot = createShot(shots.length + 1);
    setShots(prev => [...prev, newShot]);
  }, [shots.length, setShots]);

  const handleRemoveShot = useCallback((shotId: string) => {
    setShots(prev => prev.filter(s => s.id !== shotId).map((s, i) => ({ ...s, index: i + 1 })));
  }, [setShots]);


  const canExport = useMemo(() => shots.some(s => s.videoUrl), [shots]);

  // Detect pending confirmation in chat to show indicator
  const hasPendingConfirmation = useMemo(() =>
    messages.some(m => m.confirmationStatus === 'pending'),
  [messages]);

  return (
    <div className="h-screen flex flex-col bg-background">
      <header className="h-12 flex items-center gap-2 px-3 border-b border-border bg-muted/30 flex-shrink-0">
        {view === 'export' ? (
          <>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-muted-foreground hover:text-foreground" onClick={() => setView('workshop')}>
              <ArrowLeft className="h-4 w-4" />
              <span className="text-xs">{t('videoAgent.backToWorkshop')}</span>
            </Button>
            <Separator orientation="vertical" className="h-5" />
            <span className="text-sm font-semibold">{t('videoAgent.trimExport')}</span>
          </>
        ) : (
          <WorkshopToolbar
            config={config}
            isProcessing={isProcessing}
            hasMessages={messages.length > 0}
            canExport={canExport}
            frameModelOptions={frameModelOptions}
            videoModelOptions={videoModelOptions}
            onUpdateConfig={updateConfig}
            onClearSession={clearSession}
            onOpenExport={() => setView('export')}
          />
        )}
      </header>

      {view === 'workshop' ? (
        <ResizablePanelGroup direction="horizontal" className="flex-1">
          <ResizablePanel defaultSize={55} minSize={30}>
            <div className="flex flex-col h-full overflow-hidden">
              <WorkshopPanel
                shots={shots}
                aspectRatio={config.aspectRatio}
                videoModelId={config.videoModelId}
                referenceUrls={config.referenceImageUrls}
                onAddReference={addReference}
                onRemoveReference={removeReference}
                onUpdateShot={updateShot}
                onRemoveShot={handleRemoveShot}
                onFillPrompt={handleFillPrompt}
                onDirectSend={handleDirectSend}
                onAddShot={handleAddShot}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize={45} minSize={25}>
            <div className="relative h-full">
              {hasPendingConfirmation && (
                <div className="absolute top-2 right-2 z-10 flex items-center gap-1.5 bg-destructive/10 text-destructive px-2.5 py-1 rounded-full animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-destructive" />
                  <span className="text-[10px] font-medium">{t('videoAgent.confirmationNeeded', 'Confirmation needed')}</span>
                </div>
              )}
              <AgentChatPanel
                messages={messages}
                isProcessing={isProcessing}
                enableThinking={enableThinking}
                prefillText={prefillText}
                onPrefillHandled={handlePrefillHandled}
                onToggleThinking={setEnableThinking}
                onSendMessage={sendMessage}
                onCancel={cancelGeneration}
                onConfirmTools={confirmPendingTools}
                onRejectTools={rejectPendingTools}
                referenceUrls={config.referenceImageUrls}
                onAddReference={addReference}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      ) : (
        <div className="flex-1 flex flex-col overflow-hidden">
          <Suspense fallback={
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          }>
            <StoryboardExport shots={shots} onUpdateShot={updateShot} />
          </Suspense>
        </div>
      )}
    </div>
  );
}
