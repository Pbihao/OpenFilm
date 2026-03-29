import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface VideoPlayerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videoUrl: string;
}

export function VideoPlayerDialog({ open, onOpenChange, videoUrl }: VideoPlayerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 bg-black border-none overflow-hidden">
        <DialogTitle className="sr-only">Video Player</DialogTitle>
        <DialogDescription className="sr-only">Video playback</DialogDescription>
        <video
          src={videoUrl}
          controls
          autoPlay
          className="w-full aspect-video"
        />
      </DialogContent>
    </Dialog>
  );
}
