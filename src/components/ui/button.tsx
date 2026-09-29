import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        // Solid vermilion — the one true primary action.
        default: "bg-primary text-primary-foreground hover:brightness-[0.92]",
        // Bordered ink — secondary, still clearly a button.
        secondary:
          "border border-foreground/25 bg-transparent text-foreground hover:bg-foreground/[0.06]",
        ghost: "text-foreground hover:bg-foreground/[0.06]",
        // Tertiary — reads as an inline text link, not a button chrome.
        link: "h-auto p-0 text-foreground underline decoration-foreground/30 decoration-1 underline-offset-4 hover:decoration-foreground",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-[0.92]",
      },
      size: {
        default: "h-9 px-3.5 text-sm",
        sm: "h-8 px-3 text-[13px]",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";

export { buttonVariants };
