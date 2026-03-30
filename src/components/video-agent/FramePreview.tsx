/**
 * FramePreview — Reusable frame preview thumbnail with action overlays
 */
import { useRef, useState } from 'react';
import { ImageIcon, AlertCircle, Download, Trash2, Upload, RefreshCw, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { FrameStatus } from '@/types/storyboard';

interface FramePreviewProps {
  url?: string;
  status: FrameStatus;
  label: string;
  failLabel: string;
  aspectClass?: string;
  onClick?: () => void;
  onDownload?: () => void;
  onDelete?: () => void;
  onUpload?: (file: File) => void;
  onRegenerate?: () => void;
  onDropMaterial?: (displayUrl: string, refUrl: string) => void;
}

export function FramePreview({
  url, status, label, failLabel, aspectClass = 'aspect-video', onClick,
  onDownload, onDelete, onUpload, onRegenerate, onDropMaterial,
}: FramePreviewProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUpload) onUpload(file);
    e.target.value = '';
  };

  const stopProp = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <div
        className={cn('rounded-lg overflow-hidden bg-muted border border-border/50 relative group', aspectClass, url && 'cursor-pointer', isDragOver && 'ring-2 ring-primary border-primary')}
        onClick={url ? onClick : undefined}
        onDragOver={onDropMaterial ? e => { if (e.dataTransfer.types.includes('material-display-url')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setIsDragOver(true); } } : undefined}
        onDragLeave={onDropMaterial ? () => setIsDragOver(false) : undefined}
        onDrop={onDropMaterial ? e => { e.preventDefault(); setIsDragOver(false); const display = e.dataTransfer.getData('material-display-url'); const ref = e.dataTransfer.getData('material-ref-url'); if (display) onDropMaterial(display, ref || display); } : undefined}
      >
        {url ? (
          <>
            <img src={url} alt={label} className="w-full h-full object-cover" />
            {status === 'generating' && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center pointer-events-none">
                <div className="h-6 w-6 rounded-full border-2 border-white border-t-transparent animate-spin" />
              </div>
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors">
              <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {onDownload && (
                  <button type="button" onClick={(e) => { stopProp(e); onDownload(); }}
                    className="h-7 w-7 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                    <Download className="h-3.5 w-3.5" />
                  </button>
                )}
                {onUpload && (
                  <button type="button" onClick={(e) => { stopProp(e); fileInputRef.current?.click(); }}
                    className="h-7 w-7 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                    <Upload className="h-3.5 w-3.5" />
                  </button>
                )}
                {onRegenerate && (
                  <button type="button" onClick={(e) => { stopProp(e); onRegenerate(); }}
                    className="h-7 w-7 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center text-foreground hover:bg-background transition-colors">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
                {onDelete && (
                  <button type="button" onClick={(e) => { stopProp(e); setDeleteOpen(true); }}
                    className="h-7 w-7 rounded bg-background/80 backdrop-blur-sm flex items-center justify-center text-destructive hover:bg-background transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground/40">
            {status === 'failed' ? (
              <>
                <AlertCircle className="h-5 w-5 mb-1 text-destructive/60" />
                <span className="text-[10px] text-destructive/60 px-1 text-center line-clamp-1">{failLabel}</span>
              </>
            ) : (
              <>
                <ImageIcon className="h-5 w-5 mb-1" />
                <span className="text-[10px]">{label}</span>
                {status === 'generating' ? (
                  <div className="mt-1 h-3 w-3 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                ) : (
                  <div className="mt-1 flex gap-1">
                    {onUpload && (
                      <button type="button" onClick={() => fileInputRef.current?.click()}
                        className="h-7 w-7 rounded bg-muted-foreground/10 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                        <Upload className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onRegenerate && (
                      <button type="button" onClick={() => onRegenerate()}
                        className="h-7 w-7 rounded bg-muted-foreground/10 hover:bg-muted-foreground/20 flex items-center justify-center text-muted-foreground/60 hover:text-muted-foreground transition-colors">
                        <Sparkles className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('videoAgent.deleteFrameTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('videoAgent.deleteFrameConfirm')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => { onDelete?.(); setDeleteOpen(false); }}>
              {t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
