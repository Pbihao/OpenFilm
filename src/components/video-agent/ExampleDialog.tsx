import { Dialog, DialogContent } from '@/components/ui/dialog';
import { useTranslation } from 'react-i18next';
import type { ShowcaseExample } from '@/data/showcases';

interface Props {
  example: ShowcaseExample | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ExampleDialog({ example, open, onOpenChange }: Props) {
  const { t } = useTranslation();
  if (!example) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent key={example.id} className="max-w-2xl sm:max-w-3xl p-0 gap-0 border-0 bg-black max-h-[90vh] flex flex-col overflow-hidden [&>button]:text-white [&>button]:hover:text-white/80">
        {example.video_url && (
          <div className="relative w-full bg-black flex items-center justify-center flex-1 min-h-0">
            <video
              src={example.video_url}
              controls
              autoPlay
              loop
              className="w-full max-h-[70vh] object-contain outline-none border-0 focus:outline-none"
            />
          </div>
        )}

        {(example.prompt || example.before_image_url) && (
          <div className="p-4 space-y-3 bg-background rounded-b-lg shrink-0 max-h-[20vh] overflow-y-auto">
            {example.prompt && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Prompt</p>
                <p className="text-sm text-foreground whitespace-pre-wrap">{example.prompt}</p>
              </div>
            )}
            {example.before_image_url && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Before</p>
                <img src={example.before_image_url} alt="" className="rounded-md max-h-24 object-contain" />
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
