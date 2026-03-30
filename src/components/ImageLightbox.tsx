import { useEffect } from 'react';

interface ImageLightboxProps {
  images: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ImageLightbox({ images, open, onOpenChange }: ImageLightboxProps) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open || images.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center cursor-zoom-out"
      onClick={() => onOpenChange(false)}
    >
      <img
        src={images[0]}
        alt=""
        className="max-w-[90vw] max-h-[90vh] object-contain select-none"
        onClick={e => e.stopPropagation()}
      />
    </div>
  );
}
