/**
 * MaterialLibraryDrawer — left-side material library, side-by-side with storyboard.
 *
 * - Collapsed: 32px Activity Bar-style tab (icon + rotated label + count badge)
 * - Expanded: 220px panel, side-by-side with storyboard (no overlap)
 * - Drag a material onto a FramePreview slot to assign it
 * - Attach material to chat input via hover button
 */
import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Images, X, Plus, Trash2, MessageSquarePlus, Bookmark, Expand } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Material } from '@/types/material';
import type { ReferenceEntry } from '@/types/storyboard';
import { writeSessionFile } from '@/lib/localFs';
import { ImageLightbox } from '@/components/ImageLightbox';

interface MaterialLibraryDrawerProps {
  materials: Material[];
  sessionFolder: string;
  onAddMaterial: (material: Material) => void;
  onRemoveMaterial: (id: string) => void;
  onClearAll: () => void;
  onAttachToChat?: (mat: Material) => void;
  references?: ReferenceEntry[];
  onRemoveReference?: (url: string) => void;
}

export function MaterialLibraryDrawer({
  materials, sessionFolder,
  onAddMaterial, onRemoveMaterial, onClearAll,
  onAttachToChat,
  references = [], onRemoveReference,
}: MaterialLibraryDrawerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [refToRemove, setRefToRemove] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter(f => f.type.startsWith('image/'));
    if (fileArr.length === 0) return;
    for (const file of fileArr) {
      const id = crypto.randomUUID();
      const blobMat: Material = { id, displayUrl: URL.createObjectURL(file), name: file.name, addedAt: Date.now(), file };
      onAddMaterial(blobMat);
      const ext = file.name.split('.').pop() || 'jpg';
      const filename = `materials/mat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.${ext}`;
      writeSessionFile(sessionFolder, filename, file).then(localUrl => {
        if (localUrl) onAddMaterial({ id, displayUrl: localUrl, name: file.name, addedAt: Date.now() });
      }).catch(() => {});
    }
  }, [onAddMaterial, sessionFolder]);

  const handleDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  };

  return (
    <div
      className={cn(
        'flex flex-col flex-shrink-0 border-r border-border/50 bg-muted/10 transition-all duration-200 overflow-hidden',
        open ? 'w-[220px]' : 'w-7',
        isDragOver && 'border-primary/60 bg-primary/5',
      )}
      onDragOver={handleDragOver}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
    >
      {/* ── Collapsed: Activity Bar tab ─────────────────────────────── */}
      {!open && (
        <div
          onClick={() => setOpen(true)}
          className="flex flex-col items-center justify-start pt-3 pb-4 gap-3 h-full cursor-pointer group select-none hover:bg-muted/40 transition-colors"
          title={t('videoAgent.materialsExpand')}
        >
          {/* Icon + badge */}
          <div className="relative">
            <Images className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            {materials.length > 0 && (
              <span className="absolute -top-1.5 -right-2 h-3.5 min-w-3.5 rounded-full bg-primary text-[8px] text-primary-foreground flex items-center justify-center px-0.5 font-medium leading-none">
                {materials.length > 99 ? '99+' : materials.length}
              </span>
            )}
          </div>
          {/* Rotated label */}
          <span
            className="text-[10px] text-muted-foreground/70 group-hover:text-muted-foreground transition-colors"
            style={{ writingMode: 'vertical-rl', textOrientation: 'mixed', letterSpacing: '0.25em' }}
          >
            {t('videoAgent.materials')}
          </span>
        </div>
      )}

      {/* ── Expanded panel ───────────────────────────────────────────── */}
      {open && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="h-12 flex items-center gap-1.5 px-2 border-b border-border/50 shrink-0">
            <Images className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium flex-1 truncate">{t('videoAgent.materialsCount', { count: materials.length })}</span>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={t('videoAgent.materialsAdd')}
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {materials.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title={t('videoAgent.materialsClear')}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{t('videoAgent.materialsClear')}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {t('videoAgent.materialsClearConfirm', { count: materials.length })}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>{t('videoAgent.cancelButton')}</AlertDialogCancel>
                    <AlertDialogAction onClick={onClearAll}>{t('videoAgent.materialsClear')}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <button
              onClick={() => setOpen(false)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title={t('videoAgent.materialsCollapse')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Global references */}
          {references.length > 0 && (
            <div className="px-2 pt-2 pb-1 shrink-0">
              <div className="flex items-center gap-1 mb-1.5">
                <Bookmark className="h-3 w-3 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground">{t('videoAgent.globalReferences')}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {references.map((ref, i) => (
                  <div key={i} className="relative group h-14 w-14 rounded overflow-hidden border border-primary/30">
                    <img src={ref.displayUrl} alt="" className="w-full h-full object-cover cursor-zoom-in" onClick={() => setLightboxUrl(ref.displayUrl)} />
                    {onRemoveReference && (
                      <button
                        onClick={e => { e.stopPropagation(); setRefToRemove(ref.displayUrl); }}
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive"
                      >
                        <X className="h-2.5 w-2.5 text-white" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-1.5 border-b border-border/40" />
            </div>
          )}

          {/* Material grid */}
          <div className="overflow-y-auto flex-1 p-2">
            {materials.length === 0 ? (
              <div
                className={cn(
                  'flex flex-col items-center justify-center h-32 rounded-lg border-2 border-dashed border-border/40 text-muted-foreground/50 text-[10px] gap-1 cursor-pointer hover:border-border transition-colors',
                  isDragOver && 'border-primary/40 text-primary/60',
                )}
                onClick={() => fileInputRef.current?.click()}
              >
                <Images className="h-6 w-6" />
                <span>{t('videoAgent.materialsDrop')}</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1.5">
                {materials.map((mat) => (
                  <div
                    key={mat.id}
                    className="relative group aspect-square rounded overflow-hidden cursor-grab active:cursor-grabbing"
                    draggable
                    onDragStart={e => {
                      e.dataTransfer.setData('material-display-url', mat.displayUrl);
                      e.dataTransfer.setData('material-ref-url', mat.apiUrl || mat.displayUrl);
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                  >
                    <img src={mat.displayUrl} alt={mat.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors rounded flex items-end justify-between p-1 opacity-0 group-hover:opacity-100">
                      <button
                        onClick={e => { e.stopPropagation(); setLightboxUrl(mat.displayUrl); }}
                        title={t('videoAgent.materialsPreview')}
                        className="h-6 w-6 rounded bg-background/80 flex items-center justify-center text-foreground hover:text-primary transition-colors"
                      >
                        <Expand className="h-3 w-3" />
                      </button>
                      <div className="flex gap-1">
                        {onAttachToChat && (
                          <button
                            onClick={e => { e.stopPropagation(); onAttachToChat(mat); }}
                            title={t('videoAgent.materialsAttachToChat')}
                            className="h-6 w-6 rounded bg-background/80 flex items-center justify-center text-foreground hover:text-primary transition-colors"
                          >
                            <MessageSquarePlus className="h-3 w-3" />
                          </button>
                        )}
                        <button
                          onClick={e => { e.stopPropagation(); onRemoveMaterial(mat.id); }}
                          title={t('videoAgent.materialsRemove')}
                          className="h-6 w-6 rounded bg-background/80 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {isDragOver && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/40 rounded">
              <span className="text-xs text-primary font-medium">放开以添加</span>
            </div>
          )}
        </div>
      )}

      <ImageLightbox images={lightboxUrl ? [lightboxUrl] : []} open={!!lightboxUrl} onOpenChange={o => { if (!o) setLightboxUrl(null); }} />

      <AlertDialog open={!!refToRemove} onOpenChange={o => { if (!o) setRefToRemove(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('videoAgent.removeReferenceTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('videoAgent.removeReferenceDesc')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('videoAgent.cancelButton')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (refToRemove) { onRemoveReference?.(refToRemove); setRefToRemove(null); } }}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ''; }}
      />
    </div>
  );
}
