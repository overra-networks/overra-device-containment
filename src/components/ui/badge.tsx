import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        success: "bg-[#00875A]/10 text-[#006E49]",
        executed: "bg-[rgba(14,28,41,0.08)] text-[#0E1C29]",
        failed: "bg-[#FF3355]/10 text-[#CC1F36]",
        pending: "bg-[#F59E0B]/12 text-[#B45309]",
        normal: "bg-[#2B5F8A]/10 text-[#2B5F8A]",
        contained: "bg-[#FF3355]/10 text-[#CC1F36]",
        offline: "bg-[#DDE3EA] text-[#5A7080]",
        outline: "border border-[#DDE3EA] text-[#5A7080]",
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
