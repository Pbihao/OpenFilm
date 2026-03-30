/**
 * UserMessageBubble — User message display
 */
import { useState } from 'react';
import { BookmarkPlus, BookmarkCheck } from 'lucide-react';
import type { AgentMessage } from '@/types/video-agent';
import type { ReferenceEntry } from '@/types/storyboard';
import { makeRefEntry } from '@/lib/urlUtils';
import { ImageLightbox } from '@/components/ImageLightbox';

interface UserMessageBubbleProps {
  message: AgentMessage;
  references?: ReferenceEntry[];
  onAddReference?: (entry: ReferenceEntry) => void;
}

export function UserMessageBubble({ message, references = [], onAddReference }: UserMessageBubbleProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  return (
    <div className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 bg-muted text-foreground">
        {message.imageUrls && message.imageUrls.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {message.imageUrls.map((url, i) => {
              const isRef = references.some(r => r.displayUrl === url);
              const canAdd = !isRef && references.length < 3 && !!onAddReference;
              const atLimit = !isRef && references.length >= 3;
              return (
                <div key={i} className="relative group h-16 w-16">
                  <img src={url} alt="" className="h-16 w-16 rounded-lg object-cover cursor-zoom-in" onClick={() => setLightboxUrl(url)} />
                  {message.isUploadingImages && (
                    <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
                      <div className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    </div>
                  )}
                  {!message.isUploadingImages && (
                    isRef ? (
                      <div className="absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full bg-primary flex items-center justify-center" title="Active reference">
                        <BookmarkCheck className="h-3 w-3 text-primary-foreground" />
                      </div>
                    ) : (
                      <button
                        onClick={() => canAdd && onAddReference(makeRefEntry(url))}
                        disabled={atLimit}
                        title={atLimit ? 'Max 3 references' : 'Add as reference'}
                        className={`absolute bottom-0.5 right-0.5 h-5 w-5 rounded-full bg-background/90 border border-border flex items-center justify-center transition-opacity ${atLimit ? 'opacity-30 cursor-not-allowed' : 'opacity-0 group-hover:opacity-100 cursor-pointer hover:bg-background'}`}
                      >
                        <BookmarkPlus className="h-3 w-3 text-muted-foreground" />
                      </button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        )}
        {message.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>}
      </div>
      <ImageLightbox images={lightboxUrl ? [lightboxUrl] : []} open={!!lightboxUrl} onOpenChange={open => { if (!open) setLightboxUrl(null); }} />
    </div>
  );
}
