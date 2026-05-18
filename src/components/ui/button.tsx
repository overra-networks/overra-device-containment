import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0E1C29] disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-[#0E1C29] text-white hover:bg-[#162840] active:bg-[#0A1520]",
        destructive:
          "bg-[#FF3355] text-white hover:bg-[#E8263C] active:bg-[#CC1F36]",
        outline:
          "border border-[#DDE3EA] bg-transparent text-[#0E1C29] hover:bg-[#FFFFFF] hover:border-[#C4CDD7]",
        ghost:
          "bg-transparent text-[#5A7080] hover:bg-[#FFFFFF] hover:text-[#0E1C29]",
        link: "bg-transparent text-[#2B5F8A] underline-offset-4 hover:underline",
        success:
          "bg-[#00875A] text-white font-semibold hover:bg-[#006E49]",
        contain:
          "bg-[#FF3355] text-white text-base font-semibold hover:bg-[#E8263C] active:bg-[#CC1F36] rounded-xl",
        release:
          "border border-[#DDE3EA] bg-transparent text-[#0E1C29] text-base font-semibold hover:bg-[#FFFFFF] rounded-xl hover:border-[#C4CDD7]",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6 text-base",
        xl: "h-14 px-8 text-base w-full",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
