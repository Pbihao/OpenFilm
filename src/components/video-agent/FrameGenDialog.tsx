/**
 * FrameGenDialog — Free-form frame generation with material library.
 *
 * Local-first: images stored as blob URLs, uploaded to fal.ai only at
 * submit time. Materials persist across sessions via localStorage.
 *
 * Features:
 *   - Clipboard paste (Ctrl+V / copy-from-browser)
 *   - Drag & drop anywhere in the dialog
 *   - Multiple file selection
 *   - Hover preview of library items
 *   - Material library persistence (localStorage, max 50 items)
 *   - Import from storyboard shots (从分镜导入)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ImagePlus, Loader2, Sparkles, ImageIcon, AlertCircle, Upload, Film, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Dialog, DialogContent, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { loadConfig } from '@/config';
import { falUploadFile } from '@/lib/fal';
import { generateFrame } from '@/edge-logic/generateFrame';
import type { StoryboardShot } from '@/types/storyboard';
import type { ReferenceImage } from '@/edge-logic/generateFrame';
import type { Material } from '@/types/material';

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function uploadMaterial(mat: Material, persist: boolean): Promise<string> {
  if (mat.apiUrl) return mat.apiUrl;   // already a public CDN URL — skip upload
  if (mat.file) return falUploadFile(mat.file, persist);
  // displayUrl is /api/local-data or https:// — fetch as blob and upload
  const res = await fetch(mat.displayUrl);
  const blob = await res.blob();
  return falUploadFile(new File([blob], mat.name, { type: blob.type }), persist);
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface FrameGenDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shot: StoryboardShot;
  shots: StoryboardShot[];
  frameType: 'first' | 'last';
  aspectRatio: string;
  frameModelId: string;
  materials: Material[];
  onAddMaterial: (material: Material) => void;
  onRemoveMaterial: (id: string) => void;
  onGenerated: (url: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export function FrameGenDialog({
  open, onOpenChange, shot, shots, frameType, aspectRatio, frameModelId,
  materials, onAddMaterial, onRemoveMaterial, onGenerated,
}: FrameGenDialogProps) {
  const { t } = useTranslation();

  const [prompt, setPrompt] = useState('');
  const [attachments, setAttachments] = useState<Material[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [isDragOver, setIsDragOver] = useState(false);
  const [hoveredMat, setHoveredMat] = useState<Material | null>(null);
  const [showShotImport, setShowShotImport] = useState(false);

  const attachInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);
  const libraryScrollRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog opens (no prompt prefill — free-form)
  useEffect(() => {
    if (open) {
      setPrompt('');
      setAttachments([]);
      setError(undefined);
      setIsDragOver(false);
      setHoveredMat(null);
    }
  }, [open]);

  // ─── File processing ────────────────────────────────────────────────────────

  // Core helper: add files to attachments + library
  const processFiles = useCallback((files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    for (const file of images) {
      const mat: Material = {
        id: crypto.randomUUID(),
        displayUrl: URL.createObjectURL(file),
        file,
        name: file.name,
        addedAt: Date.now(),
      };
      setAttachments(prev => [...prev, mat]);
      onAddMaterial(mat);
    }
  }, [onAddMaterial]);

  // Library-only upload (no attach)
  const processLibraryFiles = useCallback((files: File[]) => {
    const images = files.filter(f => f.type.startsWith('image/'));
    for (const file of images) {
      onAddMaterial({
        id: crypto.randomUUID(),
        displayUrl: URL.createObjectURL(file),
        file,
        name: file.name,
        addedAt: Date.now(),
      });
    }
  }, [onAddMaterial]);

  // ─── Paste ──────────────────────────────────────────────────────────────────

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const images = Array.from(e.clipboardData?.items ?? [])
      .filter(i => i.type.startsWith('image/'))
      .map(i => i.getAsFile())
      .filter(Boolean) as File[];
    if (images.length) { e.preventDefault(); processFiles(images); }
  }, [processFiles]);

  // ─── Drag & drop ────────────────────────────────────────────────────────────

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length) processFiles(files);
  }, [processFiles]);

  // ─── Library interaction ─────────────────────────────────────────────────

  const addLibraryItemToAttachments = useCallback((mat: Material) => {
    setAttachments(prev => prev.some(a => a.id === mat.id) ? prev : [...prev, mat]);
    onAddMaterial({ ...mat, addedAt: Date.now() });
  }, [onAddMaterial]);

  const removeAttachment = useCallback((id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  }, []);

  const handleLibraryWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (!libraryScrollRef.current) return;
    e.preventDefault();
    libraryScrollRef.current.scrollLeft += e.deltaY;
  }, []);

  // ─── Import from shots ───────────────────────────────────────────────────

  const importShotFrame = useCallback((s: StoryboardShot, type: 'first' | 'last') => {
    const displayUrl = type === 'first' ? s.firstFrameUrl : s.extractedLastFrameUrl;
    const refUrl = type === 'first' ? s.firstFrameRefUrl : s.lastFrameRefUrl;
    if (!displayUrl) return;
    const mat: Material = {
      id: crypto.randomUUID(),
      displayUrl,
      apiUrl: refUrl ?? (displayUrl.startsWith('https://') ? displayUrl : undefined),
      name: `Shot ${s.index} ${type === 'first' ? '首帧' : '尾帧'}`,
      addedAt: Date.now(),
    };
    onAddMaterial(mat);
  }, [onAddMaterial]);

  const alreadyInLibrary = useCallback((url: string) =>
    materials.some(m => m.displayUrl === url || m.apiUrl === url), [materials]);

  // ─── Generate ───────────────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (generating) return;
    setError(undefined);
    setGenerating(true);
    try {
      if (!frameModelId) throw new Error('Frame model not configured');
      const persist = loadConfig().persistFalUploads ?? false;
      const cdnUrls = await Promise.all(attachments.map(a => uploadMaterial(a, persist)));
      const referenceImages: ReferenceImage[] = cdnUrls.map(url => ({ url, role: 'global_reference' }));

      const url = await generateFrame({
        prompt, referenceImages, aspectRatio, frameModelId,
        shotIndex: shot.index - 1, frameType,
      });

      for (const mat of attachments) {
        onAddMaterial({ ...mat, addedAt: Date.now() });
      }
      onGenerated(url);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  // ─── Derived ────────────────────────────────────────────────────────────────

  const sortedMaterials = [...materials].sort((a, b) => b.addedAt - a.addedAt);
  const isAttached = (id: string) => attachments.some(a => a.id === id);
  const frameLabel = frameType === 'first' ? t('videoAgent.firstFrame') : t('videoAgent.lastFrame');

  const shotFrames = shots.flatMap(s => [
    s.firstFrameUrl ? { shot: s, type: 'first' as const, url: s.firstFrameUrl, refUrl: s.firstFrameRefUrl } : null,
    s.extractedLastFrameUrl ? { shot: s, type: 'last' as const, url: s.extractedLastFrameUrl, refUrl: s.lastFrameRefUrl } : null,
  ]).filter((x): x is NonNullable<typeof x> => x !== null);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!generating) onOpenChange(v); }}>
      <DialogContent
        className="sm:max-w-2xl p-0 gap-0 overflow-hidden"
        onPaste={handlePaste}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag overlay */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 bg-primary/5 border-2 border-dashed border-primary rounded-[inherit] flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <ImagePlus className="h-10 w-10 text-primary mx-auto mb-2" />
              <p className="text-sm font-medium text-primary">拖放图片到这里</p>
            </div>
          </div>
        )}

        {/* Hover preview — top-right corner */}
        {hoveredMat && (
          <div className="absolute top-12 right-12 z-50 bg-background border border-border rounded-xl shadow-xl overflow-hidden pointer-events-none w-44">
            <img src={hoveredMat.displayUrl} alt="" className="w-full h-auto max-h-36 object-contain bg-muted/30" />
            <p className="px-2 py-1 text-[10px] text-muted-foreground truncate">{hoveredMat.name}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-4 border-b border-border/50">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <DialogTitle className="text-sm font-semibold">{frameLabel}</DialogTitle>
          <DialogDescription className="sr-only">Generate frame with custom prompt and reference images</DialogDescription>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* ── Chat-style input ─────────────────────────────────────── */}
          <div className="rounded-xl border border-border bg-background shadow-sm">
            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex gap-2 flex-wrap p-3 pb-0">
                {attachments.map((att) => (
                  <div key={att.id} className="relative group/att shrink-0">
                    <img src={att.displayUrl} alt="" className="h-14 w-14 rounded-lg object-cover border border-border/40" />
                    <button
                      type="button"
                      onClick={() => removeAttachment(att.id)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-background border border-border shadow-sm flex items-center justify-center opacity-0 group-hover/att:opacity-100 transition-opacity hover:bg-destructive/10 hover:border-destructive"
                    >
                      <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <Textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={t('videoAgent.framePromptPlaceholder', { defaultValue: 'Describe the frame...' })}
              rows={4}
              className="border-0 bg-transparent resize-none focus-visible:ring-0 text-sm rounded-none px-4 py-3"
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
            />

            {/* Bottom bar */}
            <div className="flex items-center gap-2 px-3 pb-3">
              <button
                type="button"
                onClick={() => attachInputRef.current?.click()}
                title={t('videoAgent.attachImage', { defaultValue: 'Attach image' })}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <div className="flex-1" />
              <Button
                size="sm"
                onClick={handleGenerate}
                disabled={generating}
                className="gap-1.5 h-8 px-4 rounded-lg"
              >
                {generating
                  ? <><Loader2 className="h-3.5 w-3.5 animate-spin" />{t('videoAgent.generating', { defaultValue: 'Generating...' })}</>
                  : <><Sparkles className="h-3.5 w-3.5" />{t('common.generate', { defaultValue: 'Generate' })}</>}
              </Button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-lg p-3">
              <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* ── Material library ─────────────────────────────────────── */}
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-muted-foreground flex-1">
                {t('videoAgent.materials', { defaultValue: '素材库' })}
                {materials.length > 0 && <span className="ml-1 text-muted-foreground/50">({materials.length})</span>}
              </span>
              {shotFrames.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowShotImport(v => !v)}
                  className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
                >
                  {showShotImport ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  <Film className="h-3 w-3" />
                  <span>从分镜导入</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => libraryInputRef.current?.click()}
                className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
              >
                <Upload className="h-3 w-3" />
                <span>{t('videoAgent.uploadToLibrary', { defaultValue: '上传素材' })}</span>
              </button>
            </div>

            {/* Shot import strip */}
            {showShotImport && shotFrames.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto pb-1 bg-muted/20 rounded-lg p-2"
                style={{ scrollbarWidth: 'none' }}>
                {shotFrames.map(({ shot: s, type, url }) => {
                  const inLib = alreadyInLibrary(url);
                  return (
                    <button
                      key={`${s.id}-${type}`}
                      type="button"
                      onClick={() => importShotFrame(s, type)}
                      disabled={inLib}
                      title={inLib ? '已在素材库' : `添加 Shot ${s.index} ${type === 'first' ? '首帧' : '尾帧'}`}
                      className={cn(
                        'relative shrink-0 rounded-lg overflow-hidden border-2 transition-all',
                        inLib ? 'border-primary/40 opacity-50 cursor-default' : 'border-transparent hover:border-primary/60 hover:scale-[1.04]',
                      )}
                    >
                      <img src={url} alt="" style={{ height: '52px', width: 'auto', maxWidth: '96px', display: 'block' }} />
                      <span className="absolute bottom-0 inset-x-0 text-[9px] text-center bg-black/50 text-white py-0.5 leading-tight">
                        S{s.index} {type === 'first' ? '首' : '尾'}
                      </span>
                      {inLib && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
                          <div className="h-4 w-4 rounded-full bg-primary/80 flex items-center justify-center">
                            <X className="h-2.5 w-2.5 text-white" strokeWidth={3} />
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {/* Library strip */}
            {sortedMaterials.length === 0 ? (
              <div
                onClick={() => libraryInputRef.current?.click()}
                className="flex flex-col items-center justify-center py-7 text-muted-foreground/40 border border-dashed border-border/50 rounded-xl cursor-pointer hover:border-border/80 hover:text-muted-foreground/60 transition-colors"
              >
                <ImageIcon className="h-6 w-6 mb-1.5" />
                <span className="text-xs">点击上传素材，或拖放 / 粘贴图片</span>
              </div>
            ) : (
              <div
                ref={libraryScrollRef}
                onWheel={handleLibraryWheel}
                className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1"
                style={{ scrollbarWidth: 'none' }}
              >
                {sortedMaterials.map((mat) => {
                  const attached = isAttached(mat.id);
                  return (
                    <div
                      key={mat.id}
                      onClick={() => addLibraryItemToAttachments(mat)}
                      onMouseEnter={() => setHoveredMat(mat)}
                      onMouseLeave={() => setHoveredMat(null)}
                      className={cn(
                        'relative shrink-0 rounded-xl overflow-hidden border-2 transition-all cursor-pointer group/mat',
                        attached ? 'border-primary ring-1 ring-primary/40' : 'border-transparent hover:border-border hover:scale-[1.03]',
                      )}
                    >
                      <img
                        src={mat.displayUrl}
                        alt=""
                        style={{ height: '80px', width: 'auto', maxWidth: '160px', display: 'block' }}
                        className="rounded-[10px]"
                      />
                      {/* Delete from library */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveMaterial(mat.id);
                          removeAttachment(mat.id);
                          if (hoveredMat?.id === mat.id) setHoveredMat(null);
                        }}
                        className="absolute top-1 right-1 h-5 w-5 rounded-full bg-background/80 backdrop-blur-sm border border-border/50 flex items-center justify-center opacity-0 group-hover/mat:opacity-100 transition-opacity hover:bg-destructive/10 hover:border-destructive"
                      >
                        <X className="h-3 w-3 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Hidden file inputs */}
        <input
          ref={attachInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) processFiles(Array.from(e.target.files)); e.target.value = ''; }}
        />
        <input
          ref={libraryInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={e => { if (e.target.files) processLibraryFiles(Array.from(e.target.files)); e.target.value = ''; }}
        />
      </DialogContent>
    </Dialog>
  );
}
