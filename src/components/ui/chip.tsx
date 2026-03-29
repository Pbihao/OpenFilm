import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center justify-center gap-1 shrink-0 font-medium border transition-all cursor-pointer material-motion",
  {
    variants: {
      variant: {
        default: "bg-muted/50 text-foreground/80 border-transparent hover:bg-muted hover:text-foreground",
        active: "bg-primary text-primary-foreground border-primary shadow-sm",
      },
      size: {
        default: "h-7 sm:h-8 px-3 sm:px-3.5 text-xs rounded-xl",
        sm: "h-6 sm:h-7 px-2 sm:px-2.5 text-[10px] sm:text-xs rounded-lg",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof chipVariants> {
  isActive?: boolean;
}

const Chip = React.forwardRef<HTMLButtonElement, ChipProps>(
  ({ className, variant, size, isActive, ...props }, ref) => (
    <button className={cn(chipVariants({ variant: isActive ? "active" : variant, size, className }))} ref={ref} {...props} />
  )
);
Chip.displayName = "Chip";

export { Chip, chipVariants };
