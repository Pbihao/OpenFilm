import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
}

const StreamingCursor = () => (
  <span className="inline-block w-[2px] h-[1em] bg-emerald-500 animate-blink ml-0.5 align-baseline" />
);

export function MarkdownContent({ content, isStreaming, className }: MarkdownContentProps) {
  return (
    <div className={cn(
      "prose prose-sm dark:prose-invert max-w-none",
      "prose-p:my-1.5 prose-p:leading-relaxed",
      "prose-ul:my-2 prose-ol:my-2 prose-ul:pl-4 prose-ol:pl-4",
      "prose-li:my-0.5",
      "prose-strong:font-semibold prose-strong:text-foreground",
      "prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-3 prose-headings:mb-1.5",
      "prose-code:text-xs prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:before:content-none prose-code:after:content-none",
      "prose-pre:bg-muted prose-pre:text-foreground prose-pre:rounded-lg prose-pre:p-3 prose-pre:my-2",
      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
      className
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{children}</a>
          ),
          pre: ({ children }) => (<pre className="overflow-x-auto text-xs">{children}</pre>),
          p: ({ children }) => (<p className="text-sm leading-relaxed">{children}</p>),
          table: ({ children }) => (
            <div className="overflow-x-auto my-3">
              <table className="w-full text-xs border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-muted/60">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-1.5 text-left text-xs font-semibold border border-border">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-1.5 text-xs border border-border align-top">{children}</td>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-muted/20">{children}</tr>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <StreamingCursor />}
    </div>
  );
}
