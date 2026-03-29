import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface ImageLightboxProps {
  images: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ images, open, onOpenChange }: ImageLightboxProps) {
  if (images.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 bg-black/95 border-none overflow-hidden">
        <DialogTitle className="sr-only">Image Preview</DialogTitle>
        <DialogDescription className="sr-only">Full-size image view</DialogDescription>
        <div className="relative w-full flex items-center justify-center p-4">
          <img
            src={images[0]}
            alt=""
            className="max-w-full max-h-[85vh] object-contain rounded-lg"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
