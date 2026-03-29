import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';

interface VideoDurationSelectorProps {
  durations: number[];
  selectedDuration: number;
  onDurationChange: (duration: number) => void;
  disabled?: boolean;
}

export function VideoDurationSelector({
  durations, selectedDuration, onDurationChange, disabled = false,
}: VideoDurationSelectorProps) {
  if (!durations?.length) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          className={cn(
            "h-6 px-2 gap-1 text-xs font-medium rounded-full",
            "border border-border/50 bg-muted/30 hover:bg-muted",
            "text-muted-foreground hover:text-foreground transition-colors",
            disabled && "opacity-50 pointer-events-none"
          )}
        >
          {selectedDuration}s
          <ChevronDown className="h-3 w-3 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[60px]">
        {durations.map((d) => (
          <DropdownMenuItem key={d} onClick={() => onDurationChange(d)} className="flex items-center justify-between gap-2 text-xs">
            <span>{d}s</span>
            {d === selectedDuration && <Check className="h-3 w-3 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
