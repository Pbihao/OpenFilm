/**
 * MaterialLibraryDrawer — left-side material library, side-by-side with storyboard.
 *
 * - Collapsed: 32px Activity Bar-style tab (icon + rotated label + count badge)
 * - Expanded: 220px panel, side-by-side with storyboard (no overlap)
 * - Drag a material onto a FramePreview slot to assign it
 * - Attach material to chat input via hover button
 */
import { useState, useRef, useCallback } from 'react';
import { Images, X, Plus, Trash2, MessageSquarePlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import type { Material } from '@/types/material';
import { writeSessionFile } from '@/lib/localFs';

interface MaterialLibraryDrawerProps {
  materials: Material[];
  sessionFolder: string;
  onAddMaterial: (material: Material) => void;
  onRemoveMaterial: (id: string) => void;
  onClearAll: () => void;
  onAttachToChat?: (mat: Material) => void;
}

export function MaterialLibraryDrawer({
  materials, sessionFolder,
  onAddMaterial, onRemoveMaterial, onClearAll,
  onAttachToChat,
}: MaterialLibraryDrawerProps) {
  const [open, setOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
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
          title="展开素材库"
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
            素材库
          </span>
        </div>
      )}

      {/* ── Expanded panel ───────────────────────────────────────────── */}
      {open && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="h-12 flex items-center gap-1.5 px-2 border-b border-border/50 shrink-0">
            <Images className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium flex-1 truncate">素材库 ({materials.length})</span>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="添加素材"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>

            {materials.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <button
                    className="h-6 w-6 flex items-center justify-center rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                    title="清空素材库"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>清空素材库</AlertDialogTitle>
                    <AlertDialogDescription>
                      将删除全部 {materials.length} 个素材，无法撤销。
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>取消</AlertDialogCancel>
                    <AlertDialogAction onClick={onClearAll}>清空</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}

            <button
              onClick={() => setOpen(false)}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="收起"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

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
                <span>拖入或点击添加</span>
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
                      {onAttachToChat && (
                        <button
                          onClick={e => { e.stopPropagation(); onAttachToChat(mat); }}
                          title="发送到对话"
                          className="h-6 w-6 rounded bg-background/80 flex items-center justify-center text-foreground hover:text-primary transition-colors"
                        >
                          <MessageSquarePlus className="h-3 w-3" />
                        </button>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); onRemoveMaterial(mat.id); }}
                        title="删除"
                        className="h-6 w-6 rounded bg-background/80 flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors ml-auto"
                      >
                        <X className="h-3 w-3" />
                      </button>
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
