/**
 * Workshop Panel — Left side shot preview with editable prompts (standalone)
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { Film, Video, Sparkles, ChevronDown, ChevronRight, AlertCircle, Upload, Play, Maximize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AixioLogo } from '@/components/AixioLogo';
import { SHOWCASES, type ShowcaseExample } from '@/data/showcases';
import { ExampleDialog } from '@/components/video-agent/ExampleDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ImageLightbox } from '@/components/ImageLightbox';
import { VideoPlayerDialog } from '@/components/VideoPlayerDialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { FramePreview } from '@/components/video-agent/FramePreview';
import { FrameGenDialog } from '@/components/video-agent/FrameGenDialog';
import type { Material } from '@/types/material';
import type { StoryboardShot } from '@/types/storyboard';
import { VIDEO_MODEL_CAPABILITIES } from '@/types/video-generation';
import { VideoDurationSelector } from '@/components/VideoDurationSelector';
import { Trash2 } from 'lucide-react';
import { falUploadFile } from '@/lib/fal';
import { getBlobUrl } from '@/lib/videoBlobCache';

interface WorkshopPanelProps {
  shots: StoryboardShot[];
  aspectRatio: string;
  videoModelId: string;
  frameModelId: string;
  materials: Material[];
  onAddMaterial: (material: Material) => void;
  onRemoveMaterial: (id: string) => void;
  onUpdateShot?: (shotId: string, updates: Partial<StoryboardShot>) => void;
  onRemoveShot?: (shotId: string) => void;
  onFillPrompt?: (text: string) => void;
  onDirectSend?: (text: string) => void;
  onAddShot?: () => void;
}

function getAspectClass(ratio: string) {
  return ratio === '9:16' ? 'aspect-[9/16]' : 'aspect-video';
}

function PromptField({
  label, value, rows = 2, compact = false,
  onFocus, onBlur, onChange, onSave,
}: {
  label: string; value: string; rows?: number; compact?: boolean;
  onFocus?: () => void; onBlur?: () => void;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
}) {
  const { t } = useTranslation();
  const [expandOpen, setExpandOpen] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <>
      <div>
        <label className={cn(
          'font-medium mb-1 block',
          compact ? 'text-[10px] text-muted-foreground/50' : 'text-[10px] text-muted-foreground/60',
        )}>
          {label}
        </label>
        <div className="relative group/field">
          <Textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            rows={rows}
            className={cn(
              'text-xs rounded-lg bg-muted/30 border-border/30 resize-none pr-7',
              compact ? 'min-h-[32px] p-1.5' : 'min-h-[40px] p-2',
            )}
          />
          <button
            type="button"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault();
              setDraft(value);
              setExpandOpen(true);
            }}
            className="absolute top-1 right-1 h-5 w-5 flex items-center justify-center rounded opacity-0 group-hover/field:opacity-50 group-focus-within/field:opacity-50 hover:!opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <Maximize2 className="h-3 w-3" />
          </button>
        </div>
      </div>

      <Dialog open={expandOpen} onOpenChange={setExpandOpen}>
        <DialogContent className="max-w-xl">
          <DialogTitle className="text-sm font-medium">{label}</DialogTitle>
          <DialogDescription className="sr-only">Edit prompt in expanded view</DialogDescription>
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="min-h-[280px] text-sm font-mono resize-none"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                onSave(draft);
                setExpandOpen(false);
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setExpandOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button size="sm" onClick={() => { onSave(draft); setExpandOpen(false); }}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ShotPreviewCard({
  shot, shots, aspectRatio, videoModelId, frameModelId, materials, onUpdate, onDelete, onFillPrompt, onDirectSend, onAddMaterial, onRemoveMaterial,
}: {
  shot: StoryboardShot; shots: StoryboardShot[]; aspectRatio: string; videoModelId: string; frameModelId: string;
  materials: Material[];
  onUpdate?: (updates: Partial<StoryboardShot>) => void;
  onDelete?: () => void; onFillPrompt?: (text: string) => void;
  onDirectSend?: (text: string) => void;
  onAddMaterial: (material: Material) => void;
  onRemoveMaterial: (id: string) => void;
}) {
  const { t } = useTranslation();
  const aspectClass = getAspectClass(aspectRatio);
  const [showFramePrompts, setShowFramePrompts] = useState(false);
  const [localPrompt, setLocalPrompt] = useState(shot.prompt);
  const [localFirstFramePrompt, setLocalFirstFramePrompt] = useState(shot.firstFramePrompt);
  const [localLastFramePrompt, setLocalLastFramePrompt] = useState(shot.lastFramePrompt);
  const focusCount = useRef(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxImages, setLightboxImages] = useState<string[]>([]);
  const [videoDialogOpen, setVideoDialogOpen] = useState(false);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string | undefined>(shot.videoUrl);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleVideoUpload = async (file: File) => {
    if (!onUpdate) return;
    try {
      const url = await falUploadFile(file);
      onUpdate({ videoUrl: url, status: 'completed' });
    } catch {
      toast.error(t('videoAgent.uploadFailed'));
    }
  };

  useEffect(() => {
    if (focusCount.current > 0) return;
    setLocalPrompt(shot.prompt);
    setLocalFirstFramePrompt(shot.firstFramePrompt);
    setLocalLastFramePrompt(shot.lastFramePrompt);
  }, [shot.prompt, shot.firstFramePrompt, shot.lastFramePrompt]);

  useEffect(() => { setVideoPlaying(false); }, [shot.videoUrl]);

  useEffect(() => {
    if (!shot.videoUrl) { setResolvedVideoUrl(undefined); return; }
    getBlobUrl(shot.videoUrl).then(setResolvedVideoUrl).catch(() => setResolvedVideoUrl(shot.videoUrl));
  }, [shot.videoUrl]);

  const onFocus = useCallback(() => { focusCount.current++; }, []);
  const onBlur = useCallback(() => { focusCount.current--; }, []);

  const handlePromptBlur = (field: 'prompt' | 'firstFramePrompt' | 'lastFramePrompt', value: string) => {
    onBlur();
    if (shot[field] === value || !onUpdate) return;
    onUpdate({ [field]: value });
  };

  const handleFrameDownload = async (url: string, filename: string) => {
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl; a.download = filename; a.click();
      URL.revokeObjectURL(blobUrl);
    } catch { window.open(url, '_blank'); }
  };

  const handleFrameDelete = (type: 'first' | 'last') => {
    if (!onUpdate) return;
    if (type === 'first') onUpdate({ firstFrameUrl: undefined, firstFrameStatus: 'idle' });
    else onUpdate({ extractedLastFrameUrl: undefined, lastFrameStatus: 'idle' });
  };

  const handleFrameAssignMaterial = (displayUrl: string, refUrl: string, type: 'first' | 'last') => {
    if (!onUpdate) return;
    if (type === 'first') onUpdate({ firstFrameUrl: displayUrl, firstFrameRefUrl: refUrl, firstFrameStatus: 'completed' });
    else onUpdate({ extractedLastFrameUrl: displayUrl, lastFrameRefUrl: refUrl, lastFrameStatus: 'completed' });
  };

  const handleFrameUpload = async (file: File, type: 'first' | 'last') => {
    if (!onUpdate) return;
    try {
      const url = await falUploadFile(file);
      if (type === 'first') onUpdate({ firstFrameUrl: url, firstFrameStatus: 'completed' });
      else onUpdate({ extractedLastFrameUrl: url, lastFrameStatus: 'completed' });
    } catch { toast.error(t('videoAgent.uploadFailed')); }
  };

  const [frameDialogOpen, setFrameDialogOpen] = useState(false);
  const [frameDialogType, setFrameDialogType] = useState<'first' | 'last'>('first');

  const handleFrameRegenerate = (type: 'first' | 'last') => {
    setFrameDialogType(type);
    setFrameDialogOpen(true);
  };

  const openFrameLightbox = (url: string) => { setLightboxImages([url]); setLightboxOpen(true); };

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/30">
        <Film className="h-3.5 w-3.5 text-primary" />
        <span className="text-xs font-semibold">{t('videoAgent.shot', { index: shot.index })}</span>
        <div className="flex-1" />
        {(() => {
          const caps = VIDEO_MODEL_CAPABILITIES[videoModelId];
          const durations = caps?.supportedDurations ?? [4];
          return durations.length > 1 ? (
            <VideoDurationSelector durations={durations} selectedDuration={shot.duration ?? durations[0]}
              onDurationChange={(d) => onUpdate?.({ duration: d })} />
          ) : null;
        })()}
        {shot.firstFrameUrl && <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{t('videoAgent.firstFrameReady')}</span>}
        {shot.videoUrl && <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded-full">{t('videoAgent.videoReady')}</span>}
        {onDelete && (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3 w-3" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('videoAgent.deleteShot')}</AlertDialogTitle>
                <AlertDialogDescription>{t('videoAgent.deleteShotConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete}>{t('common.confirm')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        )}
      </div>

      <div className="px-3 py-2">
        <PromptField
          label={t('videoAgent.videoDescription')}
          value={localPrompt}
          rows={2}
          onFocus={onFocus}
          onBlur={() => handlePromptBlur('prompt', localPrompt)}
          onChange={setLocalPrompt}
          onSave={(v) => {
            setLocalPrompt(v);
            if (shot.prompt !== v) onUpdate?.({ prompt: v });
          }}
        />
      </div>

      <div className="px-3 pb-2">
        <button type="button" onClick={() => setShowFramePrompts(!showFramePrompts)}
          className="flex items-center gap-1 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors">
          {showFramePrompts ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          {t('videoAgent.frameDescription')}
        </button>
        {showFramePrompts && (
          <div className="mt-1.5 space-y-1.5">
            <PromptField
              label={t('videoAgent.firstFrame')}
              value={localFirstFramePrompt}
              rows={2}
              compact
              onFocus={onFocus}
              onBlur={() => handlePromptBlur('firstFramePrompt', localFirstFramePrompt)}
              onChange={setLocalFirstFramePrompt}
              onSave={(v) => {
                setLocalFirstFramePrompt(v);
                if (shot.firstFramePrompt !== v) onUpdate?.({ firstFramePrompt: v });
              }}
            />
            <PromptField
              label={t('videoAgent.lastFrame')}
              value={localLastFramePrompt}
              rows={2}
              compact
              onFocus={onFocus}
              onBlur={() => handlePromptBlur('lastFramePrompt', localLastFramePrompt)}
              onChange={setLocalLastFramePrompt}
              onSave={(v) => {
                setLocalLastFramePrompt(v);
                if (shot.lastFramePrompt !== v) onUpdate?.({ lastFramePrompt: v });
              }}
            />
          </div>
        )}
      </div>

      {aspectRatio === '9:16' ? (
        // Portrait layout: [First] [Last] [Video] in one row
        <div className="px-3 pb-3 grid grid-cols-[2fr_2fr_3fr] gap-1.5">
          <FramePreview url={shot.firstFrameUrl} status={shot.firstFrameStatus}
            aspectClass="aspect-[9/16]"
            label={t('videoAgent.firstFrame')} failLabel={t('videoAgent.firstFrameFailed')}
            onClick={() => shot.firstFrameUrl && openFrameLightbox(shot.firstFrameUrl)}
            onDownload={shot.firstFrameUrl ? () => handleFrameDownload(shot.firstFrameUrl!, `shot-${shot.index}-first.png`) : undefined}
            onDelete={shot.firstFrameUrl ? () => handleFrameDelete('first') : undefined}
            onUpload={(file) => handleFrameUpload(file, 'first')}
            onRegenerate={() => handleFrameRegenerate('first')}
            onDropMaterial={(d, r) => handleFrameAssignMaterial(d, r, 'first')} />
          <FramePreview url={shot.extractedLastFrameUrl} status={shot.lastFrameStatus}
            aspectClass="aspect-[9/16]"
            label={t('videoAgent.lastFrame')} failLabel={t('videoAgent.lastFrameFailed')}
            onClick={() => shot.extractedLastFrameUrl && openFrameLightbox(shot.extractedLastFrameUrl)}
            onDownload={shot.extractedLastFrameUrl ? () => handleFrameDownload(shot.extractedLastFrameUrl!, `shot-${shot.index}-last.png`) : undefined}
            onDelete={shot.extractedLastFrameUrl ? () => handleFrameDelete('last') : undefined}
            onUpload={(file) => handleFrameUpload(file, 'last')}
            onRegenerate={() => handleFrameRegenerate('last')}
            onDropMaterial={(d, r) => handleFrameAssignMaterial(d, r, 'last')} />
          <div className={cn('rounded-lg overflow-hidden bg-muted border border-border/50 group relative', aspectClass, shot.videoUrl && 'cursor-pointer')}
            onClick={() => shot.videoUrl && setVideoDialogOpen(true)}>
            {shot.videoUrl ? (
              <>
                <video src={resolvedVideoUrl ?? shot.videoUrl} className="w-full h-full object-cover" muted loop playsInline
                  onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)} />
                <div className={cn('absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none', videoPlaying ? 'opacity-0' : 'opacity-100')}>
                  <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40">
                {shot.status === 'failed' ? (
                  <>
                    <AlertCircle className="h-6 w-6 mb-1 text-destructive/60" />
                    <span className="text-xs text-destructive/60 px-2 text-center line-clamp-2">{shot.error || t('videoAgent.generationFailed')}</span>
                  </>
                ) : (
                  <>
                    <Video className="h-6 w-6 mb-1" />
                    <span className="text-xs">{t('videoAgent.video')}</span>
                    {shot.status === 'generating' && (
                      <div className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    )}
                    {shot.status !== 'generating' && shot.firstFrameUrl && (
                      <div className="flex gap-1 mt-2">
                        <button type="button"
                          className="h-7 w-7 rounded bg-muted-foreground/10 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          title={t('videoAgent.uploadVideo')}
                          onClick={(e) => { e.stopPropagation(); videoInputRef.current?.click(); }}>
                          <Upload className="h-3.5 w-3.5" />
                        </button>
                        <button type="button"
                          className="h-7 w-7 rounded bg-muted-foreground/10 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          title={t('videoAgent.generateVideo')}
                          onClick={(e) => { e.stopPropagation(); (onDirectSend || onFillPrompt)?.(`generate video for shot ${shot.index}`); }}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleVideoUpload(file); e.target.value = ''; }} />
              </div>
            )}
          </div>
        </div>
      ) : (
        // Landscape layout: [First] [Video] / [Last] [Video]
        <div className="px-3 pb-3 grid grid-cols-[1fr_1.5fr] grid-rows-2 gap-1.5">
          <FramePreview url={shot.firstFrameUrl} status={shot.firstFrameStatus}
            label={t('videoAgent.firstFrame')} failLabel={t('videoAgent.firstFrameFailed')}
            onClick={() => shot.firstFrameUrl && openFrameLightbox(shot.firstFrameUrl)}
            onDownload={shot.firstFrameUrl ? () => handleFrameDownload(shot.firstFrameUrl!, `shot-${shot.index}-first.png`) : undefined}
            onDelete={shot.firstFrameUrl ? () => handleFrameDelete('first') : undefined}
            onUpload={(file) => handleFrameUpload(file, 'first')}
            onRegenerate={() => handleFrameRegenerate('first')}
            onDropMaterial={(d, r) => handleFrameAssignMaterial(d, r, 'first')} />
          <div className={cn('rounded-lg overflow-hidden bg-muted border border-border/50 row-span-2 group relative', aspectClass, shot.videoUrl && 'cursor-pointer')}
            onClick={() => shot.videoUrl && setVideoDialogOpen(true)}>
            {shot.videoUrl ? (
              <>
                <video src={resolvedVideoUrl ?? shot.videoUrl} className="w-full h-full object-cover" muted loop playsInline
                  onMouseEnter={e => (e.target as HTMLVideoElement).play()}
                  onMouseLeave={e => { const v = e.target as HTMLVideoElement; v.pause(); v.currentTime = 0; }}
                  onPlay={() => setVideoPlaying(true)}
                  onPause={() => setVideoPlaying(false)} />
                <div className={cn('absolute inset-0 flex items-center justify-center transition-opacity pointer-events-none', videoPlaying ? 'opacity-0' : 'opacity-100')}>
                  <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                    <Play className="w-5 h-5 text-white fill-white ml-0.5" />
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40">
                {shot.status === 'failed' ? (
                  <>
                    <AlertCircle className="h-6 w-6 mb-1 text-destructive/60" />
                    <span className="text-xs text-destructive/60 px-2 text-center line-clamp-2">{shot.error || t('videoAgent.generationFailed')}</span>
                  </>
                ) : (
                  <>
                    <Video className="h-6 w-6 mb-1" />
                    <span className="text-xs">{t('videoAgent.video')}</span>
                    {shot.status === 'generating' && (
                      <div className="mt-1 h-3.5 w-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    )}
                    {shot.status !== 'generating' && shot.firstFrameUrl && (
                      <div className="flex gap-1 mt-2">
                        <button type="button"
                          className="h-7 w-7 rounded bg-muted-foreground/10 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          title={t('videoAgent.uploadVideo')}
                          onClick={(e) => { e.stopPropagation(); videoInputRef.current?.click(); }}>
                          <Upload className="h-3.5 w-3.5" />
                        </button>
                        <button type="button"
                          className="h-7 w-7 rounded bg-muted-foreground/10 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                          title={t('videoAgent.generateVideo')}
                          onClick={(e) => { e.stopPropagation(); (onDirectSend || onFillPrompt)?.(`generate video for shot ${shot.index}`); }}>
                          <Sparkles className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </>
                )}
                <input ref={videoInputRef} type="file" accept="video/*" className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) handleVideoUpload(file); e.target.value = ''; }} />
              </div>
            )}
          </div>
          <FramePreview url={shot.extractedLastFrameUrl} status={shot.lastFrameStatus}
            label={t('videoAgent.lastFrame')} failLabel={t('videoAgent.lastFrameFailed')}
            onClick={() => shot.extractedLastFrameUrl && openFrameLightbox(shot.extractedLastFrameUrl)}
            onDownload={shot.extractedLastFrameUrl ? () => handleFrameDownload(shot.extractedLastFrameUrl!, `shot-${shot.index}-last.png`) : undefined}
            onDelete={shot.extractedLastFrameUrl ? () => handleFrameDelete('last') : undefined}
            onUpload={(file) => handleFrameUpload(file, 'last')}
            onRegenerate={() => handleFrameRegenerate('last')}
            onDropMaterial={(d, r) => handleFrameAssignMaterial(d, r, 'last')} />
        </div>
      )}

      <ImageLightbox images={lightboxImages} open={lightboxOpen} onOpenChange={setLightboxOpen} />
      {shot.videoUrl && <VideoPlayerDialog open={videoDialogOpen} onOpenChange={setVideoDialogOpen} videoUrl={resolvedVideoUrl ?? shot.videoUrl} />}
      <FrameGenDialog
        open={frameDialogOpen}
        onOpenChange={setFrameDialogOpen}
        shot={shot}
        shots={shots}
        frameType={frameDialogType}
        aspectRatio={aspectRatio}
        frameModelId={frameModelId}
        materials={materials}
        onAddMaterial={onAddMaterial}
        onRemoveMaterial={onRemoveMaterial}
        onGenerated={(url) => {
          const urlKey = frameDialogType === 'first' ? 'firstFrameUrl' : 'extractedLastFrameUrl';
          const refUrlKey = frameDialogType === 'first' ? 'firstFrameRefUrl' : 'lastFrameRefUrl';
          const statusKey = frameDialogType === 'first' ? 'firstFrameStatus' : 'lastFrameStatus';
          onUpdate?.({ [urlKey]: url, [refUrlKey]: url, [statusKey]: 'completed' });
        }}
      />
    </div>
  );
}

export function WorkshopPanel({ shots, aspectRatio, videoModelId, frameModelId, materials, onAddMaterial, onRemoveMaterial, onUpdateShot, onRemoveShot, onFillPrompt, onDirectSend, onAddShot }: WorkshopPanelProps) {
  const { t } = useTranslation();
  const [selectedExample, setSelectedExample] = useState<ShowcaseExample | null>(null);
  const [exampleDialogOpen, setExampleDialogOpen] = useState(false);

  const prevShotsRef = useRef<StoryboardShot[]>([]);
  useEffect(() => {
    const prev = prevShotsRef.current;
    prevShotsRef.current = shots;
    if (prev.length === 0) return;
    for (const shot of shots) {
      const old = prev.find(s => s.id === shot.id);
      if (!old) continue;
      if ((old.firstFrameStatus !== 'completed' && shot.firstFrameStatus === 'completed') ||
          (old.lastFrameStatus !== 'completed' && shot.lastFrameStatus === 'completed') ||
          (old.status !== 'completed' && shot.status === 'completed')) {
        const el = document.querySelector(`[data-shot-id="${shot.id}"]`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        break;
      }
    }
  }, [shots]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {shots.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground max-w-md px-4">
            <div className="flex items-center justify-center gap-3 mb-4">
              <AixioLogo className="h-8 w-auto text-foreground" />
              <div className="w-px h-6 bg-border" />
              <p className="text-lg font-semibold text-foreground">{t('videoAgent.title')}</p>
            </div>
            <p className="text-sm opacity-70">{t('videoAgent.emptyPrompt')}</p>
            {onAddShot && (
              <Button variant="outline" size="sm" className="mt-4 gap-1.5" onClick={onAddShot}>
                <Film className="h-3.5 w-3.5" />{t('videoAgent.manualEdit')}
              </Button>
            )}
            {SHOWCASES.length > 0 && (
              <div className="mt-8">
                <div className="flex gap-3 flex-wrap justify-center">
                  {SHOWCASES.map(item => (
                    <div key={item.id} className="shrink-0 w-[160px] rounded-lg overflow-hidden border border-border/30 bg-card">
                      <div className="aspect-video relative cursor-pointer group"
                        onClick={() => { setSelectedExample(item); setExampleDialogOpen(true); }}>
                        {item.cover_url ? (
                          <img src={item.cover_url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition-colors">
                          <div className="w-8 h-8 rounded-full bg-background/80 flex items-center justify-center">
                            <Play className="w-4 h-4 text-foreground fill-foreground ml-0.5" />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <ExampleDialog example={selectedExample} open={exampleDialogOpen} onOpenChange={setExampleDialogOpen} />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Film className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">{t('videoAgent.storyboardPreview')}</h2>
              <span className="text-xs text-muted-foreground">{t('videoAgent.shotCountLabel', { count: shots.length })}</span>
            </div>
            {shots.map(shot => (
              <div key={shot.id} data-shot-id={shot.id}>
                <ShotPreviewCard shot={shot} shots={shots} aspectRatio={aspectRatio} videoModelId={videoModelId} frameModelId={frameModelId}
                  materials={materials} onAddMaterial={onAddMaterial} onRemoveMaterial={onRemoveMaterial}
                  onUpdate={onUpdateShot ? (updates) => onUpdateShot(shot.id, updates) : undefined}
                  onDelete={onRemoveShot ? () => onRemoveShot(shot.id) : undefined}
                  onFillPrompt={onFillPrompt} onDirectSend={onDirectSend} />
              </div>
            ))}
            {onAddShot && (
              <button type="button" onClick={onAddShot}
                className="w-full py-3 rounded-xl border-2 border-dashed border-border/50 hover:border-primary/40 text-muted-foreground hover:text-primary text-xs font-medium flex items-center justify-center gap-1.5 transition-colors">
                <Film className="h-3.5 w-3.5" />{t('videoAgent.addShot')}
              </button>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
