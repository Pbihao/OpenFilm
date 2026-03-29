/**
 * StoryboardExport — Standalone version (no Supabase/IndexedDB dependencies)
 */
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Download, Scissors, Play, Pause, Loader2, CheckCircle2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { useFFmpeg, type ClipInput } from '@/hooks/useFFmpeg';
import type { StoryboardShot } from '@/types/storyboard';
import { VideoTrimTimeline } from './VideoTrimTimeline';
import { getVideoBlob } from '@/lib/videoBlobCache';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(1);
  return m > 0 ? `${m}:${s.padStart(4, '0')}` : `${s}s`;
}

function parseTimeInput(value: string): number | null {
  const n = parseFloat(value);
  return isNaN(n) || n < 0 ? null : n;
}

function isShotTrimmed(shot: StoryboardShot, duration: number): boolean {
  if (duration <= 0) return false;
  const startTrimmed = (shot.trimStart ?? 0) > 0.05;
  const endTrimmed = shot.trimEnd != null && Math.abs(shot.trimEnd - duration) > 0.05;
  return startTrimmed || endTrimmed;
}

async function downloadVideo(videoUrl: string, filename?: string): Promise<boolean> {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Failed to fetch video: ${response.status}`);
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || `video_${Date.now()}.mp4`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    return true;
  } catch (error) {
    console.error('Failed to download video:', error);
    return false;
  }
}

function ShotTrimRow({
  shot, onUpdateTrim, onDownload, isDownloading, onDurationLoaded,
}: {
  shot: StoryboardShot;
  onUpdateTrim: (start: number, end: number) => void;
  onDownload: (duration: number) => void;
  isDownloading: boolean;
  onDurationLoaded?: (shotId: string, duration: number) => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const trimStart = shot.trimStart ?? 0;
  const trimEnd = shot.trimEnd ?? duration;

  const onUpdateTrimRef = useRef(onUpdateTrim);
  onUpdateTrimRef.current = onUpdateTrim;
  const shotRef = useRef(shot);
  shotRef.current = shot;
  const onDurationLoadedRef = useRef(onDurationLoaded);
  onDurationLoadedRef.current = onDurationLoaded;

  const handleLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      const d = videoRef.current.duration;
      if (isFinite(d) && d > 0) {
        setDuration(d);
        onDurationLoadedRef.current?.(shot.id, d);
        if (shotRef.current.trimEnd === undefined) {
          onUpdateTrimRef.current(shotRef.current.trimStart ?? 0, d);
        }
      }
    }
  }, [shot.id]);

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (!vid.paused && vid.currentTime >= trimEnd) {
      vid.pause(); vid.currentTime = trimStart; setIsPlaying(false);
    }
    const checkBounds = () => {
      if (vid.currentTime >= trimEnd) { vid.pause(); vid.currentTime = trimStart; setIsPlaying(false); }
    };
    vid.addEventListener('timeupdate', checkBounds);
    return () => vid.removeEventListener('timeupdate', checkBounds);
  }, [trimStart, trimEnd]);

  const togglePlay = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) { vid.pause(); setIsPlaying(false); }
    else {
      if (vid.currentTime < trimStart || vid.currentTime >= trimEnd) vid.currentTime = trimStart;
      vid.play(); setIsPlaying(true);
    }
  }, [isPlaying, trimStart, trimEnd]);

  const handleStartInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseTimeInput(e.target.value);
    if (val !== null && val < trimEnd) {
      onUpdateTrim(val, trimEnd);
      if (videoRef.current) videoRef.current.currentTime = val;
    }
  }, [trimEnd, onUpdateTrim]);

  const handleEndInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseTimeInput(e.target.value);
    if (val !== null && val > trimStart && val <= duration) {
      onUpdateTrim(trimStart, val);
      if (videoRef.current) videoRef.current.currentTime = val;
    }
  }, [trimStart, duration, onUpdateTrim]);

  if (!shot.videoUrl) return null;

  const trimmedDuration = trimEnd - trimStart;
  const trimmed = isShotTrimmed(shot, duration);

  return (
    <div className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/10 text-primary text-xs font-bold">{shot.index}</span>
          <span className="text-sm font-medium text-foreground truncate max-w-[200px]">
            {shot.prompt || t('storyboard.shot.label', { index: shot.index })}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>{duration > 0 ? formatTime(trimmedDuration > 0 ? trimmedDuration : 0) : '--'}</span>
          </div>
          <Button
            size="icon" variant="ghost" className="h-7 w-7"
            onClick={() => onDownload(duration)}
            disabled={isDownloading || duration <= 0}
            title={trimmed ? t('storyboard.export.downloadTrimmed') : t('storyboard.export.downloadOriginal')}
          >
            {isDownloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative w-56 flex-shrink-0 aspect-video rounded-lg overflow-hidden bg-black border border-border/40">
          <video ref={videoRef} src={shot.videoUrl} className="w-full h-full object-contain" onLoadedMetadata={handleLoadedMetadata} onEnded={() => setIsPlaying(false)} preload="metadata" muted />
          <button onClick={togglePlay} className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/30 transition-colors">
            {isPlaying ? <Pause className="w-6 h-6 text-white/80" /> : <Play className="w-6 h-6 text-white/80" />}
          </button>
        </div>

        <div className="flex-1 min-w-0 space-y-2">
          {duration > 0 ? (
            <VideoTrimTimeline videoUrl={shot.videoUrl!} duration={duration} trimStart={trimStart} trimEnd={trimEnd} onTrimChange={onUpdateTrim} videoRef={videoRef as React.RefObject<HTMLVideoElement>} />
          ) : (
            <div className="h-14 rounded-lg bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">{t('storyboard.export.loading')}</div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('storyboard.export.inPoint')}</span>
              <Input type="number" step="0.1" min="0" max={trimEnd} value={trimStart.toFixed(1)} onChange={handleStartInput} disabled={duration <= 0} className="w-20 h-7 text-xs px-2 py-0 rounded-md" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{t('storyboard.export.outPoint')}</span>
              <Input type="number" step="0.1" min={trimStart} max={duration} value={trimEnd.toFixed(1)} onChange={handleEndInput} disabled={duration <= 0} className="w-20 h-7 text-xs px-2 py-0 rounded-md" />
            </div>
            <span className="text-[10px] text-muted-foreground ml-auto">
              {t('storyboard.export.originalDuration', { duration: formatTime(duration) })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface StoryboardExportProps {
  shots: StoryboardShot[];
  onUpdateShot: (id: string, updates: Partial<StoryboardShot>) => void;
  withAudio?: boolean;
}

export function StoryboardExport({ shots, onUpdateShot, withAudio = false }: StoryboardExportProps) {
  const { t } = useTranslation();
  const { loaded, loading, loadError, progress, preload, trimAndConcat, trimSingle, abort } = useFFmpeg();
  const [isExporting, setIsExporting] = useState(false);
  const [downloadingShotId, setDownloadingShotId] = useState<string | null>(null);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);
  const outputUrlRef = useRef<string | null>(null);
  const outputVideoRef = useRef<HTMLVideoElement>(null);
  const outputSectionRef = useRef<HTMLDivElement>(null);
  const videoDurationsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => { outputUrlRef.current = outputUrl; }, [outputUrl]);
  useEffect(() => { return () => { if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current); }; }, []);
  useEffect(() => { preload().catch(() => {}); }, [preload]);

  const completedShots = useMemo(() => shots.filter(s => s.status === 'completed' && s.videoUrl), [shots]);

  const totalTrimmedDuration = useMemo(() => {
    return completedShots.reduce((sum, s) => {
      const start = s.trimStart ?? 0;
      const end = s.trimEnd ?? 0;
      return sum + Math.max(0, end - start);
    }, 0);
  }, [completedShots]);

  const handleExport = useCallback(async () => {
    if (completedShots.length === 0) {
      toast.error(t('storyboard.toast.exportNoVideos'));
      return;
    }
    setIsExporting(true);
    if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
    setOutputUrl(null);
    try {
      const clips: ClipInput[] = completedShots.map(shot => {
        // Use videoDurationsRef as the most accurate duration source (from loaded <video> metadata)
        const totalDuration = videoDurationsRef.current.get(shot.id) ?? shot.trimEnd ?? undefined;
        const knownDuration = totalDuration != null && totalDuration > 0;
        return {
          url: shot.videoUrl!,
          // If duration unknown, use start=0 so needsReencode=false → full copy (safe fallback)
          start: knownDuration ? (shot.trimStart ?? 0) : 0,
          end: shot.trimEnd ?? totalDuration ?? 0,
          totalDuration,
          keepAudio: withAudio,
          blob: getVideoBlob(shot.videoUrl!),
        };
      });
      const blob = await trimAndConcat(clips);
      const url = URL.createObjectURL(blob);
      setOutputUrl(url);
      toast.success(t('storyboard.toast.exportDone'));
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          outputSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    } catch (err: any) {
      if (err.message !== 'Aborted') {
        console.error('[StoryboardExport] export error:', err);
        toast.error(t('storyboard.toast.exportFailed', { error: err.message || t('storyboard.toast.unknownError') }));
      }
    } finally {
      setIsExporting(false);
    }
  }, [completedShots, trimAndConcat, t]);

  const handleDownload = useCallback(() => {
    if (!outputUrl) return;
    const a = document.createElement('a');
    a.href = outputUrl;
    a.download = `storyboard-${Date.now()}.mp4`;
    a.click();
  }, [outputUrl]);

  const handleUpdateTrim = useCallback((shotId: string, start: number, end: number) => {
    onUpdateShot(shotId, { trimStart: start, trimEnd: end });
  }, [onUpdateShot]);

  const handleSingleDownload = useCallback(async (shot: StoryboardShot, videoDuration: number) => {
    if (!shot.videoUrl) return;

    if (!isShotTrimmed(shot, videoDuration)) {
      const filename = `shot_${shot.index}_${Date.now()}.mp4`;
      setDownloadingShotId(shot.id);
      try { await downloadVideo(shot.videoUrl, filename); } finally { setDownloadingShotId(null); }
      return;
    }

    const trimStart = shot.trimStart ?? 0;
    const trimEnd = shot.trimEnd ?? videoDuration;
    if (trimEnd <= 0) { toast.error(t('storyboard.toast.waitVideoLoad')); return; }

    setDownloadingShotId(shot.id);
    try {
      const blob = await trimSingle({ url: shot.videoUrl, start: trimStart, end: trimEnd, totalDuration: videoDuration, keepAudio: withAudio, blob: getVideoBlob(shot.videoUrl) });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shot_${shot.index}_trimmed_${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('storyboard.toast.downloadDone', { index: shot.index }));
    } catch (err: any) {
      console.error('[StoryboardExport] single download error:', err);
      toast.error(t('storyboard.toast.downloadFailed', { error: err.message || t('storyboard.toast.unknownError') }));
    } finally {
      setDownloadingShotId(null);
    }
  }, [trimSingle, t]);

  const progressPercent = progress?.percent ?? 0;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <div className="px-4 py-3 border-b bg-card/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Scissors className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{t('storyboard.export.title')}</span>
            <span className="text-xs text-muted-foreground">
              {t('storyboard.export.shotCount', { count: completedShots.length })}
            </span>
            {totalTrimmedDuration > 0 && (
              <span className="text-xs text-muted-foreground border-l border-border pl-3">
                {t('storyboard.export.totalDuration', { duration: formatTime(totalTrimmedDuration) })}
              </span>
            )}
            {loading && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {progress?.detail ?? t('storyboard.export.loadingEngine')}
              </span>
            )}
            {loadError && !loading && (
              <span className="flex items-center gap-1 text-xs text-destructive" title={loadError}>
                ⚠ FFmpeg 加载失败: {loadError.slice(0, 80)}
              </span>
            )}
            {loaded && !loading && (
              <span className="flex items-center gap-1 text-xs text-emerald-500">
                <CheckCircle2 className="w-3 h-3" /> {t('storyboard.export.ready')}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isExporting ? (
              <Button size="sm" variant="secondary" onClick={abort}>{t('storyboard.export.cancel')}</Button>
            ) : (
              <Button size="sm" className="gap-1.5" disabled={completedShots.length === 0 || loading || isExporting} onClick={handleExport}>
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
                {t('storyboard.export.trimAndConcat')}
              </Button>
            )}
          </div>
        </div>

        {isExporting && progress && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{progress.detail || progress.phase}</span>
              <span>{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-1.5" />
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        {completedShots.map(shot => (
          <ShotTrimRow
            key={shot.id}
            shot={shot}
            onUpdateTrim={(start, end) => handleUpdateTrim(shot.id, start, end)}
            onDownload={(duration) => handleSingleDownload(shot, duration)}
            isDownloading={downloadingShotId === shot.id}
            onDurationLoaded={(shotId, dur) => videoDurationsRef.current.set(shotId, dur)}
          />
        ))}
        {completedShots.length === 0 && (
          <div className="text-center py-12 text-sm text-muted-foreground">{t('storyboard.export.noCompletedShots')}</div>
        )}
      </div>

      {outputUrl && (
        <div ref={outputSectionRef} className="px-4 pb-6">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('storyboard.export.finalVideo')}</span>
              <Button size="sm" variant="outline" className="gap-1.5" onClick={handleDownload}>
                <Download className="w-3.5 h-3.5" /> {t('storyboard.export.downloadMp4')}
              </Button>
            </div>
            <div className="aspect-video rounded-lg overflow-hidden bg-black border border-border/60">
              <video ref={outputVideoRef} src={outputUrl} className="w-full h-full object-contain" controls />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
