import * as React from "react";
import { cn } from "@/lib/utils";

export interface PillButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

const PillButton = React.forwardRef<HTMLButtonElement, PillButtonProps>(
  ({ className, active, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "compact h-6 sm:h-8 px-2.5 sm:px-4 rounded-lg sm:rounded-full text-[11px] sm:text-sm font-medium whitespace-nowrap",
          "ripple material-motion transition-colors",
          active
            ? "bg-primary/10 text-primary border border-primary/40"
            : "bg-muted/50 text-foreground/70 hover:text-foreground hover:bg-muted border border-transparent hover:border-border/40",
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);
PillButton.displayName = "PillButton";

export { PillButton };
