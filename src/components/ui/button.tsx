import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl text-sm font-medium transition-[transform,box-shadow,background-color,border-color,color,opacity] duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-theme text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[hsl(var(--gradient-primary)/0.25)] hover:shadow-xl hover:shadow-[hsl(var(--gradient-primary)/0.4)] ripple state-layer",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 hover:scale-[1.02] active:scale-[0.98] shadow-sm ripple state-layer",
        outline: "border border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground hover:border-primary/50 transition-colors ripple state-layer",
        secondary: "bg-secondary text-secondary-foreground hover:scale-[1.02] active:scale-[0.98] hover:bg-secondary/80 ripple state-layer",
        ghost: "hover:bg-accent text-foreground hover:scale-[1.02] ripple state-layer",
        link: "text-primary underline-offset-4 hover:underline ripple",
        icon: "w-11 h-11 rounded-full bg-background/80 backdrop-blur-sm border border-border text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary hover:scale-110 transition-[transform,background-color,border-color,color] duration-300 ripple state-layer",
        glow: "bg-gradient-theme text-white hover:scale-[1.02] active:scale-[0.98] shadow-xl shadow-[hsl(var(--gradient-primary)/0.35)] hover:shadow-2xl hover:shadow-[hsl(var(--gradient-primary)/0.5)] ripple state-layer",
        magnetic: "border border-border bg-transparent text-foreground hover:bg-accent hover:border-primary/50 hover:shadow-lg hover:shadow-primary/20 ripple state-layer",
        amber: "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-amber-500/25 hover:shadow-xl hover:shadow-amber-500/40 ripple state-layer",
        glass: "liquid-glass text-foreground hover:scale-[1.02] active:scale-[0.98] hover:shadow-elevation-2 ripple state-layer",
        chip: "border font-medium transition-colors",
        chipActive: "bg-foreground text-background border-foreground hover:bg-foreground/90",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-8 sm:h-9 rounded-2xl px-3 sm:px-4",
        lg: "h-14 rounded-2xl px-8 text-base",
        icon: "h-11 w-11",
        iconSm: "h-8 w-8 rounded-full",
        chip: "h-6 sm:h-7 px-2.5 sm:px-3 text-[11px] sm:text-xs rounded-lg sm:rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
