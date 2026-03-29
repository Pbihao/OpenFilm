import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { getBlobUrl } from '@/lib/videoBlobCache';

interface VideoTrimTimelineProps {
  videoUrl: string;
  duration: number;
  trimStart: number;
  trimEnd: number;
  onTrimChange: (start: number, end: number) => void;
  videoRef?: React.RefObject<HTMLVideoElement>;
}

const thumbnailCache = new Map<string, ImageBitmap>();

function getThumbCount(duration: number): number {
  if (duration < 3) return 4;
  if (duration < 10) return 6;
  return 10;
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m > 0) return `${m}:${s.toFixed(1).padStart(4, '0')}`;
  return `${s.toFixed(1)}s`;
}

export function VideoTrimTimeline({
  videoUrl, duration, trimStart, trimEnd, onTrimChange, videoRef,
}: VideoTrimTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbnailsReady, setThumbnailsReady] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const [dragging, setDragging] = useState<'start' | 'end' | 'region' | null>(null);
  const wasDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, startVal: 0, endVal: 0 });
  const [playheadPos, setPlayheadPos] = useState(0);

  useEffect(() => {
    if (!videoUrl || duration <= 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cached = thumbnailCache.get(videoUrl);
    if (cached) {
      ctx.drawImage(cached, 0, 0, canvas.width, canvas.height);
      setThumbnailsReady(true);
      return;
    }

    const thumbVideo = document.createElement('video');
    thumbVideo.muted = true;
    thumbVideo.preload = 'auto';

    let cancelled = false;
    const thumbCount = getThumbCount(duration);

    const generateThumbnails = async () => {
      // Use blob URL — avoids CORS cache split and re-download if already fetched
      thumbVideo.src = await getBlobUrl(videoUrl);

      await new Promise<void>((resolve, reject) => {
        thumbVideo.onloadeddata = () => resolve();
        thumbVideo.onerror = () => reject();
      });

      const w = canvas.width;
      const h = canvas.height;
      const thumbW = w / thumbCount;

      for (let i = 0; i < thumbCount; i++) {
        if (cancelled) return;
        const time = (i / thumbCount) * duration + duration / (2 * thumbCount);
        thumbVideo.currentTime = Math.min(time, duration - 0.01);
        await new Promise<void>(resolve => { thumbVideo.onseeked = () => resolve(); });
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => {
            if (!cancelled) ctx.drawImage(thumbVideo, i * thumbW, 0, thumbW, h);
            resolve();
          });
        });
        if (i === 0 && !cancelled) setThumbnailsReady(true);
      }

      if (!cancelled) {
        try {
          const bitmap = await createImageBitmap(canvas);
          thumbnailCache.set(videoUrl, bitmap);
        } catch {}
      }
    };

    generateThumbnails().catch(() => { if (!cancelled) setThumbnailError(true); });

    return () => {
      cancelled = true;
      thumbVideo.onloadeddata = null;
      thumbVideo.onseeked = null;
      thumbVideo.onerror = null;
      thumbVideo.pause();
      thumbVideo.src = '';
      thumbVideo.load();
    };
  }, [videoUrl, duration]);

  useEffect(() => {
    const vid = videoRef?.current;
    if (!vid) return;
    const update = () => { if (duration > 0) setPlayheadPos(vid.currentTime / duration); };
    vid.addEventListener('timeupdate', update);
    return () => vid.removeEventListener('timeupdate', update);
  }, [videoRef, duration]);

  const posToTime = useCallback((clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * duration;
  }, [duration]);

  const seekVideo = useCallback((time: number) => {
    if (videoRef?.current) videoRef.current.currentTime = time;
  }, [videoRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent, type: 'start' | 'end' | 'region') => {
    e.preventDefault();
    e.stopPropagation();
    containerRef.current?.setPointerCapture(e.pointerId);
    wasDraggingRef.current = false;
    setDragging(type);
    dragStartRef.current = { x: e.clientX, startVal: trimStart, endVal: trimEnd };
  }, [trimStart, trimEnd]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging || duration <= 0) return;
    wasDraggingRef.current = true;
    const time = posToTime(e.clientX);
    const MIN_DURATION = 0.2;

    if (dragging === 'start') {
      const newStart = Math.max(0, Math.min(time, trimEnd - MIN_DURATION));
      onTrimChange(newStart, trimEnd);
      seekVideo(newStart);
    } else if (dragging === 'end') {
      const newEnd = Math.min(duration, Math.max(time, trimStart + MIN_DURATION));
      onTrimChange(trimStart, newEnd);
      seekVideo(newEnd);
    } else if (dragging === 'region') {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = e.clientX - dragStartRef.current.x;
      const dTime = (dx / rect.width) * duration;
      const regionLen = dragStartRef.current.endVal - dragStartRef.current.startVal;
      let newStart = dragStartRef.current.startVal + dTime;
      let newEnd = dragStartRef.current.endVal + dTime;
      if (newStart < 0) { newStart = 0; newEnd = regionLen; }
      if (newEnd > duration) { newEnd = duration; newStart = duration - regionLen; }
      onTrimChange(newStart, newEnd);
      seekVideo(newStart);
    }
  }, [dragging, duration, trimStart, trimEnd, posToTime, onTrimChange, seekVideo]);

  const handlePointerUp = useCallback(() => { setDragging(null); }, []);

  const handleTimelineClick = useCallback((e: React.MouseEvent) => {
    if (dragging || wasDraggingRef.current) { wasDraggingRef.current = false; return; }
    const time = posToTime(e.clientX);
    seekVideo(time);
    setPlayheadPos(time / duration);
  }, [dragging, posToTime, seekVideo, duration]);

  const startPercent = duration > 0 ? (trimStart / duration) * 100 : 0;
  const endPercent = duration > 0 ? (trimEnd / duration) * 100 : 100;
  const playheadPercent = playheadPos * 100;

  const ticks = useMemo(() => {
    if (duration <= 0) return [];
    const step = duration <= 5 ? 1 : duration <= 15 ? 2 : duration <= 30 ? 5 : 10;
    const result: { time: number; percent: number }[] = [];
    for (let t = 0; t <= duration; t += step) {
      result.push({ time: t, percent: (t / duration) * 100 });
    }
    return result;
  }, [duration]);

  return (
    <div className="space-y-1">
      <div
        ref={containerRef}
        className="relative h-14 rounded-lg overflow-hidden bg-muted/50 border border-border/60 cursor-pointer select-none"
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onClick={handleTimelineClick}
      >
        <canvas ref={canvasRef} width={800} height={56} className={cn("absolute inset-0 w-full h-full", !thumbnailsReady && "opacity-0")} />
        {!thumbnailsReady && !thumbnailError && (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">加载缩略图...</div>
        )}
        {thumbnailError && <div className="absolute inset-0 bg-muted/30" />}

        <div className="absolute top-0 bottom-0 left-0 bg-background/70 pointer-events-none" style={{ width: `${startPercent}%` }} />
        <div className="absolute top-0 bottom-0 right-0 bg-background/70 pointer-events-none" style={{ width: `${100 - endPercent}%` }} />

        <div
          className="absolute top-0 bottom-0 border-y-2 border-primary/60 cursor-grab active:cursor-grabbing"
          style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%` }}
          onPointerDown={e => handlePointerDown(e, 'region')}
        />

        <div className="absolute top-0 bottom-0 z-10 flex items-center cursor-ew-resize group" style={{ left: `${startPercent}%`, transform: 'translateX(-50%)' }} onPointerDown={e => handlePointerDown(e, 'start')}>
          <div className="w-1 h-full bg-primary rounded-l-sm group-hover:bg-primary/80 transition-colors" />
          <div className="absolute left-1/2 -translate-x-1/2 w-4 h-8 rounded-sm bg-primary/90 flex items-center justify-center">
            <div className="w-0.5 h-3 bg-primary-foreground/70 rounded-full" />
          </div>
        </div>

        <div className="absolute top-0 bottom-0 z-10 flex items-center cursor-ew-resize group" style={{ left: `${endPercent}%`, transform: 'translateX(-50%)' }} onPointerDown={e => handlePointerDown(e, 'end')}>
          <div className="w-1 h-full bg-primary rounded-r-sm group-hover:bg-primary/80 transition-colors" />
          <div className="absolute left-1/2 -translate-x-1/2 w-4 h-8 rounded-sm bg-primary/90 flex items-center justify-center">
            <div className="w-0.5 h-3 bg-primary-foreground/70 rounded-full" />
          </div>
        </div>

        {playheadPercent >= startPercent && playheadPercent <= endPercent && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-destructive z-20 pointer-events-none" style={{ left: `${playheadPercent}%` }}>
            <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-destructive" />
          </div>
        )}
      </div>

      <div className="relative h-4">
        {ticks.map(tick => (
          <span key={tick.time} className="absolute text-[10px] text-muted-foreground -translate-x-1/2" style={{ left: `${tick.percent}%` }}>
            {formatTimecode(tick.time)}
          </span>
        ))}
      </div>
    </div>
  );
}
