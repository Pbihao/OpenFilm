/**
 * WorkshopToolbar — Header controls (standalone, simplified)
 */
import { ImageIcon, Film, Trash2, Settings, Scissors, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useTranslation } from 'react-i18next';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { StoryboardConfig } from '@/types/storyboard';
import { VIDEO_MODEL_CAPABILITIES } from '@/types/video-generation';
import { useNavigate } from 'react-router-dom';

interface ModelOption {
  id: string;
  label: string;
}

interface WorkshopToolbarProps {
  config: StoryboardConfig;
  isProcessing: boolean;
  hasMessages: boolean;
  canExport: boolean;
  frameModelOptions: ModelOption[];
  videoModelOptions: ModelOption[];
  onUpdateConfig: (patch: Partial<StoryboardConfig>) => void;
  onClearSession: () => void;
  onOpenExport: () => void;
}

function SimpleModelSelector({
  models, selectedId, onSelect, icon: Icon, label, disabled,
}: {
  models: ModelOption[]; selectedId: string; onSelect: (id: string) => void;
  icon: React.ElementType; label: string; disabled?: boolean;
}) {
  const selected = models.find(m => m.id === selectedId) || models[0];
  if (models.length <= 1) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" disabled={disabled}
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
          <Icon className="h-3.5 w-3.5" />
          <span className="max-w-[100px] truncate">{selected?.label || label}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {models.map(m => (
          <DropdownMenuItem key={m.id} onClick={() => onSelect(m.id)} className="text-xs">
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkshopToolbar({
  config, isProcessing, hasMessages, canExport, frameModelOptions, videoModelOptions,
  onUpdateConfig, onClearSession, onOpenExport,
}: WorkshopToolbarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <>
      <span className="text-sm font-semibold">{t('videoAgent.title')}</span>
      <span className="text-xs text-muted-foreground">{t('videoAgent.subtitle')}</span>

      <div className="flex-1" />

      <Select value={String(config.shotCount || 3)}
        onValueChange={(v) => onUpdateConfig({ shotCount: Number(v) })} disabled={isProcessing}>
        <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          {[1, 2, 3, 4, 5].map((n) => (
            <SelectItem key={n} value={String(n)}>{n} {t('videoAgent.shotCount')}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={config.aspectRatio || '16:9'}
        onValueChange={(v) => onUpdateConfig({ aspectRatio: v })} disabled={isProcessing}>
        <SelectTrigger className="h-7 w-auto gap-1 px-2 text-xs"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="16:9">16:9</SelectItem>
          <SelectItem value="9:16">9:16</SelectItem>
        </SelectContent>
      </Select>

      {frameModelOptions.length > 0 && (
        <SimpleModelSelector models={frameModelOptions} selectedId={config.frameModelId}
          onSelect={(id) => onUpdateConfig({ frameModelId: id })} icon={ImageIcon}
          label={t('videoAgent.frameModel')} disabled={isProcessing} />
      )}
      {videoModelOptions.length > 0 && (
        <SimpleModelSelector models={videoModelOptions} selectedId={config.videoModelId}
          onSelect={(id) => onUpdateConfig({ videoModelId: id })} icon={Film}
          label={t('videoAgent.videoModel')} disabled={isProcessing} />
      )}

      {VIDEO_MODEL_CAPABILITIES[config.videoModelId]?.supportsAudio && (
        <Button
          variant="ghost" size="sm"
          className={`h-7 gap-1.5 px-2 text-xs ${config.withAudio ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          onClick={() => onUpdateConfig({ withAudio: !config.withAudio })}
          disabled={isProcessing}
          title={config.withAudio ? t('videoAgent.withAudioOn') : t('videoAgent.withAudioOff')}
        >
          {config.withAudio ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          <span>{t('videoAgent.withAudio')}</span>
        </Button>
      )}

      {hasMessages && (
        <>
          <Separator orientation="vertical" className="h-5" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" /><span>{t('videoAgent.reset')}</span>
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('videoAgent.resetTitle')}</AlertDialogTitle>
                <AlertDialogDescription>{t('videoAgent.resetDescription')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={onClearSession}>{t('videoAgent.confirmReset')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <Separator orientation="vertical" className="h-5" />
      <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs" onClick={() => navigate('/settings')}>
        <Settings className="h-3.5 w-3.5" /><span>{t('videoAgent.settings')}</span>
      </Button>

      <Button
        size="sm"
        className="h-7 gap-1.5 px-2.5 text-xs bg-orange-500 hover:bg-orange-600 text-white border-0 disabled:opacity-40"
        disabled={!canExport}
        onClick={onOpenExport}
      >
        <Scissors className="h-3.5 w-3.5" />
        <span>{t('videoAgent.trimExport')}</span>
      </Button>
    </>
  );
}
